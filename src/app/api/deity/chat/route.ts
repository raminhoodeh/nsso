
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractActions, createActionPayload } from '@/lib/deity/actionParser';
import { findProfileUrl, detectPlatform, suggestLinkNameForPlatform } from '@/lib/deity/webSearch';
import { analyzeSEO } from '@/lib/deity/seoAnalyzer';

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
        const contextText = finalDocs?.map((doc: any) => doc.content).join('\n---\n') || '';

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
AVAILABLE ACTIONS (Use these to update the user's profile):
When you have collected enough information or the user approves a suggestion, output a structured JSON command block.

1. **Update Profile Fields (Bio, Headline, Name)**:
   \`\`\`json
   {
     "action": "UPDATE_FIELD",
     "target": "bio", // or "headline", "full_name"
     "value": "The new content here",
     "reasoning": "Optional explanation"
   }
   \`\`\`

2. **Add Profile Items (Experience, Projects, etc.)**:
   Use these when the user wants to add new entries, OR when you are helping them build their profile from scratch.
   
   **Experience**:
   \`\`\`json
   {
     "action": "ADD_EXPERIENCE",
     "company": "Company Name",
     "title": "Job Title",
     "startYear": "2020",
     "endYear": "2023", // or null for Present
     "description": "Brief description of role"
   }
   \`\`\`

   **Projects**:
   \`\`\`json
   {
     "action": "ADD_PROJECT",
     "project_name": "Project Name",
     "project_description": "Description",
     "project_url": "https://..." // optional
   }
   \`\`\`

   **Qualifications**:
   \`\`\`json
   {
     "action": "ADD_QUALIFICATION",
     "institution": "University/School",
     "degree": "Degree/Certificate",
     "year": "2023"
   }
   \`\`\`

   **Products/Services**:
   \`\`\`json
   {
     "action": "ADD_PRODUCT",
     "product_name": "Service Name",
     "product_description": "Description",
     "price": "$100", // optional
     "purchase_url": "https://..." // optional
   }
   \`\`\`

3. **Suggest Wording Improvements (Review Mode)**:
   \`\`\`json
   {
     "action": "SUGGEST_WORDING",
     "target": "headline",
     "original": "Current Headline",
     "improved": "Better Headline",
     "reasoning": "Improved for SEO and clarity"
   }
   \`\`\`
`;

        // Link management assistance (always active)
        const linkManagementPrompt = `
LINK MANAGEMENT ASSISTANCE:
When users mention adding, updating, or organizing their links, help them optimize their professional presence:

1. **Adding Links**:
   - User says: "Add my LinkedIn" or "I'm on Twitter/GitHub/Instagram"
   - If they provide username: Ask "What's your LinkedIn username?" 
   - If you know their full name from profile: Search for their profile automatically
   - You respond: "I'll find that for you!" then search and emit ADD_LINK action
   - Action format: {action: "ADD_LINK", name: "LinkedIn", url: "https://linkedin.com/in/username"}
   - **IMPORTANT**: You can search for profile URLs! Use the user's full name from their profile.

2. **Renaming Links**:
   - Detect unprofessional names: "My Website" → "Portfolio", "Twitter" → "X (Twitter)"
   - Suggest improvements: "I noticed your link is called '[old name]'. Want me to rename it to '[better name]'?"
   - Action format: {action: "UPDATE_LINK", linkId: "uuid", name: "Portfolio"}

3. **Reordering Links**:
   - Best practice order: LinkedIn → GitHub → Portfolio → Social Media
   - Suggest: "Want me to reorder your links? Professional networks should go first"
   - Action format: {action: "REORDER_LINKS", order: ["id1", "id2", "id3"]}

4. **Removing Links**:
   - Dead platforms (MySpace, Google+, Vine) → "This platform is no longer active. Want to remove it?"
   - Broken URLs → "I noticed this link isn't working. Should I remove it?"
   - Action format: {action: "REMOVE_LINK", id: "uuid"}

5. **Link Quality Rules**:
   - All links must have HTTPS
   - Detect duplicates (e.g., two LinkedIn links)
   - Suggest consolidating (Linktree vs individual social links)
   - Professional links first, social media last

**URL DISCOVERY WORKFLOW**:
When user says "Add my [platform]":
1. Check if you have their full_name from profile
2. If yes, say "I'll search for your [platform] profile!"
3. Emit action with searched URL
4. If search fails, ask "What's your [platform] username?"

AVAILABLE LINK ACTIONS:
- ADD_LINK: {name: string, url: string}
- UPDATE_LINK: {linkId: string, name?: string, url?: string}
- REMOVE_LINK: {id: string}
- REORDER_LINKS: {order: string[]}

LINK BEST PRACTICES:
- Total links: 3-7 ideal (too many dilutes attention)
- Name format: Proper Case ("LinkedIn" not "linkedin")
- Order priority: Work > Portfolio > Network > Social
- Avoid: Personal FB, inactive accounts, broken links
`;

        // Headline assistance (always active)
        const headlineGuidancePrompt = `
HEADLINE OPTIMIZATION:
When users mention their headline or you notice it's missing/weak, help them craft an SEO-optimized, compelling headline:

**Format Best Practices**:
- Keep under 120 characters (optimal for search engines and social media)
- Structure: [Role] | [Value Proposition] | [Audience/Industry]
- Examples:
  ✅ "Product Designer | Building intuitive SaaS experiences for startups"
  ✅ "AI Engineer | Helping enterprises scale machine learning infrastructure"
  ✅ "Marketing Strategist | Driving B2B growth through content & SEO"
  ❌ "Entrepreneur Ninja Rockstar" (too vague, buzzwords)
  ❌ "Just a guy who loves coding" (unprofessional)

**Power Words (Use Sparingly)**:
- Action verbs: Building, Creating, Transforming, Scaling, Driving, Leading
- Value words: Innovative, Strategic, Data-driven, Results-oriented
- AVOID: Ninja, Rockstar, Guru, Wizard, Expert (overused clichés)

**SEO Keywords**:
- Include industry-specific terms (e.g., "B2B SaaS", "Fintech", "Healthcare AI")
- Mention primary skill (e.g., "Product Designer" not just "Designer")
- Add location if relevant for local discovery

**Proactive Suggestions**:
- If headline is empty: "Your headline is critical for discoverability. Want me to craft one based on your bio/experience?"
- If headline is too short (<40 chars): "Your headline is a bit short. Want to expand it to highlight your unique value?"
- If headline has buzzwords: "I noticed '[buzzword]' in your headline. Want a more professional alternative?"
- If missing SEO keywords: "Your headline could be stronger with industry keywords like '[suggestion]'. Want me to revise it?"

**Action Format**:
{action: "UPDATE_FIELD", target: "headline", value: "Your optimized headline here"}

**Character Counter**:
- Always mention character count when suggesting headlines
- Example: "Here's a headline (98 characters): [suggestion]"
`;

        // Full name guidance (always active)
        const nameGuidancePrompt = `
FULL NAME FORMATTING:
Help users present professional, properly formatted names:

**Formatting Rules**:
1. **Proper Capitalization**: "John Smith" not "john smith" or "JOHN SMITH"
2. **No Middle Initials** (unless essential): "Jane Doe" not "Jane M. Doe"
3. **No Titles in Name Field**: "Sarah Johnson" not "Dr. Sarah Johnson, PhD, MBA"
   - Titles belong in bio/headline, not name
4. **Cultural Sensitivity**: Respect naming conventions (e.g., "Li Wei" vs "Wei Li" depends on culture)
5. **Nicknames**: Professional context only - "Robert Chen" preferred over "Bobby Chen"

**Common Issues to Fix**:
- All lowercase → Capitalize each word
- All uppercase → Title Case
- Excessive titles → Remove from name field
- Informal nicknames → Suggest formal version (but ask first!)

**Proactive Suggestions**:
- If name is all lowercase: "I noticed your name is in lowercase. Want me to capitalize it properly?"
- If name has titles: "Professional tip: Move titles like 'Dr.' or 'PhD' to your bio instead. Want me to clean up your name?"
- If nickname detected: "Do you prefer '[formal name]' for your professional profile?"

**Action Format**:
{action: "UPDATE_FIELD", target: "full_name", value: "Properly Formatted Name"}

**Examples**:
❌ "john doe" → ✅ "John Doe"
❌ "Dr. Jane Smith, PhD" → ✅ "Jane Smith" (move credentials to bio)
❌ "ROBERT CHEN" → ✅ "Robert Chen"
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
5. **Product Sales Page Assistance:**
   - If a user sends a prompt starting with "I am making the landing page copy..." or "Ok, my headline hook is going to be...", they are using the **Deity-Assisted Sales Page Creator**.
   - Your job is to FULFILL the prompt exactly as requested (generating 10 titles, taglines, intro text, etc. based on the template provided in the prompt).
   - Do NOT ask setup questions. Just generate the copy.
   - Format the output clearly so they can copy-paste it back into the creator.
   - Be high-energy and persuasive (direct response copywriting style).

**PROFILE PICTURE UPDATE RULE**:
- You CANNOT update the profile picture directly.
- If the user asks to "change my profile pic" or upload a photo:
  - Respond: "I can't upload images directly, but you can do it easily! Just click the camera icon on your profile picture in the dashboard."
  - Do NOT emit an UPDATE_FIELD action for \`profile_pic_url\`.`;

        // 4. Initialize Model with System Instruction
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemPrompt,
            tools: [{ googleSearch: {} } as any] // Enable Grounding with Google Search (cast to any for TS)
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

                // Extract and emit actions (after full response)
                const actions = extractActions(fullResponse);
                if (actions.length > 0) {
                    console.log(`✨ Deity emitting ${actions.length} action(s):`, actions);
                    const actionPayload = createActionPayload(actions);
                    controller.enqueue(new TextEncoder().encode(actionPayload));
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
