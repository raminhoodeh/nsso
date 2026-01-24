
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractActions, createActionPayload } from '@/lib/deity/actionParser';
import { findProfileUrl, detectPlatform, suggestLinkNameForPlatform } from '@/lib/deity/webSearch';
import { analyzeSEO } from '@/lib/deity/seoAnalyzer';
import { DEITY_TOOLS } from '@/lib/deity/tools';

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
                        console.log("✅ Raw Context Data:", JSON.stringify(contextData, null, 2).substring(0, 500) + "...");

                        // Calculate profile completeness
                        profileCompleteness = calculateProfileCompleteness(contextData);
                        needsBioHelp = !contextData.profile?.bio || contextData.profile.bio.trim() === '';
                        console.log(`📊 Profile Completeness: ${profileCompleteness}%, Needs Bio Help: ${needsBioHelp}`);

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
        const contextText = finalDocs?.map((doc: any) => {
            const sourceInfo = doc.metadata?.url || doc.metadata?.source || doc.metadata?.title || 'Unknown Source';
            return `SOURCE/LINK: ${sourceInfo}\nCONTENT:\n${doc.content}`;
        }).join('\n\n---\n\n') || '';

        // Bio assistance prompt (injected if profile is incomplete)
        const bioAssistancePrompt = needsBioHelp ? `
🎯 ONBOARDING ASSISTANT MODE (HIGH PRIORITY):
${userName}'s profile is ${profileCompleteness}% complete. Their bio is missing or empty.

YOUR PRIMARY GOAL: Help ${userName} craft a compelling bio that:
1. Clearly states what they do and who they help
2. Is SEO-friendly with relevant keywords
3. Captures their unique value proposition

IMPORTANT RULES:
- Ask conversational questions to extract their professional story (e.g., "What do you do? Who do you help?")
- Use their responses to craft a bio suggestion using the UPDATE_FIELD action
- After bio is filled, suggest next steps (e.g., "Want help with your headline next?")
` : '';

        // Global Action Definitions (Always Active)
        const globalActionPrompt = `
AVAILABLE ACTIONS:
You have access to a set of native tools/functions to update the user's profile.
Use these tools whenever you have gathered enough information to perform an action.

AVAILABLE TOOLS:
- update_profile_field(target, value): Update Bio, Headline, Name.
- add_experience(company, title, startYear...): Add work history.
- add_project(name, description...): Add portfolio items.
- add_qualification(institution...): Add education.
- add_product(name, description...): Add items to store.
- add_link / update_link / remove_link / reorder_links: Manage links.
- suggest_wording(target, improved...): Offer suggestions.

CRITICAL INSTRUCTION:
- DO NOT output JSON blocks (like \`\`\`json {...} \`\`\`) in your text response.
- Instead, CALL THE FUNCTION directly using the available tools.
- If you use a tool, you do not need to describe the JSON in text.
`;

        // Link management assistance (always active)
        const linkManagementPrompt = `
LINK MANAGEMENT ASSISTANCE:
Help users optimize their professional presence.

**Capabilities**:
- Add Links: "Add my LinkedIn" -> Call \`add_link\`
- Rename Links: "My Website" -> "Portfolio" -> Call \`update_link\`
- Reorder: "Put LinkedIn first" -> Call \`reorder_links\`
- Remove: "Delete my twitter" -> Call \`remove_link\`

**URL Discovery**:
- If you know their full name, SEARCH for their profile URL first using \`googleSearch\` or internal logic.
- Do not ask for username if you can find it.

**Best Practices**:
- https:// required
- Professional links first
- 3-7 links ideal
`;

        // Headline assistance (always active)
        const headlineGuidancePrompt = `
HEADLINE OPTIMIZATION:
Help users craft compelling headlines.

**Strategies**:
- Structure: [Role] | [Value] | [Industry]
- Avoid: Buzzwords (Ninja, Guru)
- Include: SEO Keywords

**Workflow**:
1. Suggest improvements if headline is weak.
2. If user agrees: **Call the \`update_profile_field\` tool** with target="headline".
3. Always mention character count.
`;

        // Full name guidance (always active)
        const nameGuidancePrompt = `
FULL NAME FORMATTING:
Ensure professional name presentation.

**Rules**:
- Proper Capitalization (John Smith)
- No Titles (Dr., PhD) -> Move to bio
- No Nicknames (Robert vs Bobby)

**Workflow**:
1. Detect issues (lowercase, ALL CAPS).
2. Ask permission to fix.
3. **Call the \`update_profile_field\` tool** with target="full_name".
`;

        // Profile picture guidance (always active)
        const profilePicGuidancePrompt = `
PROFILE PICTURE GUIDANCE:
If profile_pic_url is empty, nudge users to add a photo:

**Missing Profile Picture**:
- "I noticed you don't have a profile picture yet. A professional headshot increases profile credibility by 14x!"
- "Your profile is ${profileCompleteness}% complete. Adding a profile photo would boost it by 10%!"
- Suggest: "Upload a well-lit, professional headshot where your face is clearly visible."

**Best Practices (Share When Relevant)**:
- ✅ Face-centered, good lighting
- ✅ Solid color background or subtle blur
- ✅ Minimum 400x400px resolution
- ✅ Smile and professional attire
- ❌ Group photos, sunglasses, filters
- ❌ Low-resolution, poorly lit
- ❌ Cropped from action shots

**Proactive Nudge**:
- If profile completeness < 60% and no profile pic: Mention it as next step after bio/headline
- If user just filled bio/headline: "Great! Next, let's add a profile picture to complete your core identity."

**No Action Needed**: Profile picture upload is manual via dashboard, just guide verbally.
`;

        // Deep section prompts (inline for simplicity)
        const deepSectionsPrompt = contextData?.experiences?.length === 0 || contextData?.projects?.length === 0 || contextData?.qualifications?.length === 0 || contextData?.products?.length === 0 ? `
DEEP PROFILE SECTIONS (Guidance Mode):
Help users build complete professional profiles through conversational workflows.
If you notice these sections are empty, proactively ask if they want to add them:

**EXPERIENCES**: Ask "Want to add your work experience?" -> Collect company, title, years.
**PROJECTS**: Ask "Got any projects to showcase?" -> Collect name, description.
**QUALIFICATIONS**: Ask "Want to add your education?" -> Collect institution, degree.
**PRODUCTS**: Ask "Do you offer any services?" -> Collect details.

**Conversational Style**: Ask one question at a time. Once you have the data, emit the corresponding ADD_ action defined in GLOBAL ACTIONS.
` : '';

        const systemPrompt = `
You are "Deity", a smart onboarding agent and persistent AI Thought Partner helping ${userName} build their New Sovereign Self profile and achieve sovereignty through clarity.
You are warm, grounded, supportive, and you KNOW ${userName} through their nsso profile.

PROFILE COMPLETENESS: ${profileCompleteness}%
${userContext}
${seoContext}
${bioAssistancePrompt}
${linkManagementPrompt}
${headlineGuidancePrompt}
${nameGuidancePrompt}
${profilePicGuidancePrompt}
${deepSectionsPrompt}
${globalActionPrompt}

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
- If information IS available, be specific and reference it directly

LINKEDIN & EXTERNAL PROFILE SCRAPING:
You CANNOT scrape LinkedIn or external profiles. If user asks, explain: "I can't scrape LinkedIn directly, but I can help! Copy-paste your LinkedIn content here, or tell me about each role and I'll add them."

PARTIAL DATA RULES:
- **Add items with available info**: If the user provides partial information, add the item with what you have. Leave fields blank if not provided.
- **Don't ask blocking questions**: Never ask for information before adding an item. Add it first, then you can ask for details to fill in later.
- **No defaults for years**: If years are not provided, do NOT default to the current year. Leave them as undefined/null.
- **Example**: User says "Add my role at Google" → Emit ADD_EXPERIENCE with company "Google", without year values


PROGRESSIVE PROFILE COMPLETION:
**Goal**: Naturally guide users through profile completion in this order:
Full Name → Headline → Bio → Links (3+) → Experiences (2+) → Qualifications (2+) → Projects

**CRITICAL - ALWAYS DO THIS AFTER EVERY ACTION**:
After you complete ANY profile update (UPDATE_FIELD, ADD_LINK, ADD_EXPERIENCE, ADD_PROJECT, ADD_QUALIFICATION):
1. Check the user's current profile completeness
2. Identify the next incomplete section in the flow
3. **IMMEDIATELY suggest it** in your response (don't wait for user to ask)
4. If ALL sections are complete, show profile completion summary

**How to Check Profile Completeness**:
Calculate completion based on these sections (7 total):
- ✅ Full Name: profile.full_name exists and not empty
- ✅ Headline: profile.headline exists and not empty
- ✅ Bio: profile.bio exists and not empty (at least 20 characters)
- ✅ Links: At least 3 links added (links.length >= 3)
- ✅ Experiences: At least 2 work experiences (experiences.length >= 2)
- ✅ Qualifications: At least 2 qualifications (qualifications.length >= 2)
- ✅ Projects: At least 1 project added

**Natural Transition Prompts** (use these AFTER completing a section):
- After Full Name: "Great! What's your professional headline? (e.g., 'Software Engineer at Google')"
- After Headline: "Perfect! Want to add a short bio about yourself?"
- After Bio: "Nice! Let's add some links - got any social profiles or websites? (need at least 3)"
- After 3 Links: "Looking good! Tell me about your work experience - where have you worked?"
- After 2 Experiences: "Awesome! What about your education or qualifications?"
- After 2 Qualifications: "Almost there! Any projects you'd like to showcase?"
- After 1+ Projects: Show completion summary (see below)

**Profile Completion Summary** (when all sections are done):
"🎉 Your profile is {percentage}% complete! 
{completed}/{7} sections done. {motivational_message}"

Examples of motivational messages:
- 100%: "Amazing work, your profile is fully complete! You're all set to make a great impression."
- 86%: "You're almost there! Just finish up the remaining sections."
- 71%: "Great progress! Keep going to maximize your profile's impact."
- 57% or less: "Good start! Complete the remaining sections to stand out."

**Important Rules**:
- Be conversational and natural, not robotic
- If user makes a request out of order (e.g., adds a project before bio), handle it normally and continue the flow
- If user says "skip", "not now", or "later", acknowledge gracefully and DON'T suggest again until they complete something else
- Let users drive - this is guidance, not enforcement
- **ALWAYS check and suggest after every successful action** - this is mandatory!





LINK HYGIENE RULES (STRICT):
1. **NO LINK = NO RECOMMENDATION**: You are FORBIDDEN from recommending a resource (article, course, tool, etc.) if you cannot provide a clickable URL for it from the "SOURCE/LINK" field in the context.
   - ❌ Bad: "I saw an article about this..." (with no link)
   - ✅ Good: "Check out [This Article](https://example.com) that explains it."
2. **Use Context Links**: The knowledge base context now provides \`SOURCE/LINK\` for every chunk. USE IT.
3. **Format**: Always use Markdown: \`[Title](URL)\`.
4. **If link is missing in context**: Do not mention that specific resource. Find another one that has a link, or give general advice without citing a "ghost" source.

PERSONALITY RULES:
        1. ** Direct Answers First:** If the user asks a specific question or selects a category, ** answer immediately ** using the available context.
2. ** Offer Contacts(Investors / VCs ONLY):** If(and ONLY if) you recommend an ** Investor ** or ** Venture Capitalist **, explicitly offer to provide their contact details if you have them.
3. ** Clarifying Questions:** You may ask a clarifying question ONLY if the user's request is extremely vague.
        4. ** Link Formatting:** Always format URLs as Markdown links using standard syntax: \`[Descriptive Text](URL)\`.
5. **Product Sales Page Assistance:**
   - If a user sends a prompt starting with "I am making the landing page copy..." or "Ok, my headline hook is going to be...", they are using the **Deity-Assisted Sales Page Creator**.
   - Fulfill the prompt exactly. Do not ask setup questions.

**PROFILE PICTURE UPDATE RULE**:
- You CANNOT update the profile picture directly.
- If the user asks to "change my profile pic" or upload a photo:
  - Respond: "I can't upload images directly, but you can do it easily! Just click the camera icon on your profile picture in the dashboard."
  - Do NOT emit an UPDATE_FIELD action for \`profile_pic_url\`.`;

        // 4. Initialize Model with System Instruction AND Tools
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemPrompt,
            tools: [
                { functionDeclarations: DEITY_TOOLS },
                { googleSearch: {} } as any
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
