import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);
// Ensure we use flash for high throughput limits
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function enrichDescriptions() {
    console.log('🚀 Fetching films from Supabase...');
    const { data: films, error: fetchError } = await supabase
        .from('razinflix_films')
        .select('*')
        .order('id', { ascending: true });

    if (fetchError || !films) {
        console.error('Failed to fetch films:', fetchError);
        return;
    }

    console.log(`📊 Found ${films.length} films to enrich.`);
    
    let updatedCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < films.length; i += BATCH_SIZE) {
        const batch = films.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (film) => {
            // If the description is already extremely long, skip it to save tokens
            if (film.description && film.description.length > 250) {
                console.log(`⏭️ Skipping ${film.title} (already enriched)`);
                return;
            }

            try {
                const prompt = `Write a captivating, atmospheric, and emotionally resonant 2-3 sentence cinematic description for the film "${film.title}" (${film.year}) directed by ${film.director || 'unknown'}. 

Do not include the title of the film, the year, or the director in your response, just the raw atmospheric description. Do not use quotes, bold text, or introductory text. Return only the description, nothing else.`;

                const result = await model.generateContent(prompt);
                let newDesc = result.response.text().trim();
                
                // Scrub standard AI artifacts
                if (newDesc.startsWith('"') && newDesc.endsWith('"')) {
                    newDesc = newDesc.slice(1, -1);
                }
                newDesc = newDesc.replace(/\*\*/g, '');

                const { error: updateError } = await supabase
                    .from('razinflix_films')
                    .update({ description: newDesc })
                    .eq('id', film.id);

                if (updateError) {
                    console.error(`❌ DB Update failed for ${film.title}:`, updateError.message);
                } else {
                    updatedCount++;
                    console.log(`✅ [${film.title}] -> "${newDesc.substring(0, 50)}..."`);
                }
            } catch (err: any) {
                console.error(`❌ Error on ${film.title}:`, err.message);
            }
        }));

        console.log(`⏳ Batch complete (${i + batch.length}/${films.length}). Sleeping 2000ms...`);
        await delay(2000);
    }

    console.log(`\n🎉 Enrichment Complete! Successfully updated ${updatedCount} descriptions.`);
}

enrichDescriptions().catch(console.error);
