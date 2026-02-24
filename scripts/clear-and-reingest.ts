
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
const embModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const CONTEXT_DIR = path.join(process.cwd(), 'nsso agent context database');
const BATCH_SIZE = 10;
const DELETE_BATCH = 500;

async function clearTable() {
    console.log('🗑️  Clearing agent_knowledge table in batches...');
    let total = 0;
    while (true) {
        // Fetch a batch of IDs
        const { data, error } = await supabase
            .from('agent_knowledge')
            .select('id')
            .limit(DELETE_BATCH);

        if (error) { console.error('Fetch error:', error); break; }
        if (!data || data.length === 0) break;

        const ids = data.map((r: any) => r.id);
        const { error: delErr } = await supabase
            .from('agent_knowledge')
            .delete()
            .in('id', ids);

        if (delErr) { console.error('Delete error:', delErr); break; }
        total += ids.length;
        console.log(`  Deleted ${total} rows so far...`);
    }
    console.log(`✅ Cleared ${total} rows total.`);
}

async function generateEmbedding(text: string, retries = 4): Promise<number[] | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await embModel.embedContent({ content: { parts: [{ text }] }, outputDimensionality: 768 } as any);
            return result.embedding.values;
        } catch (e: any) {
            if (attempt < retries && (e?.status === 503 || e?.status === 429 || e?.status === 502)) {
                const delay = 2000 * Math.pow(2, attempt);
                console.log(`  ⏳ Transient error, retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                console.error('Embedding error after retries:', e?.message || e);
                return null;
            }
        }
    }
    return null;
}

async function processFile(filePath: string) {
    const fileName = path.basename(filePath);
    console.log(`\n📄 Processing ${fileName}...`);

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let records: any[];
    try {
        records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        });
    } catch (e) {
        console.error(`  ⚠️  Could not parse ${fileName}:`, e);
        return;
    }

    console.log(`  Found ${records.length} records.`);
    let inserted = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (record: any) => {
            const contentParts = Object.entries(record)
                .filter(([k, v]) => k?.trim() && v && (v as string).trim() && (v as string).trim().toLowerCase() !== 'login:')
                .map(([k, v]) => `${k}: ${v}`);

            const content = contentParts.join('\n');
            if (!content.trim()) return;

            const fullContext = `Source: ${fileName}\n${content}`;
            const embedding = await generateEmbedding(fullContext);

            if (embedding) {
                const { error } = await supabase.from('agent_knowledge').insert({
                    content: fullContext,
                    metadata: { source: fileName, ...record },
                    embedding,
                });
                if (error) console.error(`  Insert error:`, error.message);
                else inserted++;
            }
        }));

        // Rate limit breathing room
        await new Promise(r => setTimeout(r, 300));
        if ((i + BATCH_SIZE) % 100 === 0) {
            console.log(`  Progress: ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`);
        }
    }

    console.log(`  ✅ Inserted ${inserted} records from ${fileName}`);
}

async function main() {
    console.log('🚀 Starting re-embedding with gemini-embedding-001\n');

    // Step 1: Clear old embeddings
    await clearTable();

    // Step 2: Re-ingest all CSVs
    const files = fs.readdirSync(CONTEXT_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
    console.log(`\n📂 Found ${files.length} CSV files to process.\n`);

    for (const file of files) {
        await processFile(path.join(CONTEXT_DIR, file));
    }

    console.log('\n🎉 Re-embedding complete! All documents now use gemini-embedding-001.');
}

main().catch(console.error);
