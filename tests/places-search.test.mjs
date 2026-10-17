import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { searchPlaces } from "../src/lib/places-search.ts";

const places = JSON.parse(fs.readFileSync(new URL("../src/data/places-dubai.generated.json", import.meta.url))).places;
const ids = query => searchPlaces(places, query).map(place => place.id);
const courtyard = places.find(place => place.id === "the-courtyard-al-quoz");
const kefi = places.find(place => place.id === "kefi-books-board-games-cafe");

test("empty, whitespace, punctuation and unknown queries have no results", () => {
  for (const query of ["", " \n\t ", "—!?", "no-such-place-9837492"]) {
    assert.deepEqual(searchPlaces(places, query), [], JSON.stringify(query));
  }
});

test("named places and aliases rank ahead of neighbouring venues", () => {
  assert.equal(ids("Courtyard")[0], "the-courtyard-al-quoz");
  assert.equal(ids("The Courtyard")[0], "the-courtyard-al-quoz");
  assert.ok(ids("Courtyard").includes("the-courtyard-playhouse"));
  assert.ok(ids("Courtyard").includes("boston-lane-al-quoz"));
  assert.equal(ids("Kefi")[0], "kefi-books-board-games-cafe");
  assert.equal(ids("Kefi Dubai")[0], "kefi-books-board-games-cafe");
});

test("search is immediate for partial names and accepts common spacing variants", () => {
  for (const query of ["K", "Ke", "Kef", "Kefi"]) assert.ok(ids(query).includes(kefi.id), query);
  assert.equal(ids("Khor Fakkan")[0], "khorfakkan-beach");
  assert.equal(ids("Khorfakkan Beach")[0], "khorfakkan-beach");
  assert.ok(ids("Khor Fakkan Sharjah").includes("khorfakkan-beach"));
});

test("case, diacritics, punctuation, repeated spaces and ampersands normalize", () => {
  assert.deepEqual(ids("  cOuRtYÁrd  "), ids("courtyard"));
  assert.deepEqual(ids("Al—Quoz"), ids("al quoz"));
  assert.deepEqual(ids(" al   quoz \n"), ids("al quoz"));
  assert.equal(ids("Kéfi Books, Board Games & Café")[0], kefi.id);
  assert.deepEqual(ids("Kefi books board games and cafe"), ids("Kefi books board games & cafe"));
});

test("multiword searches combine venue identity with its area and emirate", () => {
  assert.ok(ids("Al Quoz").includes(courtyard.id));
  assert.ok(ids("Al Quoz").includes("boston-lane-al-quoz"));
  assert.ok(ids("Dubai").includes(kefi.id));
  assert.ok(ids("Dubai").includes(courtyard.id));
  assert.ok(ids("Kefi Mamzar").includes(kefi.id));
  assert.equal(ids("Courtyard Quoz Dubai")[0], courtyard.id);
  assert.ok(!ids("Kefi Abu Dhabi").includes(kefi.id));
});

test("search does not impose category or favourites filters on the supplied catalog", () => {
  const mixed = [courtyard, kefi];
  assert.equal(searchPlaces(mixed, "kefi")[0], kefi);
  assert.equal(searchPlaces(mixed, "courtyard")[0], courtyard);
  assert.equal(searchPlaces(mixed, "Dubai").length, 2);
});

test("description-only references and source URLs do not masquerade as venue matches", () => {
  const unrelated = {
    ...kefi, id: "unrelated", name: "A different venue", aliases: [],
    address: "", locationHint: "", emirate: "Dubai",
    description: "Not the Courtyard. Try the Courtyard nearby.",
    sourceUrls: ["https://example.com/courtyard"],
  };
  assert.deepEqual(searchPlaces([unrelated], "courtyard"), []);
});

test("exact names, aliases and prefixes keep a consistent ranking hierarchy", () => {
  const make = (id, name, aliases = []) => ({
    ...kefi, id, name, aliases, address: "", locationHint: "", emirate: "Dubai",
  });
  const exact = make("exact", "Needle");
  const alias = make("alias", "Another name", ["Needle"]);
  const prefix = make("prefix", "Needle House", ["Needle House", "Needle House Dubai"]);
  const location = { ...make("location", "A cafe"), address: "Needle" };
  assert.deepEqual(searchPlaces([location, prefix, alias, exact], "needle").map(place => place.id),
    ["exact", "alias", "prefix", "location"]);
});

test("results are deterministic without changing the catalog or cloning records", () => {
  const original = structuredClone(places);
  const frozen = Object.freeze([...places]);
  const first = searchPlaces(frozen, "Dubai");
  assert.notEqual(first, frozen);
  assert.deepEqual(first.map(place => place.id), searchPlaces([...frozen].reverse(), "Dubai").map(place => place.id));
  assert.ok(first.every(place => frozen.includes(place)));
  assert.deepEqual(places, original);
});
