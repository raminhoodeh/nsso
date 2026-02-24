
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Must use service key for bypassing RLS if needed, or ensuring write access

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Gemini
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
if (!apiKey) {
    console.error('Error: GOOGLE_GENERATIVE_AI_API_KEY is required in .env.local');
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const CONTEXT_DIR = path.join(process.cwd(), 'nsso agent context database');

async function generateEmbedding(text: string) {
    try {
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error('Error generating embedding:', error);
        return null;
    }
}

async function processFile(filePath: string) {
    const fileName = path.basename(filePath);
    console.log(`Processing ${fileName}...`);

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true, // Handle potentially messy CSVs
    });

    console.log(`Found ${records.length} records in ${fileName}.`);

    let processedCount = 0;
    // Batch process to avoid hitting rate limits too hard, though Gemini is generous
    const BATCH_SIZE = 10;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (record: any) => {
            // Serialize record to string for embedding
            // Format: "Key: Value, Key: Value"
            const contentParts = Object.entries(record).map(([key, value]) => {
                // Skip empty keys (from trailing commas in CSV)
                if (!key || key.trim() === '') return null;

                // Skip empty/whitespace values
                if (!value || (typeof value === 'string' && value.trim() === '')) return null;

                // Skip junk values like "Login:" repeated
                if (typeof value === 'string' && value.trim().toLowerCase() === 'login:') return null;

                return `${key}: ${value}`;
            }).filter(Boolean);

            const content = contentParts.join('\n');
            if (!content) return; // Skip empty records

            // Add filename context
            const fullContext = `Source: ${fileName}\n${content}`;

            // Generate embedding
            // Introduce simple delay to respect rate limits if needed, but sequential batch is usually ok
            const embedding = await generateEmbedding(fullContext);

            if (embedding) {
                // Upsert into Supabase
                const { error } = await supabase.from('agent_knowledge').insert({
                    content: fullContext,
                    metadata: { source: fileName, ...record },
                    embedding: embedding,
                });

                if (error) {
                    console.error(`Error inserting record from ${fileName}:`, error);
                } else {
                    processedCount++;
                }
            }
        }));

        // Optional: generic delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`Processed ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} records...`);
    }

    console.log(`Finished ${fileName}: ${processedCount} records inserted.`);
}

async function main() {
    if (!fs.existsSync(CONTEXT_DIR)) {
        console.error(`Directory not found: ${CONTEXT_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(CONTEXT_DIR).filter(f => f.toLowerCase().endsWith('.csv'));

    console.log(`Found ${files.length} CSV files.`);

    for (const file of files) {
        await processFile(path.join(CONTEXT_DIR, file));
    }

    console.log('All files processed.');
}

main().catch(console.error);
