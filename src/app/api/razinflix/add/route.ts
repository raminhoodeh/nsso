import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { openChatBudget, CHAT_MODEL, type ChatBudget } from '@/lib/deity/chat-budget-server';
import { createPrivilegedClient, permissionErrorResponse, requirePermission } from '@/lib/server/permissions';
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request';

import {
    buildSearchTitleVariants,
    fallbackRazinflixCategory,
    FilmEnrichmentError,
    matchingAliases,
    normalizeTitle,
    resolveTmdbFilmWithFallback,
    resolveTrailer,
    verifyPosterUrl,
    type FilmLookupInput,
    type ResolvedFilm,
} from '@/lib/razinflix/enrichment';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const RAZINFLIX_CATEGORIES = [
    'Critically-Acclaimed Mind-Bending Sci-Fi',
    'Visually Striking Emotional Dramas',
    'Gritty Heist & Crime Thrillers',
    'Suspenseful Psychological Mysteries',
    'Epic Historical Period Pieces',
    'Heartfelt Coming-of-Age Tales',
    'Surreal & Left-of-Center Cinema',
    'Dark Comedies & Sharp Satire',
    'Riveting Global Documentaries',
    'Classic Masterpieces of World Cinema',
    'Intense Action, War & Adventure',
    'Prestige Television & Miniseries',
    'Nostalgic Cult Classics',
    'Japanese Anime',
] as const;

interface EditorialMetadata {
    description: string;
    category: string;
}

interface ExistingFilm {
    id: number;
    title: string;
    year: string;
}

function extractJsonObject(value: string): Record<string, unknown> | null {
    const cleaned = value
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
        return null;
    }
}

async function generateEditorialMetadata(
    film: ResolvedFilm,
    geminiApiKey?: string,
    request?: Request,
): Promise<EditorialMetadata> {
    const fallbackCategory = fallbackRazinflixCategory(film);
    const fallbackDescription = film.overview || 'No verified synopsis is currently available.';

    // Japanese animation is deterministic from TMDB country and genre metadata.
    const categoryMustRemainJapaneseAnime = fallbackCategory === 'Japanese Anime';
    if (!geminiApiKey || !request) {
        return { description: fallbackDescription, category: fallbackCategory };
    }

    let budget: ChatBudget | undefined;
    try {
        budget = await openChatBudget(request, 'editorial');
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: CHAT_MODEL,
            generationConfig: { maxOutputTokens: 1024, ...{ thinkingConfig: { thinkingBudget: 0 } } } });
        const prompt = `You are formatting verified TMDB metadata for RazinFlix.

Film: ${film.title} (${film.year})
Original title: ${film.originalTitle}
Directors: ${film.directors.join(', ') || 'Not listed'}
Genres: ${film.genres.join(', ') || 'Not listed'}
Countries: ${film.originCountries.join(', ') || 'Not listed'}
Verified overview: ${film.overview || 'No overview supplied'}

Return one JSON object with exactly these keys:
- "description": Rewrite the verified overview into 2 concise, atmospheric sentences. Do not add characters, events, settings, awards, or claims absent from the overview. If no overview was supplied, return "No verified synopsis is currently available."
- "category": Select exactly one string from this list:
${RAZINFLIX_CATEGORIES.map(category => `  - ${category}`).join('\n')}

Return JSON only.`;

        const counted = await model.countTokens(prompt, { timeout: 10_000 });
        await budget.prepare(counted.totalTokens, 1024);
        const result = await model.generateContent(prompt, { timeout: 15_000, signal: AbortSignal.timeout(15_000) });
        await budget.finish(result.response.usageMetadata);
        const parsed = extractJsonObject(result.response.text());
        const proposedDescription = typeof parsed?.description === 'string'
            ? parsed.description.trim().replace(/\*\*/g, '')
            : '';
        const proposedCategory = typeof parsed?.category === 'string'
            ? parsed.category.trim()
            : '';

        return {
            description: proposedDescription.length >= 20 && proposedDescription.length <= 900
                ? proposedDescription
                : fallbackDescription,
            category: categoryMustRemainJapaneseAnime
                ? 'Japanese Anime'
                : RAZINFLIX_CATEGORIES.includes(proposedCategory as typeof RAZINFLIX_CATEGORIES[number])
                    ? proposedCategory
                    : fallbackCategory,
        };
    } catch {
        await budget?.finish();
        console.error('AI editorial enrichment unavailable; using verified TMDB metadata');
        return { description: fallbackDescription, category: fallbackCategory };
    }
}

function rowTitleAliases(title: string): Set<string> {
    const aliases = new Set<string>([normalizeTitle(title)]);
    for (const variant of buildSearchTitleVariants(title)) aliases.add(normalizeTitle(variant));
    aliases.delete('');
    return aliases;
}

