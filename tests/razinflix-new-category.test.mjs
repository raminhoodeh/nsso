import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..');
const pageSource = fs.readFileSync(path.join(root, 'src/app/film/razinflix/page.tsx'), 'utf8');
const browsingSource = fs.readFileSync(path.join(root, 'src/lib/razinflix/browsing.ts'), 'utf8');
const ingestSource = fs.readFileSync(path.join(root, 'scripts/ingest-razinflix-new-2026.mjs'), 'utf8');
const modalSource = fs.readFileSync(path.join(root, 'src/components/film/MovieModal.tsx'), 'utf8');
const cleanupSource = fs.readFileSync(path.join(root, 'scripts/cleanup-categories.mjs'), 'utf8');

test('shelves preserve real category membership and New is pinned first', () => {
    assert.match(browsingSource, /PINNED_CATEGORY_ORDER = \['New', 'Recently Added'\]/);
    assert.match(pageSource, /groupFilms\(films\)/);
    assert.match(browsingSource, /categoryRank\(a\) - categoryRank\(b\)/);
    assert.doesNotMatch(pageSource, /leftovers|finalCats|targetCategory/);
});

test('the curated 2026 ingest is deterministic, complete, and dry-run by default', () => {
    const curatedEntries = ingestSource.match(/\{ title: .*? tmdbId: \d+, evidence: /g) ?? [];
    assert.equal(curatedEntries.length, 29);
    assert.match(ingestSource, /const EXPECTED_YEAR = '2026'/);
    assert.match(ingestSource, /film\.tmdbId !== candidate\.tmdbId/);
    assert.match(ingestSource, /verifyPosterUrl\(film\.posterUrl\)/);
    assert.match(ingestSource, /resolveTrailer\(film, \{\}\)/);
    assert.match(ingestSource, /categories: \[COLLECTION\]/);
    assert.match(ingestSource, /if \(!commit\)/);
    assert.match(ingestSource, /\.insert\(resolvedEntries\.map\(item => item\.row\)\)/);
});

test('American Doctor uses the official director-linked trailer missing from TMDB', () => {
    assert.match(ingestSource, /\['American Doctor', \{/);
    assert.match(ingestSource, /key: 'Be7_u8jzHzU'/);
    assert.match(ingestSource, /pohsiteng\.substack\.com\/p\/the-trailer-is-here-american-doctor/);
    assert.match(ingestSource, /evidencePage\.includes\(trailer\.key\)/);
});

test('editing and cleanup preserve the New collection', () => {
    assert.match(modalSource, /\[\s*"New",\s*"Critically-Acclaimed Mind-Bending Sci-Fi"/);
    assert.match(cleanupSource, /PROTECTED_CATEGORIES = new Set\(\["New"\]\)/);
    assert.match(cleanupSource, /if \(PROTECTED_CATEGORIES\.has\(catName\)\) continue/);
    assert.doesNotMatch(cleanupSource, /TARGET_CATEGORIES = \[\s*"New",/);
});
