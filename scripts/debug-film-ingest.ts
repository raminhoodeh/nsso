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
    }) as Array<Record<string, unknown>>;

    console.log(`📊 Found ${records.length} records`);
    console.log('🔍 Processing first 3 records to debug...\n');

    let insertedCount = 0;

    for (let i = 0; i < Math.min(3, records.length); i++) {
        const record = records[i];

        console.log(`\n--- Record ${i + 1} ---`);
        console.log('Raw record:', JSON.stringify(record, null, 2));

        // Build content with filtering
        const contentParts = Object.entries(record as Record<string, unknown>).map(([key, value]) => {
            if (!key || key.trim() === '') {
                console.log(`  ❌ Skipped: empty key`);
                return null;
            }
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                console.log(`  ❌ Skipped "${key}": empty value`);
                return null;
            }
            if (typeof value === 'string' && value.trim().toLowerCase() === 'login:') {
                console.log(`  ❌ Skipped "${key}": junk value "Login:"`);
                return null;
            }
            console.log(`  ✅ Kept: ${key}: ${value}`);
            return `${key}: ${value}`;
        }).filter(Boolean);

        const content = contentParts.join('\n');
        console.log(`\n📝 Final content:\n${content}\n`);

        if (!content) {
            console.log('⚠️  No content after filtering, skipping record');
            continue;
        }

        const fullContext = `Source: ${fileName}\n${content}`;
        console.log('🔐 Generating embedding...');
        const embedding = await generateEmbedding(fullContext);

        console.log('💾 Inserting to database...');
        const { error } = await supabase.from('agent_knowledge').insert({
            content: fullContext,
            embedding,
            metadata: { source: fileName }
        });

        if (error) {
            console.error('❌ Database insert error:', error);
        } else {
            insertedCount++;
            console.log('✅ Successfully inserted!');
        }
    }

    console.log(`\n✅ Film List Ingestion Complete: ${insertedCount}/${records.length} records inserted`);
}

ingestFilmList().catch(console.error);
