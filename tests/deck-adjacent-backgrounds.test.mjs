import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const film = read('src/app/film/razinflix/page.tsx');
const filmCss = read('src/app/film/razinflix/razinflix.module.css');
const places = read('src/app/places/dubai/PlacesExplorer.tsx');
const placesCss = read('src/app/places/dubai/places.module.css');

test('RazinFlix keeps the exact static deck scene independent of featured-film selection', () => {
  const provider = film.slice(film.indexOf('<TahoeGlassProvider'), film.indexOf('contentClassName="min-h-screen"'));
  assert.match(provider, /data-razinflix-background="deck-blue"/);
  assert.match(provider, /backgroundColor: DECK_BACKGROUND_COLOR/);
  assert.match(provider, /backgroundImage: `url\(\$\{JSON\.stringify\(DECK_BACKGROUND_ASSET\)\}\)`/);
  assert.match(provider, /sourceLabel=\{DECK_BACKGROUND_LABEL\}/);
  assert.match(provider, /webglSource=\{DECK_BACKGROUND_IMAGE_SOURCE\}/);
  assert.doesNotMatch(provider, /featuredFilm|heroSceneUrl|bg-black/);
  assert.doesNotMatch(film, /backgroundFade|heroWebglSource|\/siri-gradient\.png/);
  assert.doesNotMatch(filmCss, /@keyframes|animation:|rgba\(0, 0, 0, \.9/);
});

test('featured-film art and playback controls remain content, not page decoration', () => {
  const heroArt = film.indexOf('data-razinflix-featured-art=');
  const billboard = film.indexOf('{/* Cinematic Hero Billboard');
  const feed = film.indexOf('{/* Content Feed */}');
  assert.ok(heroArt > billboard && heroArt < feed);
  const hero = film.slice(billboard, feed);
  assert.match(hero, /data-razinflix-featured-art=\{featuredFilms\[featuredIndex\]\.id\}/);
  assert.match(hero, /backgroundImage: `url\(\$\{JSON\.stringify\(heroSceneUrl\)\}\)`/);
  assert.match(hero, /Play Trailer/);
  assert.match(hero, /More Info/);
  assert.match(hero, /Previous featured film/);
  assert.match(hero, /Next featured film/);
  assert.match(film, /Pause featured film rotation/);
  assert.match(film, /Resume featured film rotation/);
  assert.match(film, /previewsDisabled \|\| rotationPaused \|\| heroHasFocus/);
  assert.match(film, /<AddFilmModal/);
  assert.match(film, /<MovieModal/);
});

test('Places applies the deck only to the foundation and unavailable-map fallback', () => {
  assert.match(places, /data-places-background="deck-blue"/);
  assert.match(places, /"--deck-background-image": `url\(\$\{JSON\.stringify\(DECK_BACKGROUND_ASSET\)\}\)`/);
  assert.match(places, /"--deck-background-color": DECK_BACKGROUND_COLOR/);
  for (const selector of ['shell', 'map']) {
    const block = placesCss.match(new RegExp(`\\.${selector} \\{([^}]+)\\}`))?.[1];
    assert.ok(block, selector);
    assert.match(block, /background: var\(--deck-background-color\) var\(--deck-background-image\) center \/ cover no-repeat/);
  }
  const provider = places.slice(places.indexOf('<TahoeGlassProvider'), places.indexOf('<div className={styles.explorerContent}'));
  assert.match(provider, /ref=\{mapElementRef\}/);
  assert.match(provider, /aria-label="Map of places to go in the UAE"/);
  assert.match(provider, /sourceLabel="places-map"/);
  assert.match(provider, /sceneInteractive/);
  assert.match(provider, /fallback="blur"/);
  assert.doesNotMatch(provider, /webglSource|DECK_BACKGROUND_IMAGE_SOURCE/);
  assert.match(places, /data-tahoe-readable-overlay="true"/);
});
