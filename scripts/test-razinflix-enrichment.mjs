import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildSearchTitleVariants,
    extractYoutubeId,
    fallbackRazinflixCategory,
    FilmEnrichmentError,
    normalizeTitle,
    resolveTmdbFilm,
    resolveTmdbFilmWithFallback,
    resolveTrailer,
    scoreTmdbCandidate,
    scoreTmdbTrailer,
    titleSimilarity,
    verifyPosterUrl,
} from '../src/lib/razinflix/enrichment.ts';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const testWithTmdb = TMDB_API_KEY ? test : test.skip;

test('normalizes noisy film input without losing the original query', () => {
    assert.equal(normalizeTitle('  Amelie & Friends  '), 'amelie and friends');
    assert.deepEqual(
        buildSearchTitleVariants('Crystal Triangle movie'),
        ['Crystal Triangle movie', 'Crystal Triangle'],
    );
    assert.deepEqual(
        buildSearchTitleVariants('Scary Movie'),
        ['Scary Movie', 'Scary'],
    );
});

test('scores the correct TMDB title and release above unrelated results', () => {
    const correct = scoreTmdbCandidate({
        id: 69840,
        title: 'Crystal Triangle: The Forbidden Revelation',
        original_title: 'Crystal Triangle: The Forbidden Revelation',
        release_date: '1987-07-22',
        poster_path: '/poster.jpg',
        vote_count: 25,
    }, ['Crystal Triangle movie', 'Crystal Triangle'], '1987', 'Crystal Triangle');
    const wrong = scoreTmdbCandidate({
        id: 1,
        title: 'The Black Crystal',
        original_title: 'The Black Crystal',
        release_date: '1990-09-01',
        poster_path: '/wrong.jpg',
        vote_count: 200,
    }, ['Crystal Triangle movie', 'Crystal Triangle'], '1987', 'Crystal Triangle');

    assert.ok(correct > 90);
    assert.ok(correct > wrong + 30);
    assert.ok(titleSimilarity('Crystal Triangle', 'Crystal Triangle: The Forbidden Revelation') > 0.9);
});

test('extracts only valid YouTube video identifiers', () => {
    assert.equal(extractYoutubeId('https://www.youtube.com/watch?v=99YuIQFIKwE'), '99YuIQFIKwE');
    assert.equal(extractYoutubeId('https://youtu.be/99YuIQFIKwE'), '99YuIQFIKwE');
    assert.equal(extractYoutubeId('https://www.youtube.com/channel/example'), null);
});

test('prefers an attached TMDB trailer and rejects review content', () => {
    const film = {
        tmdbId: 69840,
        title: 'Crystal Triangle: The Forbidden Revelation',
        originalTitle: 'Crystal Triangle: The Forbidden Revelation',
        year: '1987',
        posterUrl: 'https://image.tmdb.org/poster.jpg',
        overview: 'Overview',
        rating: '6.0/10',
        directors: ['Seiji Okuda'],
        genres: ['Animation'],
        originCountries: ['JP'],
        aliases: ['Crystal Triangle', 'Crystal Triangle: The Forbidden Revelation'],
        videos: [],
        matchConfidence: 99,
        matchedQuery: 'Crystal Triangle',
    };
    const trailer = scoreTmdbTrailer({
        key: '99YuIQFIKwE',
        name: "Forgotten Junk: Gaga Communications' Crystal Triangle trailer",
        site: 'YouTube',
        type: 'Trailer',
        iso_639_1: 'en',
    }, film);
    const review = scoreTmdbTrailer({
        key: 'zpHBzTqAcAo',
        name: 'Crystal Triangle review and reaction',
        site: 'YouTube',
        type: 'Trailer',
        iso_639_1: 'en',
    }, film);

    assert.ok(trailer > 90);
    assert.equal(review, -100);
    assert.equal(fallbackRazinflixCategory(film), 'Japanese Anime');
});

testWithTmdb('live TMDB integration resolves the exact Crystal Triangle poster and trailer', async () => {
    const film = await resolveTmdbFilm(
        { title: 'crystal triangle movie', year: '1987' },
        TMDB_API_KEY,
    );
    const trailer = await resolveTrailer(film, {});

    assert.equal(film.tmdbId, 69840);
    assert.equal(film.title, 'Crystal Triangle: The Forbidden Revelation');
    assert.equal(film.year, '1987');
    assert.match(film.posterUrl, /iZv6QX67sB4FUcplRhGK1fb996g\.jpg$/);
    assert.ok(film.directors.includes('Seiji Okuda'));
    assert.equal(trailer.trailer?.key, '99YuIQFIKwE');
    assert.equal(trailer.trailer?.source, 'tmdb');
});

testWithTmdb('falls back from a rejected TMDB credential and verifies the returned poster image', async () => {
    const film = await resolveTmdbFilmWithFallback(
        { title: 'Jojo Rabbit', year: '2019' },
        ['invalid-key', TMDB_API_KEY],
    );

    assert.equal(film.tmdbId, 515001);
    assert.equal(film.title, 'Jojo Rabbit');
    await verifyPosterUrl(film.posterUrl);
});

test('rejects a non-image poster response', async () => {
    await assert.rejects(
        verifyPosterUrl('https://example.com/not-a-poster', async () => new Response('<html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
        })),
        error => error instanceof FilmEnrichmentError && error.code === 'POSTER_UNAVAILABLE',
    );
});

testWithTmdb('a remake title without a year is rejected as ambiguous', async () => {
    await assert.rejects(
        resolveTmdbFilm({ title: 'Dune' }, TMDB_API_KEY),
        error => error instanceof FilmEnrichmentError && error.code === 'AMBIGUOUS_FILM',
    );
});

testWithTmdb('distinguishes a numeric title from an unparenthesized release year', async () => {
    const [bladeRunner, matrix, summer, classOf1984] = await Promise.all([
        resolveTmdbFilm({ title: 'Blade Runner 2049' }, TMDB_API_KEY),
        resolveTmdbFilm({ title: 'The Matrix 1999' }, TMDB_API_KEY),
        resolveTmdbFilm({ title: 'Summer 1993' }, TMDB_API_KEY),
        resolveTmdbFilm({ title: 'Class of 1984' }, TMDB_API_KEY),
    ]);

    assert.equal(bladeRunner.tmdbId, 335984);
    assert.equal(bladeRunner.year, '2017');
    assert.equal(matrix.tmdbId, 603);
    assert.equal(matrix.year, '1999');
    assert.equal(summer.tmdbId, 438634);
    assert.equal(summer.year, '2017');
    assert.equal(classOf1984.tmdbId, 11564);
    assert.equal(classOf1984.year, '1982');
});
