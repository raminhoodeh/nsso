
type FunctionDeclaration = { name: string; description: string; parameters: Record<string, unknown> };

export const DEITY_TOOLS: FunctionDeclaration[] = [
    {
        name: "update_profile_field",
        description: "Prepare a proposed change to bio, headline, or full_name for the user to review. This tool does not persist the change.",
        parameters: {
            type: "object",
            properties: {
                target: {
                    type: "string",
                    enum: ['bio', 'headline', 'full_name'],
                    description: "The field to update. Allowed values: 'bio', 'headline', 'full_name'"
                },
                value: {
                    type: "string",
                    description: "The new text value for the field"
                },
                reasoning: {
                    type: "string",
                    description: "Short explanation of why this change improves the profile"
                }
            },
            required: ["target", "value"]
        }
    },
    {
        name: "add_experience",
        description: "Add a work experience entry to the profile.",
        parameters: {
            type: "object",
            properties: {
                company: { type: "string", description: "Company name" },
                title: { type: "string", description: "Job title / Role" },
                startYear: { type: "number", description: "Start year (YYYY)" },
                endYear: { type: ["number", "null"], description: "End year (YYYY) or null if current" },
                description: { type: "string", description: "Brief description of responsibilities/achievements" }
            },
            required: ["company", "title", "startYear"]
        }
    },
    {
        name: "add_project",
        description: "Add a portfolio project to the profile.",
        parameters: {
            type: "object",
            properties: {
                project_name: { type: "string", description: "Name of the project" },
                project_description: { type: "string", description: "Description of what it does and the user's role" },
                project_url: { type: ["string", "null"], description: "URL to the live project or repo" }
            },
            required: ["project_name", "project_description"]
        }
    },
    {
        name: "add_qualification",
        description: "Add an education or certification entry.",
        parameters: {
            type: "object",
            properties: {
                institution: { type: "string", description: "University, School, or Issuing Body" },
                degree: { type: "string", description: "Degree name or Certification title" },
                year: { type: "number", description: "Year of completion/graduation" }
            },
            required: ["institution", "degree", "year"]
        }
    },
    {
        name: "add_product",
        description: "Add a product or service offering to the profile store.",
        parameters: {
            type: "object",
            properties: {
                product_name: { type: "string", description: "Name of the product or service" },
                product_description: { type: "string", description: "Compelling description of the offering" },
                price: { type: ["string", "null"], description: "Price string (e.g. '$50', 'Free', '$100/hr')" },
                purchase_url: { type: ["string", "null"], description: "External link to purchase/book" }
            },
            required: ["product_name", "product_description"]
        }
    },
    {
        name: "add_link",
        description: "Add a social link or website to the profile.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Display name (e.g. 'LinkedIn', 'Portfolio')" },
                url: { type: "string", description: "The valid URL" }
            },
            required: ["name", "url"]
        }
    },
    {
        name: "update_link",
        description: "Prepare an owned link's name and/or URL change for review, without saving it. Use the exact ID from LINKS. Supply at least one changed field; omit url for a name-only edit.",
        parameters: {
            type: "object",
            properties: {
                linkId: { type: "string", description: "UUID of the link to update" },
                name: { type: ["string", "null"], description: "New display name" },
                url: { type: ["string", "null"], description: "New URL" }
            },
            required: ["linkId"]
        }
    },
    {
        name: "remove_link",
        description: "Remove a link from the profile.",
        parameters: {
            type: "object",
            properties: {
                id: { type: "string", description: "UUID of the link to remove" }
            },
            required: ["id"]
        }
    },
    {
        name: "reorder_links",
        description: "Update the display order of links.",
        parameters: {
            type: "object",
            properties: {
                order: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of link UUIDs in the new desired order"
                }
            },
            required: ["order"]
        }
    },
    {
        name: "suggest_wording",
        description: "Suggest a better phrasing for a specific field (review mode).",
        parameters: {
            type: "object",
            properties: {
                target: { type: "string", enum: ['bio', 'headline', 'full_name'], description: "Field being improved" },
                original: { type: "string", description: "The original text" },
                improved: { type: "string", description: "The suggested new text" },
                reasoning: { type: "string", description: "Why this is better" }
            },
            required: ["target", "improved"]
        }
    }
];
