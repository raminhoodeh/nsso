import type { Film } from '../../components/film/MovieCard';

export const PINNED_CATEGORY_ORDER = ['New', 'Recently Added'] as const;
const VIEW_MODES = ['category', 'alpha', 'date_desc', 'rating_desc', 'rating_asc', 'update_mode'] as const;
export type FilmViewMode = typeof VIEW_MODES[number];
export interface FilmBrowseState { searchTerm: string; category: string | null; viewMode: FilmViewMode }
const COLLECTIONS = new Set(['new', 'recently added', 'uncategorized', 'uncategorised']);
const STOP_WORDS = new Set('about after again against also another before being between could during every family film finds first from have into life lives many more must other over their them then there these they this through together under very when where which while with world young'.split(' '));

export function categoryRank(title: string) {
    const rank = PINNED_CATEGORY_ORDER.indexOf(title as typeof PINNED_CATEGORY_ORDER[number]);
    return rank < 0 ? PINNED_CATEGORY_ORDER.length : rank;
}

export function matchesFilmSearch(film: Film, query: string) {
    return [film.title, film.director, film.description, ...(film.categories ?? [])]
        .some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
}

export function filterFilms(films: Film[], query: string, category: string | null) {
    return films.filter(film => (!category || film.categories?.includes(category)) && (!query.trim() || matchesFilmSearch(film, query)));
}

export function groupFilms(films: Film[]) {
    const groups: Record<string, Film[]> = {};
    for (const film of films) {
        for (const category of new Set(film.categories?.length ? film.categories : ['Uncategorized'])) {
            (groups[category] ??= []).push(film);
        }
    }
    return Object.entries(groups).sort(([a], [b]) => categoryRank(a) - categoryRank(b));
}

function tokens(description: string) {
    return new Set(description.toLocaleLowerCase().match(/[\p{L}]{4,}/gu)?.filter(word => !STOP_WORDS.has(word)) ?? []);
}

export function recommendFilms(film: Film, films: Film[], limit = 12) {
    const target = tokens(film.description || '');
    const categories = new Set(film.categories?.filter(category => !COLLECTIONS.has(category.toLocaleLowerCase())));
    return films.filter(candidate => candidate.id !== film.id).map(candidate => {
        const sameDirector = Boolean(film.director?.trim() && !/unknown|n\/a/i.test(film.director) && candidate.director?.toLocaleLowerCase() === film.director.toLocaleLowerCase());
        const overlap = candidate.categories?.filter(category => categories.has(category)).length ?? 0;
        const candidateTokens = tokens(candidate.description || '');
        const shared = [...candidateTokens].filter(word => target.has(word)).length;
        const similarity = shared / Math.max(1, new Set([...target, ...candidateTokens]).size);
        const relevant = sameDirector || overlap > 0 || (shared >= 3 && similarity >= 0.12);
        return { candidate, score: relevant ? Number(sameDirector) * 100 + overlap * 20 + similarity * 10 : 0 };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title)).slice(0, limit).map(item => item.candidate);
}

export function formatFilmRating(rating: string | null | undefined) {
    if (!rating || /^(?:n\/a|unknown|tbd)$/i.test(rating.trim())) return 'Not rated';
    const match = rating.trim().match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*10)?(?:\s*\([^)]*\))?$/);
    const numeric = match ? Number(match[1]) : NaN;
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 10 ? `${numeric.toFixed(1)}/10` : 'Not rated';
}

export function filmUrl(current: string, filmId?: number) {
    const url = new URL(current);
    if (filmId) url.searchParams.set('film', String(filmId));
    else url.searchParams.delete('film');
    url.searchParams.delete('play');
    return url;
}

export function readFilmBrowseUrl(current: string): FilmBrowseState {
    const url = new URL(current);
    const requestedView = url.searchParams.get('view');
    return {
        searchTerm: (url.searchParams.get('q') ?? '').slice(0, 300),
        category: url.searchParams.get('category')?.slice(0, 150).trim() || null,
        viewMode: VIEW_MODES.includes(requestedView as FilmViewMode) ? requestedView as FilmViewMode : 'category',
    };
}

export function filmBrowseUrl(current: string, state: FilmBrowseState) {
    const url = filmUrl(current);
    for (const [key, value] of Object.entries({ q: state.searchTerm.trim(), category: state.category, view: state.viewMode === 'category' ? null : state.viewMode })) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
    }
    return url;
}
