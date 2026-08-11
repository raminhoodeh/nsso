const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w780';

type Fetcher = typeof fetch;

interface TmdbSearchMovie {
    id: number;
    title: string;
    original_title: string;
    release_date?: string;
    poster_path?: string | null;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
}

interface TmdbSearchResponse {
    results?: TmdbSearchMovie[];
}

interface TmdbImage {
    file_path: string;
    iso_639_1?: string | null;
    vote_average?: number;
    vote_count?: number;
    width?: number;
    height?: number;
}

interface TmdbVideo {
    key: string;
    name: string;
    site: string;
    type: string;
    official?: boolean;
    iso_639_1?: string | null;
    published_at?: string;
}

interface TmdbMovieDetails extends TmdbSearchMovie {
    overview?: string;
    original_language?: string;
    origin_country?: string[];
    production_countries?: Array<{ iso_3166_1: string; name: string }>;
    genres?: Array<{ id: number; name: string }>;
    credits?: {
        crew?: Array<{ job: string; department?: string; name: string }>;
    };
    alternative_titles?: {
        titles?: Array<{ iso_3166_1?: string; title: string; type?: string }>;
    };
    images?: {
        posters?: TmdbImage[];
    };
    videos?: {
        results?: TmdbVideo[];
    };
}

interface RankedTmdbMovie {
    movie: TmdbSearchMovie;
    score: number;
    titleSimilarity: number;
    matchedQuery: string;
}

interface YoutubeSearchResponse {
    items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
    }>;
    error?: { message?: string };
}

interface YoutubeVideosResponse {
    items?: Array<{
        id: string;
        snippet?: { title?: string; channelTitle?: string };
        status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
        contentDetails?: { duration?: string };
    }>;
    error?: { message?: string };
}

interface GoogleSearchResponse {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
    error?: { message?: string };
}

export interface FilmLookupInput {
    title: string;
    year?: string | number | null;
}

export interface FilmMatchCandidate {
    id: number;
    title: string;
    year: string | null;
    poster: string | null;
}

export interface ResolvedFilm {
    tmdbId: number;
    title: string;
    originalTitle: string;
    year: string;
    posterUrl: string;
    overview: string;
    rating: string;
    directors: string[];
    genres: string[];
    originCountries: string[];
    aliases: string[];
    videos: TmdbVideo[];
    matchConfidence: number;
    matchedQuery: string;
}

export interface ResolvedTrailer {
    key: string;
    title: string;
    source: 'tmdb' | 'youtube' | 'google-search';
    confidence: number;
}

export interface TrailerResolution {
    trailer: ResolvedTrailer | null;
    diagnostics: string[];
}

export interface TrailerCredentials {
    youtubeApiKey?: string;
    googleSearchApiKey?: string;
    googleSearchEngineId?: string;
}

export class FilmEnrichmentError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: Record<string, unknown>;

    constructor(
        code: string,
        message: string,
        status: number,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'FilmEnrichmentError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

const NEGATIVE_TRAILER_TERMS = /\b(review|reaction|recap|analysis|explained|gameplay|walkthrough|ending|scene|clip|soundtrack|full\s*(movie|film)|fan\s*made|concept\s*trailer|trailer\s*reaction)\b/i;
const GENERIC_TITLE_SUFFIX = /\s+(?:(?:official|full)\s+)?(?:movie|film|trailer)\s*$/i;

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

function asYear(value: string | number | null | undefined): string | null {
    const text = String(value ?? '').trim();
    if (!/^(18|19|20)\d{2}$/.test(text)) return null;
    const year = Number(text);
    const latestReasonableYear = new Date().getUTCFullYear() + 5;
    return year <= latestReasonableYear ? text : null;
}

function cleanDisplayTitle(value: string): string {
    return value
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/\s+/g, ' ');
}

