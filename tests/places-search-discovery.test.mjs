import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { searchPlaces } from "../src/lib/places-search.ts";

const places = JSON.parse(fs.readFileSync(new URL("../src/data/places-dubai.generated.json", import.meta.url))).places;
const ids = query => searchPlaces(places, query).map(place => place.id);
const includes = (query, expected) => {
  const actual = ids(query);
  for (const id of expected) assert.ok(actual.includes(id), `${JSON.stringify(query)} should discover ${id}; got ${actual.join(", ")}`);
  return actual;
};

const potteryStudios = [
  "yadawei-pottery-studio",
  "treasure-pots",
  "maison-terrae",
  "dubai-pottery-studio",
  "tashkeel-makerspace",
];

test("pottery, ceramics and clay discover making experiences, not only literal venue names", () => {
  for (const query of ["pottery", "ceramics", "clay", "pottery workshops", "pottery classes"])
    includes(query, potteryStudios);

  // Dalma's description mentions archaeological pottery, not pottery lessons.
  assert.ok(!ids("pottery classes").includes("dalma-island"));
  assert.ok(!ids("pottery classes").includes("coffee-museum"));
});

test("ordinary typos and adjacent transpositions still find an activity", () => {
  for (const query of ["potery", "potteyr", "cermaics"])
    includes(query, ["yadawei-pottery-studio", "treasure-pots", "maison-terrae"]);
});

test("multiword interests and conversational searches keep their meaning", () => {
  includes("where can we take a pottery class in Dubai", potteryStudios);
  includes("wheel throwing", potteryStudios);
  includes("hand building", potteryStudios);
  includes("night sky", ["al-quaa-milky-way-spot"]);
  includes("board games", ["kefi-books-board-games-cafe", "the-workshop-dubai"]);
  includes("Khor Fakan", ["khorfakkan-beach"]);
  includes("ceram", potteryStudios);
  assert.ok(!ids("night sky").includes("at-mosphere"));
  assert.ok(!ids("gallery").includes("at-mosphere"));
  assert.ok(!ids("romantic dinner").includes("aventura-parks"));
});

test("activity matches do not come from incidental words or noisy secondary tags", () => {
  const painting = includes("places to paint", ["thejamjar"]);
  assert.ok(!painting.includes("al-mamzar-cycling-finish"));
  assert.ok(!ids("books").includes("dubai-hills-cycling-start"));
  assert.ok(!ids("make candles").includes("dubai-pottery-studio"));
  assert.ok(!ids("candle making").includes("maison-terrae"));
  assert.ok(!ids("art").includes("artisan-bakers-jumeirah"));
  for (const id of ["wild-wadi-water-park", "dalma-island", "suwaidi-pearls"]) assert.ok(!ids("hiking").includes(id));
  assert.ok(!searchPlaces(places, "spa").some(place => /Better Healthy|Museum of the Future|My Space/i.test(place.name)));
  includes("book a class", potteryStudios);
});

test("every full venue name remains the first result despite activity expansion", () => {
  for (const place of places) assert.equal(ids(place.name)[0], place.id, place.name);
});

test("misspelled venue names remain discoverable and exact venue names remain first", () => {
  for (const [query, id] of [
    ["Tresure Pots", "treasure-pots"],
    ["Treasure Ptos", "treasure-pots"],
    ["Yadawi", "yadawei-pottery-studio"],
    ["Courtyrad", "the-courtyard-al-quoz"],
  ]) includes(query, [id]);

  for (const id of ["treasure-pots", "yadawei-pottery-studio", "the-courtyard-al-quoz", "alserkal-avenue"])
    assert.equal(ids(places.find(place => place.id === id).name)[0], id);
});

test("natural cafe queries combine their activity with an area instead of dropping either", () => {
  const alQuoz = includes("cafes in al quoz", ["boston-lane-al-quoz", "subko", "ottimo-cafe-al-quoz"]);
  assert.ok(!alQuoz.includes("ca-phin-jlt"));
  assert.ok(!alQuoz.includes("ashjar-cafe-ras-al-khaimah"));

  const jlt = includes("jlt coffee", ["ca-phin-jlt"]);
  assert.ok(!jlt.includes("dubai-pottery-studio"));
  assert.ok(!jlt.includes("kima-izakaya-jlt"));
  assert.ok(!jlt.includes("the-kaf-downtown"));
  includes("coffee in Jumeirah Lakes Towers", ["ca-phin-jlt"]);
});

