import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);
// Using 2.5 Flash for optimal parsing and speed
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const CATEGORIES = [
    "Critically-Acclaimed Mind-Bending Sci-Fi",
    "Visually Striking Emotional Dramas",
    "Gritty Heist & Crime Thrillers",
    "Suspenseful Psychological Mysteries",
    "Epic Historical Period Pieces",
    "Heartfelt Coming-of-Age Tales",
    "Surreal & Left-of-Center Cinema",
    "Dark Comedies & Sharp Satire",
    "Riveting Global Documentaries",
    "Classic Masterpieces of World Cinema",
    "Intense Action, War & Adventure",
    "Prestige Television & Miniseries",
    "Nostalgic Cult Classics"
];

async function enrichCategories() {
    console.log('🚀 Fetching films from Supabase...');
    const { data: films, error: fetchError } = await supabase
        .from('razinflix_films')
        .select('*')
        .order('id', { ascending: true });

    if (fetchError || !films) {
        console.error('Failed to fetch films:', fetchError);
        return;
    }

    console.log(`📊 Found ${films.length} films to recategorize.`);
    
    let updatedCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < films.length; i += BATCH_SIZE) {
        const batch = films.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (film) => {
            // Hard preservation for Japanese Anime
            if (film.categories && film.categories.includes("Japanese Anime")) {
                console.log(`⏭️ Skipping ${film.title} (Preserving Anime Designation)`);
                return;
            }
            
            // Hardcode Japanese Anime detection just in case it was missed
            if (film.director === "Hayao Miyazaki" || film.director === "Isao Takahata" || film.director === "Katsuhiro Otomo" || film.title === "Akira" || film.title === "Perfect Blue" || film.title === "Ghost in the Shell") {
                if (!film.categories || !film.categories.includes("Japanese Anime")) {
                    console.log(`🌸 Enforcing Japanese Anime category for ${film.title}`);
                    await supabase.from('razinflix_films').update({ categories: ["Japanese Anime"] }).eq('id', film.id);
                    return;
                }
            }

            try {
                const prompt = `You are an expert film categorization engine bridging subjective aesthetics with cinematic genres.
Select EXACTLY ONE category from the following strict list that best fits this film:
${CATEGORIES.map(c => `- ${c}`).join('\n')}

Film Title: "${film.title}"
Year: ${film.year}
Director: ${film.director}
Description: ${film.description}

Do not include quotes, brackets, or any conversational text. Return ONLY the exact string from the allowed list above.`;

                const result = await model.generateContent(prompt);
                let newCategory = result.response.text().trim();
                
                // Scrub standard AI artifacts
                if (newCategory.startsWith('- ')) newCategory = newCategory.substring(2);
                if (newCategory.startsWith('"') && newCategory.endsWith('"')) newCategory = newCategory.slice(1, -1);
                
                // Fallback to closest match if the returned string is slightly flawed
                if (!CATEGORIES.includes(newCategory)) {
                     const match = CATEGORIES.find(c => newCategory.includes(c) || c.includes(newCategory));
                     if (match) newCategory = match;
                     else {
                         console.warn(`    ⚠️ AI returned unknown category: "${newCategory}" - defaulting to Drama.`);
                         newCategory = "Visually Striking Emotional Dramas"; 
                     }
                }

                // Supabase expects an array for categories
                const updatedCategories = [newCategory];

                const { error: updateError } = await supabase
                    .from('razinflix_films')
                    .update({ categories: updatedCategories })
                    .eq('id', film.id);

                if (updateError) {
                    console.error(`❌ DB Update failed for ${film.title}:`, updateError.message);
                } else {
                    updatedCount++;
                    console.log(`✅ [${film.title}] -> [${newCategory}]`);
                }
            } catch (err: any) {
                console.error(`❌ Error on ${film.title}:`, err.message);
            }
        }));

        console.log(`⏳ Batch complete (${Math.min(i + batch.length, films.length)}/${films.length}). Sleeping 1000ms...`);
        await delay(1000);
    }

    console.log(`\n🎉 Categorization Complete! Successfully updated ${updatedCount} films.`);
}

enrichCategories().catch(console.error);
