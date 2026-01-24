
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

export const DEITY_TOOLS: FunctionDeclaration[] = [
    {
        name: "update_profile_field",
        description: "Update a simple text field on the user's profile (bio, headline, full_name).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                target: {
                    type: SchemaType.STRING,
                    description: "The field to update. Allowed values: 'bio', 'headline', 'full_name'"
                },
                value: {
                    type: SchemaType.STRING,
                    description: "The new text value for the field"
                },
                reasoning: {
                    type: SchemaType.STRING,
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
            type: SchemaType.OBJECT,
            properties: {
                company: { type: SchemaType.STRING, description: "Company name" },
                title: { type: SchemaType.STRING, description: "Job title / Role" },
                startYear: { type: SchemaType.NUMBER, description: "Start year (YYYY)" },
                endYear: { type: SchemaType.NUMBER, description: "End year (YYYY) or null if current", nullable: true },
                description: { type: SchemaType.STRING, description: "Brief description of responsibilities/achievements" }
            },
            required: ["company", "title", "startYear"]
        }
    },
    {
        name: "add_project",
        description: "Add a portfolio project to the profile.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                project_name: { type: SchemaType.STRING, description: "Name of the project" },
                project_description: { type: SchemaType.STRING, description: "Description of what it does and the user's role" },
                project_url: { type: SchemaType.STRING, description: "URL to the live project or repo", nullable: true },
                technologies: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "List of technologies used (e.g. React, Python)"
                }
            },
            required: ["project_name", "project_description"]
        }
    },
    {
        name: "add_qualification",
        description: "Add an education or certification entry.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                institution: { type: SchemaType.STRING, description: "University, School, or Issuing Body" },
                degree: { type: SchemaType.STRING, description: "Degree name or Certification title" },
                field: { type: SchemaType.STRING, description: "Field of study (optional)", nullable: true },
                year: { type: SchemaType.NUMBER, description: "Year of completion/graduation" }
            },
            required: ["institution", "degree", "year"]
        }
    },
    {
        name: "add_product",
        description: "Add a product or service offering to the profile store.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                product_name: { type: SchemaType.STRING, description: "Name of the product or service" },
                product_description: { type: SchemaType.STRING, description: "Compelling description of the offering" },
                price: { type: SchemaType.STRING, description: "Price string (e.g. '$50', 'Free', '$100/hr')", nullable: true },
                purchase_url: { type: SchemaType.STRING, description: "External link to purchase/book", nullable: true }
            },
            required: ["product_name", "product_description"]
        }
    },
    {
        name: "add_link",
        description: "Add a social link or website to the profile.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: { type: SchemaType.STRING, description: "Display name (e.g. 'LinkedIn', 'Portfolio')" },
                url: { type: SchemaType.STRING, description: "The valid URL" }
            },
            required: ["name", "url"]
        }
    },
    {
        name: "update_link",
        description: "Update an existing link's name or URL.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                linkId: { type: SchemaType.STRING, description: "UUID of the link to update" },
                name: { type: SchemaType.STRING, description: "New display name", nullable: true },
                url: { type: SchemaType.STRING, description: "New URL", nullable: true }
            },
            required: ["linkId"]
        }
    },
    {
        name: "remove_link",
        description: "Remove a link from the profile.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                id: { type: SchemaType.STRING, description: "UUID of the link to remove" }
            },
            required: ["id"]
        }
    },
    {
        name: "reorder_links",
        description: "Update the display order of links.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                order: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
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
            type: SchemaType.OBJECT,
            properties: {
                target: { type: SchemaType.STRING, description: "Field being improved (e.g. headline)" },
                original: { type: SchemaType.STRING, description: "The original text" },
                improved: { type: SchemaType.STRING, description: "The suggested new text" },
                reasoning: { type: SchemaType.STRING, description: "Why this is better" }
            },
            required: ["target", "improved"]
        }
    }
];
