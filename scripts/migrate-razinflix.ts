import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
    console.log('🚀 Starting RazinFlix Migration...');
    
    const jsonPath = path.join(process.cwd(), 'src', 'data', 'films.json');
    if (!fs.existsSync(jsonPath)) {
        console.error('❌ films.json not found!');
        return;
    }

    const films = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`📊 Found ${films.length} films to migrate.`);

    // Note: the `id` from films.json is an integer index. The Supabase table will auto-generate primary keys.
    // However, if we want to preserve the exact numeric IDs for consistency with currently saved URLs, 
    // it's better to explicitly insert the ID if the table allows it.
    // If it's `generated always as identity`, we might need to modify it or just let Supabase assign them.
    // Assuming the user ran the provided SQL exactly: `id bigint primary key generated always as identity`,
    // it won't let us insert the `id` column directly unless we OVERRIDING SYSTEM VALUE.
    // We will just insert the rest of the fields. Wait! `id` is crucial for linking. 
    // Let's check the SQL we provided: `id bigint primary key generated always as identity`.
    // Actually `films.json` IDs are 1..340 sequentially, so inserting in order WILL produce identical IDs. 
    // To be safe, we'll sort them first.

    films.sort((a: any, b: any) => parseInt(a.id) - parseInt(b.id));

    let inserted = 0;
    const errors: any[] = [];

    // Let's truncate the table first to guarantee a clean slate
    const { error: truncErr } = await supabase.from('razinflix_films').delete().neq('id', 0);
    if (truncErr) {
        console.warn('⚠️ Could not clear existing table rows (it might be empty already).', truncErr.message);
    } else {
        console.log('🗑️ Cleared existing rows (if any) in razinflix_films.');
    }

    // Insert in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < films.length; i += BATCH_SIZE) {
        const batch = films.slice(i, i + BATCH_SIZE).map((film: any) => ({
            title: film.title,
            year: film.year,
            rating: film.rating,
            poster: film.poster,
            description: film.description,
            director: film.director,
            categories: film.categories,
            trailer_key: film.trailer_key || null
        }));

        const { error, data } = await supabase.from('razinflix_films').insert(batch);
        
        if (error) {
            console.error(`❌ Batch error:`, error.message);
            errors.push(error);
        } else {
            inserted += batch.length;
            console.log(`✅ Migrated ${inserted} / ${films.length} films...`);
        }
    }

    console.log(`\n🎉 Migration Complete! Successfully inserted ${inserted} records.`);
    if (errors.length > 0) {
        console.log(`⚠️ Encountered ${errors.length} batch errors.`);
    }
}

migrate().catch(console.error);