export function normalizeTitle(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[’']/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

export function buildSearchTitleVariants(rawTitle: string): string[] {
    const initial = cleanDisplayTitle(rawTitle);
    const values = new Set<string>();

    const add = (value: string) => {
        const cleaned = cleanDisplayTitle(value);
        if (normalizeTitle(cleaned).length >= 2) values.add(cleaned);
    };

    add(initial);

    let simplified = initial;
    while (GENERIC_TITLE_SUFFIX.test(simplified)) {
        simplified = simplified.replace(GENERIC_TITLE_SUFFIX, '').trim();
        add(simplified);
    }

    const colonIndex = simplified.indexOf(':');
    if (colonIndex > 2) add(simplified.slice(0, colonIndex));

    return [...values].slice(0, 4);
}

function parseLookupInput(input: FilmLookupInput): {
    title: string;
    year: string | null;
    variants: string[];
    softYearRawTitle: string | null;
} {
    const rawTitle = cleanDisplayTitle(String(input.title ?? ''));
    let title = rawTitle;
    let year = asYear(input.year);
    let softYearRawTitle: string | null = null;

    if (!year) {
        const parenthesizedYear = title.match(/^(.+?)\s*\(((?:18|19|20)\d{2})\)$/);
        if (parenthesizedYear?.[1]?.trim()) {
            title = cleanDisplayTitle(parenthesizedYear[1]);
            year = asYear(parenthesizedYear[2]);
        } else {
            const possibleBareYear = title.match(/^(.+?)\s+((?:18|19|20)\d{2})$/);
            const inferredYear = asYear(possibleBareYear?.[2]);
            const titleBeforeYear = possibleBareYear?.[1]?.trim() ?? '';
            const yearLooksLikePartOfTitle = /\b(of|in|from|since|until)$/i.test(titleBeforeYear);
            if (titleBeforeYear && inferredYear && !yearLooksLikePartOfTitle) {
                softYearRawTitle = rawTitle;
                title = cleanDisplayTitle(titleBeforeYear);
                year = inferredYear;
            }
        }
    }

    if (!title) {
        throw new FilmEnrichmentError('INVALID_TITLE', 'Enter a film title.', 400);
    }

    const variants = softYearRawTitle
        ? [...new Set([softYearRawTitle, ...buildSearchTitleVariants(title)])]
        : buildSearchTitleVariants(title);

    return { title, year, variants, softYearRawTitle };
}

function tokenSimilarity(left: string, right: string): number {
    const a = new Set(normalizeTitle(left).split(' ').filter(Boolean));
    const b = new Set(normalizeTitle(right).split(' ').filter(Boolean));
    if (!a.size || !b.size) return 0;

    const overlap = [...a].filter(token => b.has(token)).length;
    const precision = overlap / a.size;
    const recall = overlap / b.size;
    return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function levenshteinSimilarity(left: string, right: string): number {
    const a = normalizeTitle(left);
    const b = normalizeTitle(right);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = previous[j];
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
            diagonal = above;
        }
    }

    return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function titleSimilarity(left: string, right: string): number {
    const a = normalizeTitle(left);
    const b = normalizeTitle(right);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    const lengthRatio = shorter.length / longer.length;

    if (longer.startsWith(`${shorter} `)) return 0.9 + Math.min(0.08, lengthRatio * 0.08);
    if (longer.includes(` ${shorter} `) || longer.endsWith(` ${shorter}`)) {
        return 0.84 + Math.min(0.08, lengthRatio * 0.08);
    }

    return Math.max(tokenSimilarity(a, b) * 0.88, levenshteinSimilarity(a, b) * 0.82);
}

async function fetchJson<T>(
    url: string,
    fetcher: Fetcher,
    serviceName: string,
    attempts = 2,
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        try {
            const response = await fetcher(url, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            const body = await response.text();
            let data: unknown = {};
            try {
                data = body ? JSON.parse(body) : {};
            } catch {
                data = {};
            }

            if (!response.ok) {
                const message = typeof data === 'object' && data && 'error' in data
                    ? JSON.stringify((data as { error: unknown }).error)
                    : body.slice(0, 200);
                const error = new Error(`${serviceName} request failed (${response.status}): ${message}`);
                if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
                    lastError = error;
                    await sleep(200 * (attempt + 1));
                    continue;
                }
                throw error;
            }

            return data as T;
        } catch (error) {
            lastError = error;
            if (attempt + 1 < attempts) {
                await sleep(200 * (attempt + 1));
                continue;
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`${serviceName} request failed.`);
}

function releaseYear(movie: Pick<TmdbSearchMovie, 'release_date'>): string | null {
    return asYear(movie.release_date?.slice(0, 4));
}

export function scoreTmdbCandidate(
    movie: TmdbSearchMovie,
    variants: string[],
    requestedYear: string | null,
    matchedQuery = variants[0] ?? '',
): number {
    const candidateTitles = [movie.title, movie.original_title].filter(Boolean);
    const similarity = Math.max(
        ...variants.flatMap(variant => candidateTitles.map(title => titleSimilarity(variant, title))),
    );
    const exact = variants.some(variant => candidateTitles.some(title => normalizeTitle(variant) === normalizeTitle(title)));

    let score = similarity * 70;
    if (exact) score += 18;

    const candidateYear = releaseYear(movie);
    if (requestedYear && candidateYear) {
        const difference = Math.abs(Number(requestedYear) - Number(candidateYear));
        if (difference === 0) score += 25;
        else if (difference === 1) score += 8;
        else score -= Math.min(40, difference * 8);
    }

    if (movie.poster_path) score += 6;
    score += Math.min(4, Math.log10(Math.max(1, movie.vote_count ?? 0) + 1));
    if (normalizeTitle(matchedQuery) === normalizeTitle(variants[0] ?? '')) score += 2;

    return score;
}

function publicCandidates(ranked: RankedTmdbMovie[]): FilmMatchCandidate[] {
    return ranked.slice(0, 5).map(({ movie }) => ({
        id: movie.id,
        title: movie.title,
        year: releaseYear(movie),
        poster: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
    }));
}

function selectPosterPath(details: TmdbMovieDetails): string | null {
    const posters = new Map<string, { image: TmdbImage; primary: boolean }>();

    if (details.poster_path) {
        posters.set(details.poster_path, {
            image: { file_path: details.poster_path },
            primary: true,
        });
    }

    for (const image of details.images?.posters ?? []) {
        const existing = posters.get(image.file_path);
        posters.set(image.file_path, { image, primary: existing?.primary ?? false });
    }

    const originalLanguage = details.original_language ?? '';
    const ranked = [...posters.values()].sort((left, right) => {
        const score = ({ image, primary }: { image: TmdbImage; primary: boolean }) => {
            let value = primary ? 24 : 0;
            if (image.iso_639_1 === 'en') value += 20;
            else if (image.iso_639_1 === null || image.iso_639_1 === undefined) value += 12;
            else if (image.iso_639_1 === originalLanguage) value += 10;
            value += Math.min(10, image.vote_average ?? 0);
            value += Math.min(5, Math.log10((image.vote_count ?? 0) + 1));
            if ((image.width ?? 0) >= 1000) value += 3;
            if (image.width && image.height) {
                const aspectRatio = image.width / image.height;
                if (Math.abs(aspectRatio - 2 / 3) < 0.08) value += 2;
            }
            return value;
        };
        return score(right) - score(left);
    });

    return ranked[0]?.image.file_path ?? null;
}

function isAmbiguous(ranked: RankedTmdbMovie[], requestedYear: string | null): boolean {
    const [first, second] = ranked;
    if (!first || !second) return false;

    const firstYear = releaseYear(first.movie);
    const secondYear = releaseYear(second.movie);
    const sameTitle = normalizeTitle(first.movie.title) === normalizeTitle(second.movie.title);

    if (!requestedYear && sameTitle && firstYear !== secondYear) return true;
    return first.score - second.score < 3 && firstYear !== secondYear;
}

export async function resolveTmdbFilm(
    input: FilmLookupInput,
    tmdbApiKey: string,
    fetcher: Fetcher = fetch,
): Promise<ResolvedFilm> {
    if (!tmdbApiKey) {
        throw new FilmEnrichmentError('TMDB_NOT_CONFIGURED', 'TMDB is not configured.', 500);
    }

    const parsed = parseLookupInput(input);
    const searches: Array<{
        query: string;
        year: string | null;
        scoringYear: string | null;
        hypothesisAdjustment: number;
    }> = [];
    const seenSearches = new Set<string>();

    for (const query of parsed.variants.slice(0, 3)) {
        const isSoftRawTitle = parsed.softYearRawTitle !== null
            && normalizeTitle(query) === normalizeTitle(parsed.softYearRawTitle);
        const searchYears = parsed.year && !isSoftRawTitle ? [parsed.year, null] : [null];

        for (const year of searchYears) {
            const scoringYear = isSoftRawTitle ? null : parsed.year;
            const hypothesisAdjustment = parsed.softYearRawTitle === null
                ? 0
                : isSoftRawTitle ? 30 : -10;
            const key = `${normalizeTitle(query)}|${year ?? ''}|${scoringYear ?? ''}|${hypothesisAdjustment}`;
            if (!seenSearches.has(key)) {
                searches.push({ query, year, scoringYear, hypothesisAdjustment });
                seenSearches.add(key);
            }
        }
    }

    const responses = await Promise.allSettled(searches.map(async search => {
        const parameters = new URLSearchParams({
            api_key: tmdbApiKey,
            query: search.query,
            include_adult: 'false',
            language: 'en-US',
            page: '1',
        });
        if (search.year) parameters.set('primary_release_year', search.year);
        const data = await fetchJson<TmdbSearchResponse>(
            `${TMDB_API_BASE}/search/movie?${parameters}`,
            fetcher,
            'TMDB search',
        );
        return { search, movies: data.results ?? [] };
    }));

    const successfulResponses = responses
        .filter((result): result is PromiseFulfilledResult<{
            search: { query: string; year: string | null; scoringYear: string | null; hypothesisAdjustment: number };
            movies: TmdbSearchMovie[];
        }> => result.status === 'fulfilled')
        .map(result => result.value);

    if (!successfulResponses.length) {
        const reason = responses.find(result => result.status === 'rejected');
        console.error('TMDB lookup failed:', reason?.status === 'rejected' ? reason.reason : 'Unknown error');
        throw new FilmEnrichmentError(
            'TMDB_UNAVAILABLE',
            'The movie database could not be reached. Try again shortly.',
            502,
        );
    }

    const rankedById = new Map<number, RankedTmdbMovie>();
    for (const { search, movies } of successfulResponses) {
        for (const movie of movies) {
            const score = scoreTmdbCandidate(movie, [search.query], search.scoringYear, search.query)
                + search.hypothesisAdjustment;
            const current = rankedById.get(movie.id);
            if (!current || score > current.score) {
                rankedById.set(movie.id, {
                    movie,
                    score,
                    titleSimilarity: Math.max(
                        titleSimilarity(search.query, movie.title),
                        titleSimilarity(search.query, movie.original_title),
                    ),
                    matchedQuery: search.query,
                });
            }
        }
    }

    const ranked = [...rankedById.values()].sort((left, right) => right.score - left.score);
    const best = ranked[0];

    if (!best || best.score < 72 || best.titleSimilarity < 0.7) {
        throw new FilmEnrichmentError(
            'FILM_NOT_FOUND',
            `RazinFlix could not confidently match “${parsed.title}”${parsed.year ? ` (${parsed.year})` : ''}. Check the title or add the release year.`,
            404,
            { candidates: publicCandidates(ranked) },
        );
    }

    if (isAmbiguous(ranked, parsed.year)) {
        throw new FilmEnrichmentError(
            'AMBIGUOUS_FILM',
            `Several films match “${parsed.title}”. Add the four-digit release year so RazinFlix selects the correct one.`,
            409,
            { candidates: publicCandidates(ranked) },
        );
    }

    const detailParameters = new URLSearchParams({
        api_key: tmdbApiKey,
        language: 'en-US',
        append_to_response: 'videos,credits,alternative_titles,images',
        include_image_language: 'en,null',
    });
    let details: TmdbMovieDetails;
    try {
        details = await fetchJson<TmdbMovieDetails>(
            `${TMDB_API_BASE}/movie/${best.movie.id}?${detailParameters}`,
            fetcher,
            'TMDB movie details',
        );
    } catch (error) {
        console.error('TMDB detail lookup failed:', error);
        throw new FilmEnrichmentError(
            'TMDB_DETAILS_UNAVAILABLE',
            `RazinFlix matched “${best.movie.title}” but could not retrieve its verified metadata.`,
            502,
        );
    }

    const posterPath = selectPosterPath(details);
    if (!posterPath) {
        throw new FilmEnrichmentError(
            'POSTER_NOT_FOUND',
            `RazinFlix matched “${details.title}”, but TMDB has no poster for this release. Nothing was saved.`,
            422,
            { tmdbId: details.id },
        );
    }

    const year = releaseYear(details) ?? parsed.year;
    if (!year) {
        throw new FilmEnrichmentError(
            'YEAR_NOT_FOUND',
            `RazinFlix matched “${details.title}”, but could not verify its release year.`,
            422,
        );
    }

    let videos = details.videos?.results ?? [];
    if (!videos.length) {
        try {
            const videoParameters = new URLSearchParams({ api_key: tmdbApiKey });
            const videoData = await fetchJson<{ results?: TmdbVideo[] }>(
                `${TMDB_API_BASE}/movie/${details.id}/videos?${videoParameters}`,
                fetcher,
                'TMDB videos',
            );
            videos = videoData.results ?? [];
        } catch (error) {
            console.warn('TMDB video fallback failed:', error);
        }
    }

    const aliases = [
        details.title,
        details.original_title,
        ...parsed.variants,
        ...(details.alternative_titles?.titles ?? []).map(item => item.title),
    ].filter(Boolean);

    const directors = [...new Set(
        (details.credits?.crew ?? [])
            .filter(member => member.job === 'Director')
            .map(member => member.name),
    )];
    const originCountries = [...new Set([
        ...(details.origin_country ?? []),
        ...(details.production_countries ?? []).map(country => country.iso_3166_1),
    ])];

    return {
        tmdbId: details.id,
        title: details.title,
        originalTitle: details.original_title,
        year,
        posterUrl: `${TMDB_IMAGE_BASE}${posterPath}`,
        overview: details.overview?.trim() ?? '',
        rating: details.vote_average && details.vote_average > 0
            ? `${details.vote_average.toFixed(1)}/10`
            : 'N/A',
        directors,
        genres: (details.genres ?? []).map(genre => genre.name),
        originCountries,
        aliases: [...new Set(aliases)],
        videos,
        matchConfidence: Math.min(99, Math.round(best.score)),
        matchedQuery: best.matchedQuery,
    };
}

export async function resolveTmdbFilmWithFallback(
    input: FilmLookupInput,
    apiKeys: Array<string | null | undefined>,
    fetcher: Fetcher = fetch,
): Promise<ResolvedFilm> {
    const keys = [...new Set(apiKeys.map(key => key?.trim()).filter((key): key is string => Boolean(key)))];
    if (!keys.length) {
        throw new FilmEnrichmentError('TMDB_NOT_CONFIGURED', 'TMDB is not configured.', 500);
    }

    let lastError: unknown;
    for (const apiKey of keys) {
        try {
            return await resolveTmdbFilm(input, apiKey, fetcher);
        } catch (error) {
            lastError = error;
            const canRetryWithAnotherKey = error instanceof FilmEnrichmentError
                && (error.code === 'TMDB_UNAVAILABLE' || error.code === 'TMDB_DETAILS_UNAVAILABLE');
            if (!canRetryWithAnotherKey) throw error;
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new FilmEnrichmentError('TMDB_UNAVAILABLE', 'The movie database could not be reached. Try again shortly.', 502);
}

export async function verifyPosterUrl(
    posterUrl: string,
    fetcher: Fetcher = fetch,
): Promise<void> {
    if (!/^https:\/\//i.test(posterUrl) || /placeholder|no[-_ ]?image|nopicture|null/i.test(posterUrl)) {
        throw new FilmEnrichmentError(
            'POSTER_UNAVAILABLE',
            'The matched film does not have valid poster artwork. Nothing was saved.',
            422,
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetcher(posterUrl, {
            headers: { Accept: 'image/*', Range: 'bytes=0-2048' },
            redirect: 'follow',
            signal: controller.signal,
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
            throw new Error(`Poster returned ${response.status} ${contentType || 'without a content type'}.`);
        }
        await response.body?.cancel().catch(() => undefined);
    } catch (error) {
        console.error('Poster verification failed:', error);
        throw new FilmEnrichmentError(
            'POSTER_UNAVAILABLE',
            'RazinFlix matched the film, but its poster could not be loaded. Nothing was saved.',
            502,
        );
    } finally {
        clearTimeout(timeout);
    }
}

function parseIsoDuration(value: string | undefined): number | null {
    if (!value) return null;
    const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return null;
    return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function isYoutubeId(value: string | undefined): value is string {
    return Boolean(value && /^[a-zA-Z0-9_-]{11}$/.test(value));
}

export function extractYoutubeId(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.hostname === 'youtu.be') return isYoutubeId(url.pathname.slice(1)) ? url.pathname.slice(1) : null;
        if (url.hostname.endsWith('youtube.com')) {
            const watchId = url.searchParams.get('v');
            if (isYoutubeId(watchId ?? undefined)) return watchId;
            const pathMatch = url.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
            return pathMatch?.[1] ?? null;
        }
    } catch {
        return null;
    }
    return null;
}

function scoreTrailerText(
    title: string,
    film: ResolvedFilm,
    durationSeconds: number | null,
    channelTitle = '',
): number {
    if (NEGATIVE_TRAILER_TERMS.test(title)) return -100;

    const usefulAliases = film.aliases
        .filter(alias => normalizeTitle(alias).length >= 4)
        .sort((left, right) => left.length - right.length)
        .slice(0, 12);
    const similarity = Math.max(...usefulAliases.map(alias => titleSimilarity(alias, title)), titleSimilarity(film.title, title));
    let score = similarity * 60;
    const lowerTitle = title.toLowerCase();

    if (/\bofficial\s+(movie\s+)?trailer\b/i.test(title)) score += 25;
    else if (/\btrailer\b/i.test(title)) score += 17;
    else if (/\bteaser\b/i.test(title)) score += 8;

    if (lowerTitle.includes(film.year)) score += 7;
    if (/official|studio|pictures|films|entertainment|network/i.test(channelTitle)) score += 4;

    if (durationSeconds !== null) {
        if (durationSeconds >= 30 && durationSeconds <= 8 * 60) score += 9;
        else if (durationSeconds > 20 * 60) score -= 25;
        else if (durationSeconds < 15) score -= 15;
    }

    return score;
}

export function scoreTmdbTrailer(video: TmdbVideo, film: ResolvedFilm): number {
    if (video.site.toLowerCase() !== 'youtube' || !isYoutubeId(video.key)) return -100;
    if (NEGATIVE_TRAILER_TERMS.test(video.name)) return -100;

    let score = scoreTrailerText(video.name, film, null);
    if (video.type === 'Trailer') score += 55;
    else if (video.type === 'Teaser') score += 25;
    else score -= 20;
    if (video.official) score += 18;
    if (video.iso_639_1 === 'en') score += 6;
    return score;
}

async function verifyYoutubeOEmbed(videoId: string, fetcher: Fetcher): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    try {
        const url = new URL('https://www.youtube.com/oembed');
        url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
        url.searchParams.set('format', 'json');
        const response = await fetcher(url, { signal: controller.signal });
        return response.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

async function resolveTmdbTrailer(film: ResolvedFilm, fetcher: Fetcher): Promise<ResolvedTrailer | null> {
    const ranked = film.videos
        .map(video => ({ video, score: scoreTmdbTrailer(video, film) }))
        .filter(candidate => candidate.score >= 45)
        .sort((left, right) => right.score - left.score);

    for (const candidate of ranked.slice(0, 5)) {
        if (await verifyYoutubeOEmbed(candidate.video.key, fetcher)) {
            return {
                key: candidate.video.key,
                title: candidate.video.name,
                source: 'tmdb',
                confidence: Math.min(99, Math.round(candidate.score)),
            };
        }
    }

    return null;
}

async function resolveYoutubeApiTrailer(
    film: ResolvedFilm,
    apiKey: string,
    fetcher: Fetcher,
): Promise<ResolvedTrailer | null> {
    const shortestAlias = film.aliases
        .filter(alias => normalizeTitle(alias).length >= 4)
        .sort((left, right) => left.length - right.length)[0];
    const queryTitles = [...new Set([film.title, shortestAlias].filter(Boolean))].slice(0, 2);
    const searchResults: Array<{ videoId: string; title: string; channelTitle: string }> = [];

    for (const queryTitle of queryTitles) {
        const parameters = new URLSearchParams({
            key: apiKey,
            part: 'snippet',
            q: `"${queryTitle}" ${film.year} trailer`,
            type: 'video',
            maxResults: '10',
            order: 'relevance',
            safeSearch: 'moderate',
            videoEmbeddable: 'true',
            videoSyndicated: 'true',
        });
        const data = await fetchJson<YoutubeSearchResponse>(
            `https://www.googleapis.com/youtube/v3/search?${parameters}`,
            fetcher,
            'YouTube search',
            1,
        );
        for (const item of data.items ?? []) {
            const videoId = item.id?.videoId;
            if (isYoutubeId(videoId)) {
                searchResults.push({
                    videoId,
                    title: item.snippet?.title ?? '',
                    channelTitle: item.snippet?.channelTitle ?? '',
                });
            }
        }
    }

    const unique = [...new Map(searchResults.map(item => [item.videoId, item])).values()];
    if (!unique.length) return null;

    const detailParameters = new URLSearchParams({
        key: apiKey,
        part: 'snippet,status,contentDetails',
        id: unique.map(item => item.videoId).join(','),
    });
    const detailData = await fetchJson<YoutubeVideosResponse>(
        `https://www.googleapis.com/youtube/v3/videos?${detailParameters}`,
        fetcher,
        'YouTube video validation',
        1,
    );

    const ranked = (detailData.items ?? [])
        .filter(item => item.status?.embeddable !== false)
        .filter(item => !item.status?.privacyStatus || item.status.privacyStatus === 'public')
        .filter(item => !item.status?.uploadStatus || item.status.uploadStatus === 'processed')
        .map(item => {
            const title = item.snippet?.title ?? unique.find(result => result.videoId === item.id)?.title ?? '';
            const channelTitle = item.snippet?.channelTitle ?? unique.find(result => result.videoId === item.id)?.channelTitle ?? '';
            return {
                item,
                title,
                score: scoreTrailerText(title, film, parseIsoDuration(item.contentDetails?.duration), channelTitle),
            };
        })
        .filter(candidate => candidate.score >= 62)
        .sort((left, right) => right.score - left.score);

    const best = ranked[0];
    return best ? {
        key: best.item.id,
        title: best.title,
        source: 'youtube',
        confidence: Math.min(99, Math.round(best.score)),
    } : null;
}

async function resolveGoogleSearchTrailer(
    film: ResolvedFilm,
    apiKey: string,
    searchEngineId: string,
    fetcher: Fetcher,
): Promise<ResolvedTrailer | null> {
    const parameters = new URLSearchParams({
        key: apiKey,
        cx: searchEngineId,
        q: `"${film.title}" ${film.year} trailer site:youtube.com/watch`,
        num: '10',
        safe: 'active',
    });
    const data = await fetchJson<GoogleSearchResponse>(
        `https://www.googleapis.com/customsearch/v1?${parameters}`,
        fetcher,
        'Google trailer search',
        1,
    );

    const ranked = (data.items ?? [])
        .map(item => {
            const videoId = extractYoutubeId(item.link ?? '');
            const title = item.title ?? '';
            return {
                videoId,
                title,
                score: videoId ? scoreTrailerText(`${title} ${item.snippet ?? ''}`, film, null) : -100,
            };
        })
        .filter((candidate): candidate is { videoId: string; title: string; score: number } => Boolean(candidate.videoId) && candidate.score >= 62)
        .sort((left, right) => right.score - left.score);

    for (const candidate of ranked.slice(0, 5)) {
        if (await verifyYoutubeOEmbed(candidate.videoId, fetcher)) {
            return {
                key: candidate.videoId,
                title: candidate.title,
                source: 'google-search',
                confidence: Math.min(99, Math.round(candidate.score)),
            };
        }
    }

    return null;
}

export async function resolveTrailer(
    film: ResolvedFilm,
    credentials: TrailerCredentials,
    fetcher: Fetcher = fetch,
): Promise<TrailerResolution> {
    const diagnostics: string[] = [];

    const tmdbTrailer = await resolveTmdbTrailer(film, fetcher);
    if (tmdbTrailer) return { trailer: tmdbTrailer, diagnostics };
    diagnostics.push('TMDB did not provide a playable trailer.');

    if (credentials.youtubeApiKey) {
        try {
            const youtubeTrailer = await resolveYoutubeApiTrailer(film, credentials.youtubeApiKey, fetcher);
            if (youtubeTrailer) return { trailer: youtubeTrailer, diagnostics };
            diagnostics.push('YouTube returned no high-confidence trailer candidate.');
        } catch (error) {
            console.error('YouTube trailer fallback failed:', error);
            diagnostics.push('The YouTube Data API rejected or failed the fallback search.');
        }
    } else {
        diagnostics.push('YOUTUBE_API_KEY is not configured.');
    }

    if (credentials.googleSearchApiKey && credentials.googleSearchEngineId) {
        try {
            const googleTrailer = await resolveGoogleSearchTrailer(
                film,
                credentials.googleSearchApiKey,
                credentials.googleSearchEngineId,
                fetcher,
            );
            if (googleTrailer) return { trailer: googleTrailer, diagnostics };
            diagnostics.push('Google Search returned no high-confidence trailer candidate.');
        } catch (error) {
            console.error('Google trailer fallback failed:', error);
            diagnostics.push('Google Custom Search rejected or failed the fallback search.');
        }
    }

    return { trailer: null, diagnostics };
}

export function fallbackRazinflixCategory(film: ResolvedFilm): string {
    const genres = new Set(film.genres.map(genre => genre.toLowerCase()));
    const isJapanese = film.originCountries.includes('JP');

    if (isJapanese && genres.has('animation')) return 'Japanese Anime';
    if (genres.has('documentary')) return 'Riveting Global Documentaries';
    if (genres.has('science fiction') || genres.has('fantasy')) return 'Critically-Acclaimed Mind-Bending Sci-Fi';
    if (genres.has('crime')) return 'Gritty Heist & Crime Thrillers';
    if (genres.has('mystery') || genres.has('thriller') || genres.has('horror')) return 'Suspenseful Psychological Mysteries';
    if (genres.has('history')) return 'Epic Historical Period Pieces';
    if (genres.has('war') || genres.has('action') || genres.has('adventure')) return 'Intense Action, War & Adventure';
    if (genres.has('comedy')) return 'Dark Comedies & Sharp Satire';
    if (genres.has('drama') || genres.has('romance')) return 'Visually Striking Emotional Dramas';
    if (genres.has('animation')) return 'Surreal & Left-of-Center Cinema';
    return 'Classic Masterpieces of World Cinema';
}

export function matchingAliases(film: ResolvedFilm): Set<string> {
    const aliases = new Set<string>();
    for (const title of film.aliases) {
        aliases.add(normalizeTitle(title));
        for (const variant of buildSearchTitleVariants(title)) aliases.add(normalizeTitle(variant));
    }
    aliases.delete('');
    return aliases;
}
