
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { ChatAllowanceError, allowanceResponse } from '@/lib/deity/chat-allowance';
import { openChatBudget, CHAT_MODEL, CHAT_OUTPUT_TOKENS, type ChatBudget } from '@/lib/deity/chat-budget-server';
import { readChatRequest } from '@/lib/deity/chat-request';
import { isNssoProductQuestion } from '@/lib/deity/product-context';
import { chatFailureDetails, type ChatPhase } from '@/lib/deity/chat-diagnostics';
import { startChatWithRecovery } from '@/lib/deity/chat-recovery';
import { createActionPayload } from '@/lib/deity/actionParser';
import { analyzeSEO } from '@/lib/deity/seoAnalyzer';
import { DEITY_TOOLS } from '@/lib/deity/tools';
import { detectCategory, assembleSystemPrompt, detectSectionIntent, detectKnowledgeIntent } from '@/lib/deity/contextManager';
import { assessLinkHealth } from '@/lib/deity/linkVerifier';

// Initialize Supabase logic
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
export const maxDuration = 90;

// Category configuration with optimized thresholds
const CATEGORY_CONFIG: Record<string, { files: string[], threshold: number }> = {
    'Films / Inspiration': {
        files: ['Films.csv'],
        threshold: 0.35 // Lower for creative/broad matches
    },
    'Courses': {
        files: ['COURSES.csv'],
        threshold: 0.4
    },
    'AI Tools': {
        files: ['AI TOOLS.csv', 'AI Job Application Tools.csv', 'AI Business Advice.md'],
        threshold: 0.4
    },
    'Career': {
        files: [
            'Career Coaching.csv', 'Companies Hiring.csv', 
            'Remote Job Boards and Companies - Remote Boards.csv', 
            'Tech PM Job Boards.csv', 'US Tech Companies.csv', 
            'Make Money Online.csv', 'Content Creation Advice.md'
        ],
        threshold: 0.45
    },
    'Services': {
        files: ['SERVICES.csv'],
        threshold: 0.4
    },
    'Places': {
        files: ['PLACES TO GO.csv'],
        threshold: 0.4
    },
    "Member's Clubs": {
        files: ['PLACES TO GO.csv'],
        threshold: 0.4
    },
    'Start-up / Investors': {
        files: [
            'Angel Investor Database.csv', 'EIS Investors.csv', 
            'Family Offices Database.csv', 'UK Business Grants.csv', 
            'VC Investor Database.csv', 'ACCELERATORS.csv',
            'Business_Knowledge.csv', 'Pitch Deck Structures.md'
        ],
        threshold: 0.5 // Higher for precise business matching
    }
};

// Helper: Calculate profile completeness (0-100)
function calculateProfileCompleteness(contextData: any): number {
    if (!contextData) return 0;

    let score = 0;

    // Core Identity (40%)
    if (contextData.profile?.bio) score += 15;
    if (contextData.profile?.headline) score += 15;
    if (contextData.profile?.profile_pic_url) score += 10;

    // Connectivity (20%)
    if (contextData.links?.length > 0) score += 10;
    if (contextData.contacts?.length > 0) score += 10;

    // Professional Depth (30%)
    if (contextData.experiences?.length > 0) score += 10;
    if (contextData.projects?.length > 0) score += 5;
    if (contextData.qualifications?.length > 0) score += 5;

    // Storefront (10%)
    if (contextData.products?.length > 0) score += 10;

    return score;
}


// ... (existing imports)

