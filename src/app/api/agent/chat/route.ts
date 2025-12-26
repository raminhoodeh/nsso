
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

export async function POST(req: Request) {
    try {
        const { message, category, history } = await req.json();

        if (!message) {
            return new Response('Message is required', { status: 400 });
        }

        // Auto-detect category from message if not provided
        const categoryKeywords: Record<string, string[]> = {
            'Films / Inspiration': ['film', 'movie', 'cinema', 'documentary', 'watch'],
            'Courses': ['course', 'learn', 'training', 'class', 'education', 'teach', 'study'],
            'AI Tools': ['ai tool', 'automation', 'software', 'app', 'ai'],
            'Career': ['job', 'career', 'resume', 'interview', 'cover letter', 'hire', 'work'],
            'Start-up / Investors': ['investor', 'vc', 'funding', 'startup', 'pitch', 'accelerator', 'grant'],
            'Services': ['service', 'agency', 'branding', 'marketing'],
            'Places': ['place', 'location', 'venue', 'event', 'restaurant', 'bar'],
            "Member's Clubs": ['club', 'membership', 'founder', 'network']
        };

        function detectCategory(msg: string): string | null {
            const lowerMsg = msg.toLowerCase();
            for (const [cat, keywords] of Object.entries(categoryKeywords)) {
                if (keywords.some(kw => lowerMsg.includes(kw))) {
                    return cat;
                }
            }
            return null;
        }

        const detectedCategory = category || detectCategory(message);

        // Determine file filters and threshold based on category
        let filterFiles: string[] | null = null;
        let threshold = 0.4; // Default threshold

        if (detectedCategory && CATEGORY_CONFIG[detectedCategory]) {
            // User specified a category or auto-detected - use its filters
            filterFiles = CATEGORY_CONFIG[detectedCategory].files;
            threshold = CATEGORY_CONFIG[detectedCategory].threshold;
        } else {
            // No category specified - use smart fallback to prevent timeout
            // Search across general/popular categories that are most likely to help
            filterFiles = [
                'nsso Database - AI TOOLS.csv',
                'nsso Database - Courses.csv',
                'nsso Database - Career.csv',
                'nsso Database - Books.csv',
                'nsso Database - Interesting Services.csv'
            ];
            threshold = 0.45; // Slightly higher threshold for general queries
            console.log('⚠️ No category specified, using fallback filters:', filterFiles);
        }

        // Fetch comprehensive user context for personalization
        let userContext = `USER PROFILE:\n(User is not logged in or no profile found. Treat as a new visitor.)`;
        let userName = "User";
        let userId: string | null = null;

        const authHeader = req.headers.get('authorization');
        if (authHeader) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const { data: { user }, error: authError } = await supabase.auth.getUser(token);

                if (user && !authError) {
                    userId = user.id;
                    console.log("✅ Authenticated User ID:", userId);

                    const { data: contextData, error: contextError } = await supabase.rpc('get_agent_context', {
                        user_uuid: userId
                    });

                    if (contextError) {
                        console.error("❌ Error fetching user context:", contextError);
                    } else if (contextData) {
                        console.log("✅ Raw Context Data:", JSON.stringify(contextData, null, 2).substring(0, 500) + "...");

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

                        if (contextData.experiences && contextData.experiences.length > 0) {
                            ctx.push(`\nEXPERIENCE:`);
                            contextData.experiences.forEach((exp: any) => {
                                ctx.push(`- ${exp.job_title} at ${exp.company_name} (${exp.start_year} - ${exp.end_year || 'Present'})`);
                            });
                        }

                        if (contextData.projects && contextData.projects.length > 0) {
                            ctx.push(`\nPROJECTS:`);
                            contextData.projects.forEach((proj: any) => {
                                ctx.push(`- ${proj.project_name}: ${proj.description || ''} (Contribution: ${proj.contribution})`);
                            });
                        }

                        if (contextData.products && contextData.products.length > 0) {
                            ctx.push(`\nPRODUCTS:`);
                            contextData.products.forEach((prod: any) => {
                                ctx.push(`- ${prod.name}: ${prod.description} (Price: ${prod.price}) ${prod.purchase_link ? `[Link: ${prod.purchase_link}]` : ''}`);
                            });
                        }

                        if (contextData.qualifications && contextData.qualifications.length > 0) {
                            ctx.push(`\nQUALIFICATIONS:`);
                            contextData.qualifications.forEach((qual: any) => {
                                ctx.push(`- ${qual.qualification_name} from ${qual.institution} (${qual.end_year})`);
                            });
                        }

                        if (contextData.links && contextData.links.length > 0) {
                            ctx.push(`\nLINKS:`);
                            contextData.links.forEach((link: any) => {
                                ctx.push(`- ${link.link_name}: ${link.link_url}`);
                            });
                        }

                        if (contextData.contacts && contextData.contacts.length > 0) {
                            ctx.push(`\nCONTACT INFO:`);
                            contextData.contacts.forEach((contact: any) => {
                                const label = contact.method === 'other' ? contact.custom_method_name : contact.method;
                                ctx.push(`- ${label}: ${contact.value}`);
                            });
                        }

                        if (ctx.length > 0) {
                            userContext = ctx.join('\n');
                            console.log("✅ Generated User Context String:\n", userContext);
                        }
                    } else {
                        console.warn("⚠️ User authenticated but no profile data returned from RPC");
                    }
                }
            } catch (err) {
                console.error('Error in user context fetching block:', err);
            }
        }

        // 1. Generate embedding for user query
        const embeddingResult = await embeddingModel.embedContent(message);
        const embedding = embeddingResult.embedding.values;

        // 2. Search for relevant context
        console.log(`Searching with category: ${category}, filters:`, filterFiles);

        const { data: documents, error } = await supabase.rpc('hybrid_search', {
            query_embedding: embedding,
            query_text: message,
            match_threshold: threshold,
            match_count: 8,
            filter_files: filterFiles
        });

        if (error) {
            console.error('Hybrid search error:', error);
        }

        console.log(`Found ${documents?.length || 0} documents`);
        if (documents?.length > 0) {
            console.log('First match source:', documents[0].metadata?.source);
        }

        // 3. Re-rank by diversity and user relevance
        const reranked = rerankDocuments(documents || [], message, userContext);
        const finalDocs = reranked.slice(0, Math.min(5, reranked.length));

        // 4. Construct System Prompt
        const contextText = finalDocs?.map((doc: any) => doc.content).join('\n---\n') || '';

        const systemPrompt = `
You are the "nsso agent", a persistent AI Thought Partner helping ${userName} achieve sovereignty through clarity and self-discovery.
You are warm, grounded, supportive, and you KNOW ${userName} deeply through their nsso profile.
${userContext}

CONTEXT FROM KNOWLEDGE BASE:
${contextText}

CRITICAL INSTRUCTIONS:
- ALWAYS reference ${userName}'s unique profile details in your responses to make them feel seen and understood
- Connect recommendations to their specific experiences, projects, products, or stated goals
- If they ask about career advice, reference their actual headline and experience
- When recommending resources, ALWAYS provide at least 3 specific recommendations from the knowledge base
- Each recommendation should include the name/title and a brief explanation of why it's relevant
- If the knowledge base doesn't have enough results, say "I found [X] options" and provide what you have
- Don't just say "I don't have access" if you have ANY relevant information - use what's available
- If they have products/services, reference them by name when relevant
- Make every response feel personally crafted for ${userName}'s unique journey toward sovereignty
- Use the provided context to answer the user's question.
- If the context contains a relevant link or resource, ALWAYS provide the URL formatted as a Markdown link.
- If the context doesn't answer the question, generally support the user or ask for more info.
- Do not make up facts if they aren't in the context.
- Keep responses concise and helpful.

DATA ACCURACY RULES (CRITICAL):
- ONLY use information that appears in the USER PROFILE section above
- NEVER make assumptions or use placeholder information about the user
- If a profile field is missing (e.g., no projects listed, no bio), DO NOT mention it or use "[Project Name]" style placeholders
- If you don't have specific information about the user, make general recommendations without claiming to know their background
- Examples of FORBIDDEN phrases when data is missing:
  ❌ "Given your work at [Company]..."
  ❌ "Your project [Project Name]..."  
  ❌ "Based on your experience as a [Role]..."
- Acceptable alternatives when data is missing:
  ✅ "For someone looking to..."
  ✅ "If you're working on..."
  ✅ "Based on what you're asking..."
- When user information IS available, be specific and reference it directly
- If asked about user's own details and they're not in the profile, respond: "I don't have that information in your profile yet. You can add it in your dashboard."

PERSONALITY RULES:
1. **Direct Answers First:** If the user asks a specific question or selects a category, **answer immediately** using the available context. Do NOT ask clarifying questions unless the request is completely ambiguous (e.g., just "help"). Prioritize giving value over gathering more info.
2. **Offer Contacts (Investors/VCs ONLY):** If (and ONLY if) you recommend an **Investor** or **Venture Capitalist**, explicitly offer to provide their contact details if you have them. Do NOT automatically offer this for other categories (like places, general services) unless the user asks.
   - Example: "I recommend [Investor Name]. Would you like their contact details?"
3. **Clarifying Questions:** You may ask a clarifying question ONLY if the user's request is extremely vague (e.g., "help me"). If the user asks a specific question or selects a category (like "Films"), provide an answer IMMEDIATELY based on the context. Do not delay with "what kind of films?". Give your best recommendations first, then optionally ask if they want something different.
4. **Link Formatting:** Always format URLs as Markdown links using standard syntax: \`[Descriptive Text](URL)\`. Do not output raw URLs.
`;

        // 4. Initialize Model with System Instruction
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemPrompt
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

        // Create a readable stream for the response with lack-of-knowledge detection
        const stream = new ReadableStream({
            async start(controller) {
                let fullResponse = '';

                // Stream chunks as they arrive
                for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    fullResponse += chunkText;
                    controller.enqueue(new TextEncoder().encode(chunkText));
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

                // If LLM lacks knowledge, append helpful tip with context-aware category suggestion
                if (lacksKnowledge) {
                    // Detect most relevant category for this query (reuse auto-detection logic)
                    const categoryKeywords: Record<string, string[]> = {
                        'Films / Inspiration': ['film', 'movie', 'cinema', 'documentary', 'watch', 'inspiration', 'inspire'],
                        'Courses': ['course', 'learn', 'training', 'class', 'education', 'teach', 'study'],
                        'AI Tools': ['ai tool', 'automation', 'software', 'app', 'ai', 'tool'],
                        'Career': ['job', 'career', 'resume', 'interview', 'cover letter', 'hire', 'work'],
                        'Start-up / Investors': ['investor', 'vc', 'funding', 'startup', 'pitch', 'accelerator', 'grant'],
                        'Services': ['service', 'agency', 'branding', 'marketing'],
                        'Places': ['place', 'location', 'venue', 'event', 'restaurant', 'bar'],
                        "Member's Clubs": ['club', 'membership', 'founder', 'network']
                    };

                    function suggestCategory(msg: string): string | null {
                        const lowerMsg = msg.toLowerCase();
                        for (const [cat, keywords] of Object.entries(categoryKeywords)) {
                            if (keywords.some(kw => lowerMsg.includes(kw))) {
                                return cat;
                            }
                        }
                        return null;
                    }

                    const suggestedCategory = suggestCategory(message);

                    let tip = "\n\n💡 **Tip:** ";
                    if (suggestedCategory) {
                        tip += `Try selecting the **${suggestedCategory}** category below to access my specialized recommendation engine with curated resources!`;
                    } else {
                        tip += "Try selecting a specific category below (like Films, Courses, Career, or AI Tools) to access my specialized recommendation engine with curated resources!";
                    }

                    controller.enqueue(new TextEncoder().encode(tip));
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
