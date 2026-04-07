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
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

async function generateEmbedding(text: string) {
    const result = await model.embedContent({ content: { parts: [{ text }] }, outputDimensionality: 768 } as any);
    return result.embedding.values;
}

async function processCSV(filePath: string, fileName: string) {
    console.log(`\n📄 Processing CSV: ${fileName}`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
    });

    console.log(`📊 Found ${records.length} records in ${fileName}`);
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
            } else {
                console.error(`Error inserting record from ${fileName}:`, error.message);
            }
        }));
        
        if (i % 100 === 0 && i !== 0) {
            console.log(`Processed ${i}/${records.length} records from ${fileName}...`);
        }
    }
    console.log(`✅ ${fileName}: ${insertedCount}/${records.length} records inserted`);
}

async function processMarkdown(filePath: string, fileName: string) {
    console.log(`\n📝 Processing Markdown: ${fileName}`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Split markdown by headings (H1, H2, H3) to create meaningful chunks
    const rawChunks = fileContent.split(/\n(?=#{1,3}\s)/);
    
    // Filter out empty or extremely short chunks
    const chunks = rawChunks.filter(c => c.trim().length > 20);

    console.log(`🧩 Found ${chunks.length} chunks in ${fileName}`);
    let insertedCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (chunk: string) => {
            const fullContext = `Source: ${fileName}\n\n${chunk.trim()}`;
            const embedding = await generateEmbedding(fullContext);

            const { error } = await supabase.from('agent_knowledge').insert({
                content: fullContext,
                embedding,
                metadata: { source: fileName }
            });

            if (!error) {
                insertedCount++;
            } else {
                 console.error(`Error inserting chunk from ${fileName}:`, error.message);
            }
        }));

        console.log(`Processed ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks from ${fileName}...`);
    }
    console.log(`✅ ${fileName}: ${insertedCount}/${chunks.length} chunks inserted`);
}

async function ingestDatabase() {
    const dbDir = '/Users/raminvision/Desktop/nsso/Updated Database';
    console.log(`\n📁 Reading database directory: ${dbDir}`);
    
    const files = fs.readdirSync(dbDir).filter(f => !f.startsWith('.'));
    
    console.log(`🚀 Found ${files.length} files to ingest.`);
    
    for (const fileName of files) {
        const filePath = path.join(dbDir, fileName);
        
        if (fileName.endsWith('.csv')) {
            await processCSV(filePath, fileName);
        } else if (fileName.endsWith('.md')) {
            await processMarkdown(filePath, fileName);
        } else {
            console.log(`⚠️ Skipping unsupported file type: ${fileName}`);
        }
    }
    
    console.log('\n🎉 Full Database Ingestion Complete!');
}

ingestDatabase().catch(console.error);
