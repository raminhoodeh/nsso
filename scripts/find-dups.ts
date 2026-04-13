import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findDups() {
    console.log("Fetching all films...");
    const { data: films, error } = await supabase.from('razinflix_films').select('id, title, year');
    if (error) throw error;
    
    // Normalize titles
    const titles = {};
    for (const f of films) {
        const norm = f.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (!titles[norm]) titles[norm] = [];
        titles[norm].push(f);
    }
    
    const dups = Object.values(titles).filter(arr => (arr as any[]).length > 1);
    console.log(`Found ${dups.length} duplicate title groups:`);
    for (const d of dups) {
        console.log("---");
        for (const f of (d as any[])) {
            console.log(`${f.title} (${f.year}) [ID: ${f.id}]`);
        }
    }
}
findDups();
