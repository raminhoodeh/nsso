import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const model = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY).getGenerativeModel({ model: "gemini-2.5-flash" });

const TARGET_CATEGORIES = [
    "Critically-Acclaimed Mind-Bending Sci-Fi", "Visually Striking Emotional Dramas",
    "Gritty Heist & Crime Thrillers", "Suspenseful Psychological Mysteries",
    "Epic Historical Period Pieces", "Heartfelt Coming-of-Age Tales",
    "Surreal & Left-of-Center Cinema", "Dark Comedies & Sharp Satire",
    "Riveting Global Documentaries", "Classic Masterpieces of World Cinema",
    "Intense Action, War & Adventure", "Prestige Television & Miniseries",
    "Nostalgic Cult Classics", "Japanese Anime"
];

async function run() {
    const { data: films } = await supabase.from('razinflix_films').select('*');
    
    const cats = {};
    for (const f of films) {
        const c = (f.categories && f.categories.length > 0) ? f.categories[0] : 'Uncategorized';
        if (!cats[c]) cats[c] = [];
        cats[c].push(f);
    }

    for (const [catName, catFilms] of Object.entries(cats)) {
         if (catFilms.length < 5 || catName === "Recently Added" || catName === "Uncategorized" || !TARGET_CATEGORIES.includes(catName)) {
             console.log(`Processing category: ${catName} (${catFilms.length} films)`);
             for (const film of catFilms) {
                 const prompt = `Select EXACTLY ONE category from the list that best fits this film:\n${TARGET_CATEGORIES.map(c=>'- '+c).join('\n')}\n\nFilm: ${film.title}\nYear: ${film.year}\nDesc: ${film.description}\nReturn ONLY the string.`;
                 try {
                     let res = await model.generateContent(prompt);
                     let newCat = res.response.text().trim();
                     if (newCat.startsWith('- ')) newCat = newCat.substring(2);
                     if (newCat.startsWith('"') && newCat.endsWith('"')) newCat = newCat.slice(1, -1);
                     
                     let finalCat = "Visually Striking Emotional Dramas";
                     if (TARGET_CATEGORIES.includes(newCat)) finalCat = newCat;
                     else {
                         const match = TARGET_CATEGORIES.find(c => newCat.includes(c) || c.includes(newCat));
                         if (match) finalCat = match;
                     }
                     
                     await supabase.from('razinflix_films').update({ categories: [finalCat] }).eq('id', film.id);
                     console.log(`✅ Moved [${film.title}] -> [${finalCat}]`);
                     await new Promise(r => setTimeout(r, 800));
                 } catch (e) {
                     console.error(`Error processing ${film.title}:`, e.message);
                 }
             }
         }
    }
}
run();
