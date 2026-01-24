
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractActions, createActionPayload } from '@/lib/deity/actionParser';
import { findProfileUrl, detectPlatform, suggestLinkNameForPlatform } from '@/lib/deity/webSearch';
import { analyzeSEO } from '@/lib/deity/seoAnalyzer';
import { DEITY_TOOLS } from '@/lib/deity/tools';
import { detectCategory, assembleSystemPrompt, detectSectionIntent, CATEGORY_KEYWORDS } from '@/lib/deity/contextManager';
import { verifyLinks } from '@/lib/deity/linkVerifier';

// Initialize Supabase logic
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Category configuration with optimized thresholds
const CATEGORY_CONFIG: Record<string, { files: string[], threshold: number }> = {
    'Films / Inspiration': {
        files: ['nsso Database - Film List.csv'],
        threshold: 0.35 // Lower for creative/broad matches
    },
    'Courses': {
        files: ['nsso Database - Courses.csv'],
        threshold: 0.4
    },
    'AI Tools': {
        files: ['nsso Database - AI TOOLS.csv'],
        threshold: 0.4
    },
    'Career': {
        files: ['nsso Database - Career.csv', 'nsso Database - Cover Letter Structure.csv'],
        threshold: 0.45
    },
    'Services': {
        files: ['nsso Database - Interesting Services.csv'],
        threshold: 0.4
    },
    'Places': {
        files: ['nsso Database - Places and Clubs.csv'],
        threshold: 0.4
    },
    "Member's Clubs": {
        files: ['nsso Database - Places and Clubs.csv'],
        threshold: 0.4
    },
    'Start-up / Investors': {
        files: [
            'nsso Database - Angel Investors.csv', 'nsso Database - Angel Investors 2.csv',
            'nsso Database - Business Grants.csv', 'nsso Database - Business Grants 2.csv',
            'nsso Database - EIS Investors.csv', 'nsso Database - EIS Investors (1).csv',
            'nsso Database - Early Stage Investors.csv', 'nsso Database - Early Stage Investors (1).csv',
            'nsso Database - Family Offices.csv', 'nsso Database - Investor emails.csv',
            'nsso Database - VC Firms.csv', 'nsso Database - VC Investor.csv',
            'nsso Database - Startup Accelerator.csv', 'nsso Database - Startup Accelerators.csv',
            'nsso Database - Pitch Deck Structures.csv', 'nsso Database - Business Technology and Strategy Knowledge.csv'
        ],
        threshold: 0.5 // Higher for precise business matching
    }
};

// Helper: Extract keywords from text for relevance scoring
function extractKeywords(text: string): string[] {
    const stopwords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with'];
    return text.split(/\s+/)
        .filter(word => word.length > 3 && !stopwords.includes(word.toLowerCase()))
        .slice(0, 10);
}

// Helper: Calculate diversity score (penalize documents from same source)
function calculateDiversity(doc: any, allDocs: any[]): number {
    const sameSource = allDocs.filter(d => d.metadata?.source === doc.metadata?.source);
    return 1 / Math.sqrt(sameSource.length);
}

// Helper: Calculate user relevance (boost if doc mentions user's work/interests)  
function calculateUserRelevance(doc: any, userContext: string): number {
    if (!userContext || !doc.content) return 0;
    const keywords = extractKeywords(userContext);
    const matches = keywords.filter(kw =>
        doc.content.toLowerCase().includes(kw.toLowerCase())
    );
    return matches.length / Math.max(keywords.length, 1);
}

