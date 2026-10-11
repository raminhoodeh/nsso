#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import {
    matchingAliases,
    normalizeTitle,
    resolveTmdbFilm,
    resolveTrailer,
    verifyPosterUrl,
} from '../src/lib/razinflix/enrichment.ts';

const COLLECTION = 'New';
const EXPECTED_YEAR = '2026';

// Selected on 2026-10-11 from the current RogerEbert editors' list,
// Rotten Tomatoes' Certified Fresh guide, and Metacritic's 2026 rankings.
// Exact TMDB ids make the batch deterministic and prevent same-title mismatches.
const CURATED_FILMS = [
    { title: 'American Doctor', tmdbId: 1596332, evidence: 'https://www.watermelonpictures.com/films/american-doctor' },
    { title: 'Everybody to Kenmure Street', tmdbId: 1484620, evidence: 'https://www.conic.film/films/kenmurestreet' },
    { title: 'Is God Is', tmdbId: 1380316, evidence: 'https://www.metacritic.com/pictures/best-movies-of-2026-at-midyear/1/' },
    { title: 'The History of Concrete', tmdbId: 1596296, evidence: 'https://editorial.rottentomatoes.com/guide/best-new-movies/' },
    { title: 'The Samurai and the Prisoner', tmdbId: 1620313, evidence: 'https://samuraiandtheprisoner.film/' },
    { title: 'Resident Evil', tmdbId: 1423191, evidence: 'https://www.sonypictures.com/movies/residentevil8' },
    { title: 'Coyote vs. Acme', tmdbId: 1204680, evidence: 'https://www.coyotevsacme.com/home/' },
    { title: 'The Invite', tmdbId: 950028, evidence: 'https://a24films.com/films/the-invite' },
    { title: 'Project Hail Mary', tmdbId: 687163, evidence: 'https://www.metacritic.com/movie/project-hail-mary/' },
    { title: 'Hoppers', tmdbId: 1327819, evidence: 'https://movies.disney.com/hoppers' },
    { title: 'The Odyssey', tmdbId: 1368337, evidence: 'https://universalpictures.ca/movie/the-odyssey/' },
    { title: 'Teenage Sex and Death at Camp Miasma', tmdbId: 1240889, evidence: 'https://editorial.rottentomatoes.com/guide/best-new-movies/' },
    { title: 'Toy Story 5', tmdbId: 1084244, evidence: 'https://movies.disney.com/toy-story-5' },
    { title: 'Send Help', tmdbId: 1198994, evidence: 'https://www.20thcenturystudios.com/movies/send-help' },
    { title: 'I Love Boosters', tmdbId: 1227877, evidence: 'https://www.iloveboosters.film/' },
    { title: 'I Want Your Sex', tmdbId: 1288059, evidence: 'https://editorial.rottentomatoes.com/guide/best-new-movies/' },
    { title: 'Spider-Man: Brand New Day', tmdbId: 969681, evidence: 'https://www.sonypictures.com/movies/spidermanbrandnewday' },
    { title: 'Primetime', tmdbId: 1375441, evidence: 'https://a24films.com/films/primetime' },
    { title: 'Backrooms', tmdbId: 1083381, evidence: 'https://a24films.com/films/backrooms' },
    { title: 'Obsession', tmdbId: 1339713, evidence: 'https://editorial.rottentomatoes.com/guide/best-new-movies/' },
    { title: '28 Years Later: The Bone Temple', tmdbId: 1272837, evidence: 'https://www.rogerebert.com/features/the-20-best-films-of-2026-so-far' },
    { title: 'Crime 101', tmdbId: 1171145, evidence: 'https://www.rogerebert.com/features/the-20-best-films-of-2026-so-far' },
    { title: 'The Weight', tmdbId: 1433583, evidence: 'https://www.augenschein-filmproduktion.de/de/news/weight-trailer-de.html' },
    { title: 'Tony', tmdbId: 1329016, evidence: 'https://a24films.com/films/tony' },
    { title: 'Time and Water', tmdbId: 1596278, evidence: 'https://timeandwaterfilm.com/' },
];

const MANUAL_TRAILERS = new Map([
    ['American Doctor', {
        key: 'Be7_u8jzHzU',
        title: 'American Doctor | Official Trailer',
        source: 'official-director-page',
        evidence: 'https://pohsiteng.substack.com/p/the-trailer-is-here-american-doctor',
    }],
]);

function parseArguments(argv) {
    const values = { commit: false, envFile: null };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--commit') values.commit = true;
        else if (argument === '--env-file') values.envFile = argv[++index] ?? null;
        else throw new Error(`Unknown argument: ${argument}`);
    }
    return values;
}

function readEnvironment(filePath) {
    if (!filePath) return {};
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) throw new Error(`Environment file not found: ${resolvedPath}`);
    return dotenv.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function firstValue(...values) {
    return values.find(value => typeof value === 'string' && value.trim())?.trim() ?? '';
}

async function verifyManualTrailer(trailer) {
    const evidenceResponse = await fetch(trailer.evidence, { redirect: 'follow' });
    if (!evidenceResponse.ok) throw new Error(`Official trailer evidence returned ${evidenceResponse.status}.`);
    const evidencePage = await evidenceResponse.text();
    if (!evidencePage.includes(trailer.key)) {
        throw new Error(`Official trailer evidence no longer references ${trailer.key}.`);
    }

    const embedResponse = await fetch(`https://www.youtube-nocookie.com/embed/${trailer.key}`, { redirect: 'follow' });
    if (!embedResponse.ok) throw new Error(`Official trailer embed returned ${embedResponse.status}.`);
    await embedResponse.body?.cancel().catch(() => undefined);
}

