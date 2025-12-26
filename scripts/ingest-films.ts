import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

async function generateEmbedding(text: string) {
    const result = await model.embedContent(text);
    return result.embedding.values;
}

async function ingestFilmList() {
    const filePath = path.join(process.cwd(), 'nsso agent context database', 'nsso Database - Film List.csv');
    const fileName = 'nsso Database - Film List.csv';

    console.log('📁 Reading Film List CSV...');
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
    });

    console.log(`📊 Found ${records.length} records`);
    console.log('🚀 Processing all films...\n');

    let insertedCount = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (record: any) => {
            const contentParts = Object.entries(record).map(([key, value]) => {
                if (!key || key.trim() === '') return null;
                if (!value || (typeof value === 'string' && value.trim() === '')) return null;
                if (typeof value === 'string' && value.trim().toLowerCase() === 'login:') return null;
                return `${key}: ${value}`;
            }).filter(Boolean);

            const content = contentParts.join('\n');
            if (!content) return;

            const fullContext = `Source: ${fileName}\n${content}`;
            const embedding = await generateEmbedding(fullContext);

            const { error } = await supabase.from('agent_knowledge').insert({
                content: fullContext,
                embedding,
                metadata: { source: fileName }
            });

            if (!error) {
                insertedCount++;
            }
        }));

        console.log(`Processed ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} records...`);
    }

    console.log(`\n✅ Film List Ingestion Complete: ${insertedCount}/${records.length} records inserted`);
}

ingestFilmList().catch(console.error);
