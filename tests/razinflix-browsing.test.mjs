import assert from 'node:assert/strict';
import { build } from 'esbuild';
import test from 'node:test';

const result = await build({ entryPoints: ['src/lib/razinflix/browsing.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { filterFilms, groupFilms, recommendFilms, formatFilmRating, filmUrl, readFilmBrowseUrl, filmBrowseUrl } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const fixture = (id, overrides = {}) => ({ id, title: `Film ${id}`, description: '', director: `Director ${id}`, categories: [], year: '2026', rating: '8/10', ...overrides });

test('category membership is exact and independent of free-text search', () => {
    const films = [fixture(1, { title: 'News from home', categories: ['Drama'] }), fixture(2, { title: 'The arrival', categories: ['New', 'Drama'] }), fixture(3, { categories: ['New York stories'] })];
    assert.deepEqual(filterFilms(films, '', 'New').map(film => film.id), [2]);
    assert.deepEqual(filterFilms(films, 'arrival', 'New').map(film => film.id), [2]);
    assert.deepEqual(filterFilms(films, 'news', 'New'), []);
    assert.deepEqual(groupFilms(films).map(([category, entries]) => [category, entries.map(film => film.id)]), [['New', [2]], ['Drama', [1, 2]], ['New York stories', [3]]]);
});

test('recommendations reject generic collections and zero-relevance records', () => {
    const film = fixture(1, { categories: ['New'] });
    assert.deepEqual(recommendFilms(film, [film, fixture(2, { categories: ['New'] }), fixture(3, { categories: ['Recently Added'] })]), []);
    assert.deepEqual(recommendFilms(film, [fixture(4, { director: film.director }), fixture(2, { categories: ['New'] })]).map(film => film.id), [4]);
    const drama = fixture(5, { categories: ['Drama'] });
    assert.deepEqual(recommendFilms(drama, [fixture(6, { categories: ['Drama'] }), fixture(7, { categories: ['New'] })]).map(film => film.id), [6]);
});

test('ratings have one bounded scale and do not corrupt missing values', () => {
    assert.equal(formatFilmRating('8.2/10'), '8.2/10');
    assert.equal(formatFilmRating('8'), '8.0/10');
    for (const rating of ['N/A', '', 'Unknown', 'TBD', '85%', '8%', '8/5', '11/10']) assert.equal(formatFilmRating(rating), 'Not rated');
    assert.equal(formatFilmRating('8.2/10 (Film)'), '8.2/10');
});

test('browse URLs round-trip exact categories, search and sorting independently of film details', () => {
    const state = { searchTerm: 'A title', category: 'New', viewMode: 'rating_desc' };
    const url = filmBrowseUrl('https://nsso.me/film/razinflix?film=31&play=1', state);
    assert.equal(url.search, '?q=A+title&category=New&view=rating_desc');
    assert.deepEqual(readFilmBrowseUrl(url.href), state);
    assert.deepEqual(readFilmBrowseUrl('https://nsso.me/film/razinflix?view=invalid'), { searchTerm: '', category: null, viewMode: 'category' });
});

test('detail URLs retain unrelated filters and remove playback requests on close', () => {
    assert.equal(filmUrl('https://nsso.me/film/razinflix?view=alpha', 31).search, '?view=alpha&film=31');
    assert.equal(filmUrl('https://nsso.me/film/razinflix?film=31&play=1&view=alpha').search, '?view=alpha');
});