export async function POST(request: Request) {
    try {
        await requirePermission('razinflix:manage', request);
        let input: FilmLookupInput;
        try {
            input = await readBoundedJson(request) as unknown as FilmLookupInput;
        } catch (error) {
            const bodyError = requestBodyErrorResponse(error);
            if (bodyError) return bodyError;
            throw new FilmEnrichmentError('INVALID_REQUEST', 'Enter a film title.', 400);
        }

        if (!input.title || typeof input.title !== 'string' || input.title.trim().length > 300) {
            throw new FilmEnrichmentError('INVALID_TITLE', 'Enter a film title.', 400);
        }

        const film = await resolveTmdbFilmWithFallback(input, [
            process.env.TMDB_API_KEY,
        ]);
        await verifyPosterUrl(film.posterUrl);
        const trailerResolution = await resolveTrailer(film, {
            youtubeApiKey: process.env.YOUTUBE_API_KEY,
            googleSearchApiKey: process.env.GOOGLE_SEARCH_API_KEY,
            googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
        });

        if (!trailerResolution.trailer) {
            throw new FilmEnrichmentError(
                'TRAILER_NOT_FOUND',
                `RazinFlix matched “${film.title}” (${film.year}) and found its poster, but could not verify a playable trailer. Nothing was saved.`,
                422,
                {
                    tmdbId: film.tmdbId,
                    diagnostics: trailerResolution.diagnostics,
                    suggestion: 'Configure YOUTUBE_API_KEY for the highest-coverage fallback search.',
                },
            );
        }

        const editorial = await generateEditorialMetadata(
            film,
            process.env.GOOGLE_GENERATIVE_AI_API_KEY,
            request,
        );

        const supabase = createPrivilegedClient();
        const { data: existingRows, error: existingLookupError } = await supabase
            .from('razinflix_films')
            .select('id,title,year')
            .eq('year', film.year);
        if (existingLookupError) throw new FilmEnrichmentError('DATABASE_LOOKUP_FAILED', 'The film library could not be checked. Please try again.', 503);

        const canonicalAliases = matchingAliases(film);
        const existingFilm = ((existingRows ?? []) as ExistingFilm[]).find(row => {
            const existingAliases = rowTitleAliases(row.title);
            return [...existingAliases].some(alias => canonicalAliases.has(alias));
        }) ?? null;
        const databaseEntry = {
            title: film.title,
            year: film.year,
            director: film.directors.join(', ') || 'Unknown',
            rating: film.rating,
            poster: film.posterUrl,
            description: editorial.description,
            trailer_key: trailerResolution.trailer.key,
            categories: [editorial.category],
        };

        // A cancelled browser batch must stop before starting another database write.
        if (request.signal.aborted) return NextResponse.json({ error: 'Film lookup cancelled. Nothing was saved.' }, { status: 499 });

        const query = existingFilm
            ? supabase.from('razinflix_films').update(databaseEntry).eq('id', existingFilm.id)
            : supabase.from('razinflix_films').insert(databaseEntry);
        const { data, error } = await query.select().single();

        if (error) {
            console.error('RazinFlix film write failed', { code: 'DATABASE_WRITE_FAILED' });
            throw new FilmEnrichmentError(
                'DATABASE_WRITE_FAILED',
                'The film was matched correctly but could not be saved.',
                500,
            );
        }

        return NextResponse.json({
            ...data,
            _posterVerified: true,
            _operation: existingFilm ? 'updated' : 'inserted',
            _match: {
                tmdbId: film.tmdbId,
                canonicalTitle: film.title,
                confidence: film.matchConfidence,
                matchedQuery: film.matchedQuery,
                posterSource: 'tmdb',
                trailerSource: trailerResolution.trailer.source,
                trailerTitle: trailerResolution.trailer.title,
                trailerConfidence: trailerResolution.trailer.confidence,
            },
        }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        const denied = permissionErrorResponse(error);
        if (denied) return denied;
        if (error instanceof FilmEnrichmentError) {
            const safeDetails = { ...error.details };
            delete safeDetails.diagnostics;
            return NextResponse.json(
                {
                    error: error.message,
                    code: error.code,
                    ...safeDetails,
                },
                { status: error.status, headers: { 'Cache-Control': 'private, no-store' } },
            );
        }

        console.error('RazinFlix add failed', { code: 'INTERNAL_ERROR' });
        return NextResponse.json(
            { error: 'RazinFlix could not complete the film lookup. Try again shortly.', code: 'INTERNAL_ERROR' },
            { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
        );
    }
}
