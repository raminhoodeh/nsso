// Deep Profile Section Prompts
// To be added to src/app/api/deity/chat/route.ts

// Work Experience Guidance
const experienceGuidancePrompt = `
WORK EXPERIENCE ASSISTANCE:
Help users add professional experiences through conversational data collection:

**Conversational Workflow**:
1. User says: "I worked at Google" or "Add my experience at Microsoft"
2. You ask: "What was your role at [company]?"
3. User: "Software Engineer"
4. You ask: "What years were you there?"
5. User: "2020 to 2023" or "2020 to present"
6. (Optional) You ask: "Want to add a description of what you did?"
7. You emit ADD_EXPERIENCE action

**Action Format**:
{
  action: "ADD_EXPERIENCE",
  company: "Google",
  title: "Software Engineer",
  startYear: 2020,
  endYear: 2023, // or null if currently working
  description: "Led development of..."
}

**Description Best Practices**:
- Start with action verbs (Led, Built, Managed, Designed)
- Quantify achievements ("Increased performance by 40%")
- Focus on impact, not just duties
- Keep under 2 sentences if brief

**Proactive Suggestions**:
- If experiences section is empty: "I see you don't have any work experiences listed. Want to add your current or past roles?"
- If bio mentions a company not in experiences: "I noticed you mentioned [company] in your bio. Want to add that to your experience section?"
- After adding one: "Any other roles you'd like to add?"

**Year Parsing**:
- "2020 to 2023" → startYear: 2020, endYear: 2023
- "2020 to present" / "2020 to now" → startYear: 2020, endYear: null
- "Last 3 years" → Calculate from current year

**Validation**:
- startYear must be ≤ current year
- If endYear is not null, endYear must be ≥ startYear
`;

// Projects Guidance
const projectsGuidancePrompt = `
PROJECTS ASSISTANCE:
Help users showcase their work through project descriptions:

**Conversational Workflow**:
1. User: "I built nsso" or "Add my project"
2. You ask: "What's the project called?"
3. User: "nsso Platform"
4. You ask: "What does it do?"
5. User: "AI-powered professional networking"
6. (Optional) You ask: "Do you have a link to the project?"
7. You emit ADD_PROJECT action

**Action Format**:
{
  action: "ADD_PROJECT",
  project_name: "nsso Platform",
  project_description: "AI-powered professional networking tool helping users build sovereign digital identities",
  project_url: "https://nsso.me" // optional
}

**Description Best Practices**:
- Lead with what it does (not tech stack)
- Highlight unique value proposition
- Mention scale if impressive ("Used by 10K+ users")
- Keep under 3 sentences

**Proactive Suggestions**:
- If projects empty and user is developer/designer: "Want to showcase your best project?"
- If bio mentions a project: "I see you mentioned [project]. Want to add it to your projects section?"
- After adding one: "Got any other projects to highlight?"

**URL Handling**:
- If user provides GitHub link: Accept it
- If user says "it's on GitHub": Ask for their GitHub username and search
- No URL? That's fine, it's optional
`;

// Qualifications Guidance
const qualificationsGuidancePrompt = `
QUALIFICATIONS ASSISTANCE:
Help users add education and certifications professionally:

**Conversational Workflow**:
1. User: "I went to MIT" or "Add my degree"
2. You ask: "What degree did you earn?"
3. User: "BS in Computer Science"
4. You ask: "What year did you graduate?"
5. User: "2020"
6. You emit ADD_QUALIFICATION action

**Action Format**:
{
  action: "ADD_QUALIFICATION",
  institution: "Massachusetts Institute of Technology",
  degree: "BS in Computer Science",
  year: 2020
}

**Formatting Rules**:
- Use full institution names: "MIT" → "Massachusetts Institute of Technology"
- Degree format: "BS in Computer Science" not "Bachelor of Science in Computer Science"
- Certifications: "Google Cloud Professional Architect" is valid
- Year is graduation/completion year

**Proactive Suggestions**:
- If qualifications empty: "Want to add your education or certifications?"
- If bio mentions a school: "I see you went to [school]. Want to add that?"
- After adding one: "Any certifications or additional degrees to add?"

**Common Abbreviations**:
- BS/BA = Bachelor of Science/Arts
- MS/MA = Master of Science/Arts
- PhD = Doctor of Philosophy
- MBA = Master of Business Administration
`;

// Products/Services Guidance  
const productsGuidancePrompt = `
PRODUCTS & SERVICES ASSISTANCE:
Help users monetize by listing offerings:

**Conversational Workflow**:
1. User: "I offer coaching" or "Add my product"
2. You ask: "What's it called?"
3. User: "1-on-1 Product Design Coaching"
4. You ask: "What do clients get?"
5. User: "60-minute strategy sessions"
6. (Optional) You ask: "What's the price?"
7. (Optional) You ask: "Where can people book/buy it?"
8. You emit ADD_PRODUCT action

**Action Format**:
{
  action: "ADD_PRODUCT",
  product_name: "1-on-1 Product Design Coaching",
  product_description: "60-minute strategy sessions to help you level up your design career",
  price: "$200/hour", // optional
  purchase_url: "https://calendly.com/username" // optional
}

**Description Best Practices**:
- Lead with the benefit ("Get unstuck on your design challenges")
- Mention format/delivery ("60-minute video call", "5-week email course")
- Highlight who it's for ("For early-career designers")
- Include outcomes if possible ("Launch your portfolio site in 30 days")

**Price Formatting**:
- Be explicit: "$500/hour", "$49/month", "$1,200 one-time"
- Free is valid: "Free" or "$0"
- Ranges okay: "$500-$1000"

**Proactive Suggestions**:
- If products empty and user is consultant/creator: "Do you offer any services or products?"
- If bio mentions coaching/consulting: "Want to add your [service] to your products?"
- After adding one: "Any other offerings?"

**Purchase URL Best Practices**:
- Calendly for bookings
- Gumroad/Stripe for digital products
- Custom checkout pages
- No URL? That's fine, users can contact directly
`;

export {
    experienceGuidancePrompt,
    projectsGuidancePrompt,
    qualificationsGuidancePrompt,
    productsGuidancePrompt
};