test("Alserkal can mean the district and its relevant venues", () => {
  includes("alserkal", ["alserkal-avenue", "fiker-institute-library", "subko", "tashkeel-makerspace"]);
  const libraries = includes("library in alserkal", ["fiker-institute-library"]);
  assert.ok(!libraries.includes("house-of-wisdom-sharjah"));
  assert.ok(!libraries.includes("subko"));
  includes("pottery in al quoz", ["yadawei-pottery-studio", "treasure-pots", "maison-terrae"]);
});

test("books and reading discover libraries and book cafes", () => {
  for (const query of ["books", "reading"])
    includes(query, ["fiker-institute-library", "house-of-wisdom-sharjah", "kefi-books-board-games-cafe"]);
  includes("book cafes", ["kefi-books-board-games-cafe", "pages-cafe"]);
});

test("desert coffee, gardens and romantic activities use the catalog descriptions", () => {
  includes("desert coffee", ["hidden-desert-cafe", "limited-desert-cafe", "my-space-desert-cafe"]);
  includes("garden cafe", ["oath-cafe-jumeirah", "plaka-al-mizhar"]);
  includes("romantic pottery", ["treasure-pots", "dubai-pottery-studio"]);
  assert.ok(!ids("romantic pottery").includes("mazmi-coffee-more"));
});

test("stargazing and its related words find an actual sky-watching destination", () => {
  for (const query of ["stargazing", "stars", "astronomy"])
    includes(query, ["al-quaa-milky-way-spot"]);
  assert.ok(!ids("stargazing").includes("bkd-by-gemini"), "a zodiac-themed cafe is not a stargazing venue");
});

test("topic expansion never silently removes an explicit emirate restriction", () => {
  for (const [query, emirate] of [
    ["pottery in Dubai", "Dubai"],
    ["desert coffee Dubai", "Dubai"],
    ["books in Sharjah", "Sharjah"],
    ["stargazing Abu Dhabi", "Abu Dhabi"],
  ]) {
    const results = searchPlaces(places, query);
    assert.ok(results.length > 0, `${query} has known catalog matches`);
    assert.ok(results.every(place => place.emirate === emirate), `${query} must keep its emirate constraint`);
  }
  assert.ok(!ids("pottery in Abu Dhabi").includes("treasure-pots"));
  assert.ok(!ids("stargazing in Dubai").includes("al-quaa-milky-way-spot"));
  assert.ok(!ids("Kefi in Sharjah").includes("kefi-books-board-games-cafe"));
});

test("meaning-aware results are deterministic and preserve original catalog records", () => {
  const original = structuredClone(places);
  const frozen = Object.freeze([...places]);
  for (const query of ["potery", "books", "cafes in al quoz", "romantic pottery", "desert coffee Dubai"]) {
    const first = searchPlaces(frozen, query);
    assert.deepEqual(first.map(place => place.id), searchPlaces([...frozen].reverse(), query).map(place => place.id));
    assert.deepEqual(first.map(place => place.id), searchPlaces(frozen, query).map(place => place.id));
    assert.ok(first.every(place => places.includes(place)));
  }
  assert.deepEqual(places, original);
});

test("repeated type-ahead searches stay comfortably bounded on the real catalog", () => {
  const queries = ["p", "po", "pot", "pote", "potery", "cafes in al quoz", "jlt coffee", "books", "desert coffee", "Treasure Ptos"];
  // Warm any search index before timing. A generous bound avoids machine-speed
  // flakes while catching accidental unbounded fuzzy/semantic work per keypress.
  for (const query of queries) searchPlaces(places, query);
  const start = performance.now();
  for (let pass = 0; pass < 10; pass++) for (const query of queries) searchPlaces(places, query);
  assert.ok(performance.now() - start < 8_000, "100 catalog searches should complete in under eight seconds");
});