function findExistingFilm(rows, film) {
    const aliases = matchingAliases(film);
    return rows.find(row => {
        if (String(row.year) !== film.year) return false;
        return aliases.has(normalizeTitle(row.title));
    }) ?? null;
}

async function main() {
    const { commit, envFile } = parseArguments(process.argv.slice(2));
    const externalEnvironment = readEnvironment(envFile);
    const localEnvironment = readEnvironment('.env.local');
    const tmdbApiKey = firstValue(process.env.TMDB_API_KEY, localEnvironment.TMDB_API_KEY, externalEnvironment.TMDB_API_KEY);
    const supabaseUrl = firstValue(process.env.NEXT_PUBLIC_SUPABASE_URL, externalEnvironment.NEXT_PUBLIC_SUPABASE_URL, localEnvironment.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseKey = firstValue(process.env.SUPABASE_SERVICE_ROLE_KEY, externalEnvironment.SUPABASE_SERVICE_ROLE_KEY, localEnvironment.SUPABASE_SERVICE_ROLE_KEY);

    if (!tmdbApiKey) throw new Error('TMDB_API_KEY is required.');
    if (!supabaseUrl || !supabaseKey) throw new Error('Production Supabase URL and server secret are required.');

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: existingRows, error: existingError } = await supabase
        .from('razinflix_films')
        .select('id,title,year,categories');
    if (existingError) throw new Error(`Could not inspect RazinFlix: ${existingError.message}`);

    const resolvedEntries = [];
    for (const candidate of CURATED_FILMS) {
        const film = await resolveTmdbFilm({ title: candidate.title, year: EXPECTED_YEAR }, tmdbApiKey);
        if (film.tmdbId !== candidate.tmdbId) {
            throw new Error(`${candidate.title}: expected TMDB ${candidate.tmdbId}, matched ${film.tmdbId}.`);
        }
        if (film.year !== EXPECTED_YEAR) {
            throw new Error(`${candidate.title}: expected ${EXPECTED_YEAR}, matched ${film.year}.`);
        }
        if (!film.directors.length || !film.overview || film.rating === 'N/A') {
            throw new Error(`${candidate.title}: TMDB metadata is incomplete.`);
        }
        await verifyPosterUrl(film.posterUrl);

        const manualTrailer = MANUAL_TRAILERS.get(candidate.title);
        let trailer;
        if (manualTrailer) {
            await verifyManualTrailer(manualTrailer);
            trailer = manualTrailer;
        } else {
            const resolution = await resolveTrailer(film, {});
            if (!resolution.trailer) {
                throw new Error(`${candidate.title}: no verified playable trailer (${resolution.diagnostics.join(' ')})`);
            }
            trailer = resolution.trailer;
        }

        const existing = findExistingFilm(existingRows ?? [], film);
        resolvedEntries.push({
            candidate,
            film,
            trailer,
            existing,
            row: {
                title: film.title,
                year: film.year,
                director: film.directors.join(', '),
                rating: film.rating,
                poster: film.posterUrl,
                description: film.overview,
                trailer_key: trailer.key,
                categories: [COLLECTION],
            },
        });
        console.log(`verified  ${film.title} (${film.year}) · ${film.directors.join(', ')} · ${film.rating}`);
    }

    const duplicates = resolvedEntries.filter(item => item.existing);
    if (duplicates.length) {
        const titles = duplicates.map(item => `${item.film.title} (#${item.existing.id})`).join(', ');
        throw new Error(`Refusing to create duplicate records; already present: ${titles}`);
    }

    if (!commit) {
        console.log(`\nPreflight complete: ${resolvedEntries.length} films are complete and absent from RazinFlix.`);
        console.log('No database changes made. Re-run with --commit to insert the verified batch.');
        return;
    }

    const { data: insertedRows, error: insertError } = await supabase
        .from('razinflix_films')
        .insert(resolvedEntries.map(item => item.row))
        .select('id,title,year,director,rating,poster,description,trailer_key,categories');
    if (insertError) throw new Error(`Batch insert failed: ${insertError.message}`);
    if (insertedRows?.length !== resolvedEntries.length) {
        throw new Error(`Expected ${resolvedEntries.length} inserted films; received ${insertedRows?.length ?? 0}.`);
    }

    const insertedIds = insertedRows.map(row => row.id);
    const { data: verifiedRows, error: verificationError } = await supabase
        .from('razinflix_films')
        .select('id,title,year,director,rating,poster,description,trailer_key,categories')
        .in('id', insertedIds);
    if (verificationError) throw new Error(`Post-insert verification failed: ${verificationError.message}`);

    const invalidRows = (verifiedRows ?? []).filter(row => (
        !row.title
        || row.year !== EXPECTED_YEAR
        || !row.director
        || !row.rating
        || !row.poster
        || !row.description
        || !row.trailer_key
        || row.categories?.[0] !== COLLECTION
    ));
    if ((verifiedRows?.length ?? 0) !== resolvedEntries.length || invalidRows.length) {
        throw new Error(`Post-insert validation failed for ${invalidRows.length || 'one or more'} rows.`);
    }

    console.log(`\nCommitted and re-read ${verifiedRows.length} complete films in the “${COLLECTION}” category.`);
}

main().catch(error => {
    console.error(`\nRazinFlix 2026 ingest failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
