import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const payload = JSON.parse(fs.readFileSync(path.join(root, "src/data/places-dubai.generated.json")));
const curation = JSON.parse(fs.readFileSync(path.join(root, "src/data/dubai-date-curation.json")));
const expected = {
  "montys-emirates-hills": ["ChIJ30lgcpRsXz4RuRGv-jAdKVk", "Dubai", "food-drink", 25.0675901, 55.1646334],
  "ethr-al-ain-oasis": ["ChIJLU7d_By3ij4RSDVW7PgTqSY", "Abu Dhabi", "food-drink", 24.2167726, 55.7668289],
  "dubai-hills-cycling-start": ["ChIJF_Fpa6BpXz4R-wbhbbAPWx4", "Dubai", "sport-active", 25.1105033, 55.2477037],
  "al-mamzar-cycling-finish": ["ChIJgxvmJ25bXz4RMfW64IUSkSw", "Dubai", "sport-active", 25.3124034, 55.3474648],
  "legacy-cafe-dibba-mountain-park": ["ChIJHYwQcgAx9D4RYY0b3ishq6U", "Fujairah", "food-drink", 25.5710244, 56.3419729],
  "emirates-national-auto-museum": ["ChIJY_S0dokYXj4RwFelXp1uRUg", "Abu Dhabi", "arts-culture-heritage", 24.0988807, 54.4201307],
  "knafeh-omar-odali-cactus-park": ["ChIJDzZNDBxnXz4RTAmr3OxTMN0", "Dubai", "food-drink", 25.2061415, 55.3222758],
};
const entries = Object.keys(expected).map(id => payload.places.find(place => place.id === id));
const canonical = curation.places.filter(place => Object.hasOwn(expected, place.id));

test("all six notes are covered by five venues and two cycling-area bookmarks", () => {
  assert.equal(canonical.length, 7);
  for (const place of entries) {
    assert.ok(place);
    const [placeId, emirate, category, lat, lng] = expected[place.id];
    assert.equal(place.placeId, placeId);
    assert.equal(place.emirate, emirate);
    assert.equal(place.taxonomy.primary, category);
    assert.ok(Math.abs(place.coordinates.lat-lat) < 1e-7);
    assert.ok(Math.abs(place.coordinates.lng-lng) < 1e-7);
    assert.equal(payload.places.filter(p => p.placeId === placeId).length, 1);
    assert.equal(payload.places.filter(p => p.id === place.id).length, 1);
    assert.equal(place.listingType, "place");
    assert.equal(place.events, undefined);
    assert.equal(place.resolution.status, "resolved");
    assert.equal(place.resolution.source, "google-places-new");
    assert.equal(new URL(place.googleMapsSearchUri).searchParams.get("query_place_id"), placeId);
    for (const [key, value] of Object.entries(canonical.find(p => p.id === place.id))) {
      assert.deepEqual(place[key], value, `${place.id}.${key}`);
    }
  }
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.curatedRecordCount, curation.places.length);
  assert.equal(new Set(payload.places.map(p => p.id)).size, payload.places.length);
});

test("original note spellings remain searchable through aliases", () => {
  for (const note of [
    "Emirates hill, Monty restaurant entrance", "Ethr - al ain oasis",
    "Dubai Hills to Al Mamzar biking route", "Dibba mountain park resort legacy cafe - fujairah",
    "Emirates national Auto museum Abu dhabi", "Knafeh cactus park al jadaf",
  ]) {
    assert.ok(entries.some(p => p.aliases.some(alias => alias.toLowerCase() === note.toLowerCase())), note);
  }
});

test("branch matches and visit caveats do not substitute neighbourhood or hotel pins", () => {
  const byId = id => entries.find(p => p.id === id);
  const ethr = byId("ethr-al-ain-oasis");
  assert.match(ethr.description, /winter-only/);
  assert.match(ethr.description, /confirm the current season/);
  assert.notEqual(ethr.placeId, payload.places.find(p => p.id === "al-ain-oasis").placeId);
  assert.match(byId("montys-emirates-hills").description, /not a residential entrance/);
  assert.equal(byId("legacy-cafe-dibba-mountain-park").primaryGoogleType, "coffee_shop");
  assert.match(byId("legacy-cafe-dibba-mountain-park").address, /Al Fqait.*Fujairah/);
  assert.match(byId("knafeh-omar-odali-cactus-park").address, /Cactus Park.*Al Jadaf/);
  assert.match(byId("emirates-national-auto-museum").address, /Hameem Rd.*Al Dhafrah.*Abu Dhabi/);
});

test("cycling bookmarks are explicitly not a verified through-route", () => {
  const cycling = entries.filter(p => p.taxonomy.primary === "sport-active");
  assert.equal(cycling.length, 2);
  for (const place of cycling) {
    assert.match(place.description, /^Route idea only:/);
    assert.match(place.description, /route has not been verified/);
    assert.match(place.description, /Directions lead only to/);
    assert.match(place.description, /do not follow a car route onto major roads/);
    assert.ok(place.aliases.includes("Dubai Hills to Al Mamzar biking route"));
    assert.equal(place.route, undefined);
    assert.equal(place.polyline, undefined);
  }
  assert.notDeepEqual(cycling[0].coordinates, cycling[1].coordinates);
});

test("offline regeneration preserves every new pin, alias and safety note", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsso-notes-test-"));
  try {
    fs.writeFileSync(path.join(dir, "source.csv"), "Location Name,Location Description,Location URL,Location\n");
    fs.writeFileSync(path.join(dir, "curation.json"), JSON.stringify({version:1,places:canonical}));
    const cache = Object.fromEntries(entries.map(place => [`google-place-id:${place.placeId}`, {
      address:place.address,coordinates:place.coordinates,placeId:place.placeId,
      googleTypes:place.googleTypes,primaryGoogleType:place.primaryGoogleType,
      resolutionSource:place.resolution.source,resolutionStatus:place.resolution.status,
      fetchedAt:place.resolution.matchedAt,matchedName:place.resolution.matchedName,
      websiteUri:place.resolution.websiteUri,businessStatus:place.resolution.businessStatus,
    }]));
    fs.writeFileSync(path.join(dir, ".places-geocode-cache.json"), JSON.stringify(cache));
    fs.writeFileSync(path.join(dir, "no-network.mjs"), "globalThis.fetch = () => { throw new Error('Unexpected network call'); };\n");
    execFileSync(process.execPath, ["--import",path.join(dir,"no-network.mjs"),path.join(root,"scripts/build-dubai-places.mjs"),"--source","source.csv","--curation","curation.json","--output","output.json","--as-of","2026-09-28T07:00:00Z"], {
      cwd:dir,env:{...process.env,GOOGLE_PLACES_ENRICHMENT_API_KEY:"offline-test-only"},timeout:15000,
    });
    const rebuilt = JSON.parse(fs.readFileSync(path.join(dir, "output.json")));
    assert.equal(rebuilt.meta.cacheMisses, 0);
    assert.equal(rebuilt.places.length, 7);
    for (const entry of canonical) {
      const place = rebuilt.places.find(p => p.id === entry.id);
      for (const [key,value] of Object.entries(entry)) assert.deepEqual(place[key], value, `${entry.id}.${key}`);
      assert.deepEqual(place.coordinates, entries.find(p => p.id === entry.id).coordinates);
      assert.equal(place.emirate, expected[entry.id][1]);
    }
  } finally {
    fs.rmSync(dir, {recursive:true,force:true});
  }
});
