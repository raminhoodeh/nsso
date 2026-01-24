// Deep Profile Section Prompts
// To be added to src/app/api/deity/chat/route.ts

// Work Experience Guidance
const experienceGuidancePrompt = `
WORK EXPERIENCE ASSISTANCE:
Help users add professional experiences through conversational data collection:

**Conversational Workflow**:
1. User mentions an experience ("I worked at Google")
2. Ask for details if missing (Role? Years?)
3. Once you have Company + Role + Start Year: **Call the \`add_experience\` tool.**
4. DO NOT ask for every single detail if enough is present.
5. NO JSON OUPUT. USE THE TOOL.
`;

// Projects Guidance
const projectsGuidancePrompt = `
PROJECTS ASSISTANCE:
Help users showcase their work through project descriptions:

**Conversational Workflow**:
1. User mentions a project ("I built nsso")
2. Ask for details (Description? URL?)
3. Once you have Name + Description: **Call the \`add_project\` tool.**
4. NO JSON OUTPUT. USE THE TOOL.
`;

// Qualifications Guidance
const qualificationsGuidancePrompt = `
QUALIFICATIONS ASSISTANCE:
Help users add education and certifications:

**Conversational Workflow**:
1. User mentions education ("I went to MIT")
2. Ask for details (Degree? Year?)
3. Once you have Institution + Degree + Year: **Call the \`add_qualification\` tool.**
4. NO JSON OUTPUT. USE THE TOOL.
`;

// Products/Services Guidance  
const productsGuidancePrompt = `
PRODUCTS & SERVICES ASSISTANCE:
Help users monetize by listing offerings:

**Conversational Workflow**:
1. User mentions a service/product ("I offer coaching")
2. Ask for details (Description? Price?)
3. Once you have Name + Description: **Call the \`add_product\` tool.**
4. NO JSON OUTPUT. USE THE TOOL.
`;

export {
  experienceGuidancePrompt,
  projectsGuidancePrompt,
  qualificationsGuidancePrompt,
  productsGuidancePrompt
};