export async function POST(req: Request) {
    let budget: ChatBudget | undefined;
    let phase: ChatPhase = 'request';
    let requestId = crypto.randomUUID() as string;
    const deadline = Date.now() + 80_000;
    const upstream = new AbortController();
    let consumerCancelled = false;
    const abortForRequest = () => upstream.abort(new DOMException('Chat request cancelled', 'AbortError'));
    const deadlineTimer = setTimeout(() => upstream.abort(new DOMException('Chat deadline reached', 'TimeoutError')), 80_000);
    const cleanup = () => {
        clearTimeout(deadlineTimer);
        req.signal.removeEventListener('abort', abortForRequest);
    };
    if (req.signal.aborted) abortForRequest();
    else req.signal.addEventListener('abort', abortForRequest, { once: true });
    const providerSignal = (timeout: number) => AbortSignal.any([upstream.signal, AbortSignal.timeout(timeout)]);
    try {
        upstream.signal.throwIfAborted();
        const { message, category, history, disableTools } = await readChatRequest(req);
        upstream.signal.throwIfAborted();
        phase = 'allowance';
        budget = await openChatBudget(req, 'chat');
        requestId = budget.requestId;
        phase = 'context';

        // Optimization: Fast-track system follow-ups (Skip Search)
        const isSystemFollowUp = message.startsWith('[SYSTEM:');

        // Auto-detect category
        const productQuestion = isNssoProductQuestion(message);
        const detectedCategory = productQuestion ? null : category || detectCategory(message);

        // Detect User Intent (Profile vs Knowledge)
        const intents = detectSectionIntent(message, history || []);
        const isKnowledgeIntent = detectKnowledgeIntent(message);

        // Profile Intent is now only valid if it's NOT a strong knowledge query
        const isProfileIntent = !isKnowledgeIntent && (
            intents.hasLinkIntent || intents.hasExperienceIntent ||
            intents.hasProjectIntent || intents.hasEducationIntent ||
            intents.hasProductIntent ||
            message.toLowerCase().includes('bio') ||
            message.toLowerCase().includes('headline') ||
            message.toLowerCase().includes('update')
        );

        // Determine file filters and threshold based on category
        let filterFiles: string[] | null = null;
        let threshold = 0.4; // Default threshold
        let skipSearch = false; // Flag to skip RAG

        if (productQuestion) {
            // Similarity search over third-party resources cannot establish our product's identity.
            skipSearch = true;
        } else if (detectedCategory && CATEGORY_CONFIG[detectedCategory]) {
            // User specified a category or auto-detected knowledge topic - use its filters
            filterFiles = CATEGORY_CONFIG[detectedCategory].files;
            threshold = CATEGORY_CONFIG[detectedCategory].threshold;
        } else if (isProfileIntent || isSystemFollowUp) {
            // User is explicitly managing profile (and not asking a question)
            // OR System follow-up message.
            skipSearch = true;
            console.log(`⚡ Skipping Knowledge Search (${isSystemFollowUp ? 'System Follow-Up' : 'Profile Intent'} Detected)`);
        } else {
            // No category specified AND no clear profile intent - use GLOBAL SEARCH (Smart Fallback)
            // By setting filterFiles to null, we search the ENTIRE database.
            filterFiles = null;
            threshold = 0.45;
            console.log('🌍 No category/intent specified, using GLOBAL SEARCH filters.');
        }

        // Fetch comprehensive user context for personalization
        let userContext = `USER PROFILE:\n(User is not logged in or no profile found. Treat as a new visitor.)`;
        let userName = "User";
        let userId: string | null = null;
        let profileCompleteness = 0;
        let needsBioHelp = false;
        let contextData: any = null;
        let seoContext = '';

        const authHeader = req.headers.get('authorization');
        if (authHeader) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const { data: { user }, error: authError } = await supabase.auth.getUser(token);

                if (user && !authError) {
                    userId = user.id;

                    const { data: fetchedContext, error: contextError } = await supabase.rpc('get_agent_context', {
                        user_uuid: userId
                    });

                    if (contextError) {
                        console.error('Deity context unavailable', { code: 'PROFILE_CONTEXT_UNAVAILABLE', requestId });
                    } else if (fetchedContext) {
                        contextData = fetchedContext;

                        // Calculate profile completeness
                        profileCompleteness = calculateProfileCompleteness(contextData);
                        needsBioHelp = !contextData.profile?.bio || contextData.profile.bio.trim() === '';

                        // Calculate SEO Scores
                        if (contextData.profile) {
                            const bioSeo = contextData.profile.bio ? analyzeSEO(contextData.profile.bio, 'bio') : null;
                            const headlineSeo = contextData.profile.headline ? analyzeSEO(contextData.profile.headline, 'headline') : null;

                            if ((bioSeo && bioSeo.score < 8) || (headlineSeo && headlineSeo.score < 8)) {
                                seoContext = `\nSEO & QUALITY ANALYSIS (For your reference to help the user):\n`;
                                if (bioSeo) seoContext += `- Bio Score: ${bioSeo.score}/10. Suggestions: ${bioSeo.suggestions.join(' ')}\n`;
                                if (headlineSeo) seoContext += `- Headline Score: ${headlineSeo.score}/10. Suggestions: ${headlineSeo.suggestions.join(' ')}\n`;
                            }
                        }

                        // Determine user name
                        if (contextData.profile) {
                            userName = contextData.profile.full_name || contextData.profile.username || "User";
                        }

                        // Build rich context string
                        const ctx = [];

                        if (contextData.profile) {
                            ctx.push(`USER PROFILE:`);
                            ctx.push(`Name: ${contextData.profile.full_name}`);
                            if (contextData.profile.headline) ctx.push(`Headline: ${contextData.profile.headline}`);
                            if (contextData.profile.bio) ctx.push(`Bio: ${contextData.profile.bio}`);
                        }

                        // Shortened Context Building to save lines
                        if (contextData.experiences?.length > 0) ctx.push(`\nEXPERIENCE:\n` + contextData.experiences.map((e: any) => `- ${e.job_title} at ${e.company_name} (${e.start_year} - ${e.end_year || 'Present'})`).join('\n'));
                        if (contextData.projects?.length > 0) ctx.push(`\nPROJECTS:\n` + contextData.projects.map((p: any) => `- ${p.project_name}: ${p.description}`).join('\n'));
                        if (contextData.products?.length > 0) ctx.push(`\nPRODUCTS:\n` + contextData.products.map((p: any) => `- ${p.name}: ${p.description}`).join('\n'));
                        if (contextData.qualifications?.length > 0) ctx.push(`\nQUALIFICATIONS:\n` + contextData.qualifications.map((q: any) => `- ${q.qualification_name} from ${q.institution}`).join('\n'));
                        if (contextData.links?.length > 0) ctx.push(`\nLINKS:\n` + contextData.links.map((l: any) => `- ${l.link_name}: ${l.link_url}`).join('\n'));
                        if (contextData.contacts?.length > 0) ctx.push(`\nCONTACTS:\n` + contextData.contacts.map((c: any) => `- ${c.method}: ${c.value}`).join('\n'));

                        if (ctx.length > 0) {
                            userContext = ctx.join('\n');
                        }
                    }
                }
            } catch (err) {
                console.error('Deity context unavailable', chatFailureDetails(err, 'context', requestId));
            }
        }

        // 3. Search for relevant context (Intelligent Retrieval)
        let documents: any[] = [];
        const SOFT_FILTER_THRESHOLD = 0.60;

        // ONLY perform search if not skipped
        if (!skipSearch) {
            console.log('Deity retrieval started', { requestId });

            // 1. Generate embedding for user query
            phase = 'query_embedding';
            budget.addEmbedding(message);
            const embeddingResult = await embeddingModel.embedContent({ content: { parts: [{ text: message }] }, outputDimensionality: 768 } as any, { timeout: 10_000, signal: providerSignal(10_000) });
            const embedding = embeddingResult.embedding.values;

            // 1b. Generate embedding for user profile (for re-ranking)
            let profileEmbedding = null;
            if (userId && userContext && userContext.length > 50) {
                try {
                    phase = 'profile_embedding';
                    const contextForEmbedding = userContext.substring(0, 1000);
                    budget.addEmbedding(contextForEmbedding);
                    const profileEmbeddingResult = await embeddingModel.embedContent({ content: { parts: [{ text: contextForEmbedding }] }, outputDimensionality: 768 } as any, { timeout: 10_000, signal: providerSignal(10_000) });
                    profileEmbedding = profileEmbeddingResult.embedding.values;
                } catch (err) {
                    console.error('Deity optional profile embedding unavailable', chatFailureDetails(err, 'profile_embedding', requestId));
                }
            }

            // Primary Search
            phase = 'retrieval';
            const { data: primaryResults, error: primaryError } = await supabase.rpc('intelligent_search', {
                query_embedding: embedding,
                query_text: message,
                profile_embedding: profileEmbedding,
                match_threshold: threshold,
                match_count: 8,
                filter_files: filterFiles,
                candidate_count: 50
            });

            if (!primaryError && primaryResults) {
                documents = primaryResults;
            } else {
                console.error('Deity retrieval unavailable', { code: 'RETRIEVAL_UNAVAILABLE', requestId });
            }

            // Soft-Filter Logic
            const topScore = documents.length > 0 ? documents[0].combined_score : 0;

            if (detectedCategory && filterFiles && topScore < SOFT_FILTER_THRESHOLD) {
                console.log(`⚠️ Soft-Filter Triggered. Switching to Global Search.`);
                const { data: globalResults, error: globalError } = await supabase.rpc('intelligent_search', {
                    query_embedding: embedding,
                    query_text: message,
                    profile_embedding: profileEmbedding,
                    match_threshold: 0.45,
                    match_count: 8,
                    filter_files: null,
                    candidate_count: 50
                });

                if (!globalError && globalResults?.length > 0) {
                    documents = globalResults;
                }
            }

        }

        // 3. Select final documents (Intelligent Search already ranked them by relevance)
        // We skip the old 'rerankDocuments' function because it doesn't use vector-based profile similarity.
        const finalDocs = documents.slice(0, 5);

        // Assess format without contacting corpus-controlled URLs. Link health and
        // source facts are not live-verified by retrieval.
        phase = 'link_checks';

        // 4. Construct System Prompt
        const contextText = finalDocs?.map((doc: any) => {
            const link = doc.metadata?.url || doc.metadata?.link;
            const sourceInfo = link && assessLinkHealth(link) === 'unverified' ? link
                : doc.metadata?.source || doc.metadata?.title || 'Unknown Source';
            return `SOURCE/LINK: ${String(sourceInfo).slice(0, 2000)} [CURATED SOURCE; LINK HEALTH AND FACTS NOT LIVE-VERIFIED]\nCONTENT:\n${String(doc.content).slice(0, 12000)}`;
        }).join('\n\n---\n\n') || '';

        // --- DYNAMIC SYSTEM PROMPT ASSEMBLY (Phase 2) ---
        // Modularized via contextManager to handle Intent Arbitration and Focus Locking
        const systemPrompt = assembleSystemPrompt({
            userName,
            profileCompleteness,
            userContext,
            seoContext,
            contextText,
            detectedCategory,
            needsBioHelp,
            message,
            history,
            isLoggedIn: !!userId
        });

        // 4. Initialize Model with System Instruction AND Tools
        // Disable tools entirely for Guest Users to prevent any hallucinated profile updates, and save tokens!
        const modelOptions: any = {
            model: CHAT_MODEL,
            systemInstruction: systemPrompt,
            generationConfig: { maxOutputTokens: CHAT_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
        };
        
        if (!disableTools && userId) {
            modelOptions.tools = [{ functionDeclarations: DEITY_TOOLS }];
        }

        const model = genAI.getGenerativeModel(modelOptions);

        // 5. Build Content History
        const chatContents: Content[] = [];
        if (history && Array.isArray(history)) {
            history.forEach((msg: any) => {
                if (msg.role && msg.content) {
                    chatContents.push({
                        role: msg.role === 'model' ? 'model' : 'user',
                        parts: [{ text: msg.content }]
                    });
                }
            });
        }

        // Add current message
        chatContents.push({
            role: 'user',
            parts: [{ text: message }]
        });

        // 6. Generate Response Stream
        phase = 'count_tokens';
        const tokenCount = await model.countTokens({ contents: chatContents }, { timeout: 10_000, signal: providerSignal(10_000) });
        phase = 'completion_allowance';
        await budget.prepare(tokenCount.totalTokens, CHAT_OUTPUT_TOKENS);
        phase = 'generation';
        const result = await startChatWithRecovery({
            generate: () => {
                upstream.signal.throwIfAborted();
                return model.generateContentStream({ contents: chatContents },
                    { timeout: 30_000, signal: providerSignal(40_000) });
            },
            budget,
            deadline,
            reserveRetry: async () => {
                upstream.signal.throwIfAborted();
                console.warn('Deity transient provider 503; one separately budgeted retry', { requestId });
                phase = 'allowance';
                budget = await openChatBudget(req, 'chat');
                requestId = budget.requestId;
                phase = 'completion_allowance';
                await budget.prepare(tokenCount.totalTokens, CHAT_OUTPUT_TOKENS);
                phase = 'generation';
            },
        });
        const activeBudget = budget;
        // The SDK aggregates the same stream in a separate promise; observe its
        // rejection even if a disconnect makes the chunk iterator fail first.
        void result.response.catch(() => undefined);

        // Create a readable stream for the response which handles Tool Calls
        const stream = new ReadableStream({
            start(controller) {
                // Return immediately so stream cancellation can abort the producer
                // even while its asynchronous iterator is waiting for another chunk.
                void (async () => {
                let fullResponse = '';
                try {
                const collectedActions: any[] = [];

                // Stream chunks as they arrive
                for await (const chunk of result.stream) {
                    upstream.signal.throwIfAborted();
                    // Handle Text
                    const chunkText = chunk.text();
                    if (chunkText) {
                        fullResponse += chunkText;
                        controller.enqueue(new TextEncoder().encode(chunkText));
                    }

                    // Handle Function Calls (Tools)
                    const calls = chunk.functionCalls();
                    if (calls && calls.length > 0) {
                        calls.forEach(call => {
                            console.log('Deity tool call received', { requestId });

                            // Map Tool Call back to DeityAction format for frontend
                            const actionBox: any = { ...call.args };

                            // Map function name to action type
                            switch (call.name) {
                                case 'update_profile_field':
                                    actionBox.action = 'UPDATE_FIELD';
                                    break;
                                case 'add_experience':
                                    actionBox.action = 'ADD_EXPERIENCE';
                                    break;
                                case 'add_project':
                                    actionBox.action = 'ADD_PROJECT';
                                    break;
                                case 'add_qualification':
                                    actionBox.action = 'ADD_QUALIFICATION';
                                    break;
                                case 'add_product':
                                    actionBox.action = 'ADD_PRODUCT';
                                    break;
                                case 'add_link':
                                    actionBox.action = 'ADD_LINK';
                                    break;
                                case 'update_link':
                                    actionBox.action = 'UPDATE_LINK';
                                    break;
                                case 'remove_link':
                                    actionBox.action = 'REMOVE_LINK';
                                    break;
                                case 'reorder_links':
                                    actionBox.action = 'REORDER_LINKS';
                                    break;
                                case 'suggest_wording':
                                    actionBox.action = 'SUGGEST_WORDING';
                                    break;
                                default:
                                    // Unknown tool?
                                    actionBox.action = call.name.toUpperCase();
                            }

                            collectedActions.push(actionBox);
                        });
                    }
                }

                // If we collected any actions, append them via the helper protocol
                if (collectedActions.length > 0) {
                    const payload = createActionPayload(collectedActions);
                    controller.enqueue(new TextEncoder().encode(payload));
                    console.log(`🚀 Emitted ${collectedActions.length} Actions via Protocol`);
                }

                // After full response, detect if LLM indicated lack of knowledge
                const lackOfKnowledgePhrases = [
                    "i don't have",
                    "i can't access",
                    "not in my database",
                    "i don't have access",
                    "no information about",
                    "i'm not sure",
                    "i don't know",
                    "unable to find",
                    "couldn't find"
                ];

                const responseLower = fullResponse.toLowerCase();
                const lacksKnowledge = lackOfKnowledgePhrases.some(phrase =>
                    responseLower.includes(phrase)
                );

                if (lacksKnowledge) {
                    const categoryKeywords: Record<string, string[]> = {
                        'Films / Inspiration': ['film', 'movie'],
                        'Courses': ['course', 'learn'],
                        'AI Tools': ['ai', 'tool'],
                        'Career': ['job', 'career'],
                        'Start-up / Investors': ['investor', 'startup']
                    };

                    function suggestCategoryStreaming(msg: string): string | null {
                        const lowerMsg = msg.toLowerCase();
                        for (const [cat, keywords] of Object.entries(categoryKeywords)) {
                            if (keywords.some(kw => lowerMsg.includes(kw))) {
                                return cat;
                            }
                        }
                        return null;
                    }

                    const suggestedCat = suggestCategoryStreaming(message);
                    if (suggestedCat && suggestedCat !== category) {
                        const tip = `\n\n💡 Tip: I noticed you were asking about ${suggestedCat}. Try selecting that category below for better search results!`;
                        controller.enqueue(new TextEncoder().encode(tip));
                    }
                }

                const response = await result.response;
                await activeBudget.finish(response.usageMetadata);
                if (!fullResponse.trim() && collectedActions.length === 0) throw new Error('Empty provider response');
                controller.close();
                } catch (error) {
                    await activeBudget.finish();
                    if (consumerCancelled || req.signal.aborted) {
                        try { controller.close(); } catch { /* The consumer already cancelled. */ }
                        return;
                    }
                    const failure = chatFailureDetails(error, 'stream', requestId);
                    console.error('Deity chat failure', failure);
                    // Headers may already be sent. Finish with an explicit, safe message
                    // instead of a broken HTTP body that the UI mislabels as no connection.
                    try {
                        controller.enqueue(new TextEncoder().encode(`${fullResponse ? '\n\n' : ''}${failure.message}`));
                        controller.close();
                    } catch { /* Client disconnected; retain the reservation and diagnostic. */ }
                } finally { cleanup(); }
                })();
            },
            async cancel() {
                consumerCancelled = true;
                upstream.abort(new DOMException('Chat response cancelled', 'AbortError'));
                cleanup();
                // Reservation remains charged when final provider usage is unknown.
                await activeBudget.finish();
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
                'X-Deity-Request-Id': requestId,
            },
        });

    } catch (err: unknown) {
        upstream.abort();
        cleanup();
        await budget?.finish();
        if (req.signal.aborted) return Response.json({ error: 'This chat request was cancelled.', code: 'chat_cancelled' }, {
            status: 499, headers: { 'Cache-Control': 'no-store', 'X-Deity-Request-Id': requestId },
        });
        if (err instanceof ChatAllowanceError) return allowanceResponse(err);
        const failure = chatFailureDetails(err, phase, requestId);
        console.error('Deity chat failure', failure);
        return Response.json({ error: failure.message, code: failure.code, requestId }, { status: 503,
            headers: { 'Cache-Control': 'no-store', 'X-Deity-Request-Id': requestId } });
    }
}