// Helper: Re-rank documents by combined scoring
function rerankDocuments(docs: any[], query: string, userContext: string) {
    if (!docs || docs.length === 0) return [];

    return docs
        .map(doc => ({
            ...doc,
            diversityScore: calculateDiversity(doc, docs),
            userRelevance: calculateUserRelevance(doc, userContext)
        }))
        .sort((a, b) => {
            // Weighted: 50% search score, 20% diversity, 30% user relevance
            const scoreA = (a.combined_score || a.similarity || 0) * 0.5 +
                a.diversityScore * 0.2 +
                a.userRelevance * 0.3;
            const scoreB = (b.combined_score || b.similarity || 0) * 0.5 +
                b.diversityScore * 0.2 +
                b.userRelevance * 0.3;
            return scoreB - scoreA;
        });
}

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
    try {
        const { message, category, history } = await req.json();

        if (!message) {
            return new Response('Message is required', { status: 400 });
        }

        // Auto-detect category
        const detectedCategory = category || detectCategory(message);

        // Detect User Intent (Profile vs Knowledge)
        const intents = detectSectionIntent(message, history || []);
        const isProfileIntent = intents.hasLinkIntent || intents.hasExperienceIntent ||
            intents.hasProjectIntent || intents.hasEducationIntent ||
            intents.hasProductIntent ||
            message.toLowerCase().includes('bio') ||
            message.toLowerCase().includes('headline') ||
            message.toLowerCase().includes('help me') ||
            message.toLowerCase().includes('update');

        // Determine file filters and threshold based on category
        let filterFiles: string[] | null = null;
        let threshold = 0.4; // Default threshold
        let skipSearch = false; // Flag to skip RAG

        if (detectedCategory && CATEGORY_CONFIG[detectedCategory]) {
            // User specified a category or auto-detected knowledge topic - use its filters
            filterFiles = CATEGORY_CONFIG[detectedCategory].files;
            threshold = CATEGORY_CONFIG[detectedCategory].threshold;
        } else if (isProfileIntent) {
            // User is managing profile and no explicit knowledge category found.
            // SKIP SEARCH to save time and resources.
            skipSearch = true;
            console.log('⚡ Skipping Knowledge Search (Profile Intent Detected)');
        } else {
            // No category specified AND no clear profile intent - use smart fallback
            filterFiles = [
                'nsso Database - AI TOOLS.csv',
                'nsso Database - Courses.csv',
                'nsso Database - Career.csv',
                'nsso Database - Books.csv',
                'nsso Database - Interesting Services.csv'
            ];
            threshold = 0.45;
            console.log('⚠️ No category/intent specified, using fallback filters:', filterFiles);
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
                    console.log("✅ Authenticated User ID:", userId);

                    const { data: fetchedContext, error: contextError } = await supabase.rpc('get_agent_context', {
                        user_uuid: userId
                    });

                    if (contextError) {
                        console.error("❌ Error fetching user context:", contextError);
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
                console.error('Error in user context fetching block:', err);
            }
        }

        // 3. Search for relevant context (Intelligent Retrieval)
        let documents: any[] = [];
        const SOFT_FILTER_THRESHOLD = 0.60;

        // ONLY perform search if not skipped
        if (!skipSearch) {
            console.log(`Searching with category: ${detectedCategory || 'None'}, filters:`, filterFiles);

            // 1. Generate embedding for user query
            const embeddingResult = await embeddingModel.embedContent(message);
            const embedding = embeddingResult.embedding.values;

            // 1b. Generate embedding for user profile (for re-ranking)
            let profileEmbedding = null;
            if (userContext && userContext.length > 50) {
                try {
                    const contextForEmbedding = userContext.substring(0, 1000);
                    const profileEmbeddingResult = await embeddingModel.embedContent(contextForEmbedding);
                    profileEmbedding = profileEmbeddingResult.embedding.values;
                } catch (err) {
                    console.error("⚠️ Failed to generate profile embedding:", err);
                }
            }

            // Primary Search
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
                console.error("❌ Primary search failed:", primaryError);
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

            if (documents.length > 0) {
                console.log('First match source:', documents[0].metadata?.source);
            }
        }

        // 3. Select final documents (Intelligent Search already ranked them by relevance)
        // We skip the old 'rerankDocuments' function because it doesn't use vector-based profile similarity.
        let finalDocs = documents.slice(0, 5);

        // --- PHASE 4: GROUNDED VERIFICATION (High-Performance "Fail-Open") ---
        try {
            // Extract URLs from metadata
            const urlsToCheck: string[] = [];
            finalDocs.forEach((doc: any) => {
                const url = doc.metadata?.url || doc.metadata?.link;
                if (url && url.startsWith('http')) {
                    urlsToCheck.push(url);
                }
            });

            if (urlsToCheck.length > 0) {
                console.log(`🔍 Verifying ${urlsToCheck.length} links (Fail-Open)...`);
                const deadLinks = await verifyLinks(urlsToCheck);

                if (deadLinks.size > 0) {
                    console.log(`⚠️ Filtering out ${deadLinks.size} dead links:`, Array.from(deadLinks));
                    // Filter out docs with dead links OR strip the link from the doc
                    finalDocs = finalDocs.filter((doc: any) => {
                        const url = doc.metadata?.url || doc.metadata?.link;
                        if (!url) return true; // No link, keep content
                        return !deadLinks.has(url); // Remove if link is dead
                    });
                } else {
                    console.log("✅ All links valid (or timed out/fail-open).");
                }
            }
        } catch (verErr) {
            console.error("⚠️ Link verification failed (bypassing):", verErr);
            // Fail-Open: Do nothing, use docs as is
        }

        // 4. Construct System Prompt
        const contextText = finalDocs?.map((doc: any) => {
            const sourceInfo = doc.metadata?.url || doc.metadata?.source || doc.metadata?.title || 'Unknown Source';
            // Explicitly mark as verified for the LLM
            return `SOURCE/LINK: ${sourceInfo} [VERIFIED]\nCONTENT:\n${doc.content}`;
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
            history
        });

        // 4. Initialize Model with System Instruction AND Tools
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-preview-09-2025", // Reverting to stable pinned version
            systemInstruction: systemPrompt,
            tools: [
                { functionDeclarations: DEITY_TOOLS }
            ]
        });

        // 5. Build Content History
        const chatContents = [];
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
        const result = await model.generateContentStream({
            contents: chatContents
        });

        // Create a readable stream for the response which handles Tool Calls
        const stream = new ReadableStream({
            async start(controller) {
                let fullResponse = '';
                const collectedActions: any[] = [];

                // Stream chunks as they arrive
                for await (const chunk of result.stream) {
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
                            console.log("🛠️ Tool Call Detected:", call.name);

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

                controller.close();
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });

    } catch (err: any) {
        console.error('API Error:', err);
        return new Response(`Internal Server Error: ${err.message}`, { status: 500 });
    }
}
