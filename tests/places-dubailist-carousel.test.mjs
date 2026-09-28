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
const source = "https://www.instagram.com/p/DdyIaZNEqdt/";
const expected = {
  "juntas-al-mizhar": ["Juntas", "ChIJ-w5h06JhXz4R_vupJwMQGLo", "food-drink", 25.2425177, 55.4559833],
  "kima-izakaya-jlt": ["Kima Izakaya", "ChIJ6c6r8Q1tXz4RMduKL3q05g4", "food-drink", 25.0769126, 55.1474833],
  "bishette-bakery-mirdif": ["Bishette Bakery", "ChIJj6XHaQBhXz4Rcwvsd90C2ac", "food-drink", 25.2209199, 55.4409962],
  "boston-lane-al-quoz": ["Boston Lane", "ChIJ41Ed_SpqXz4Rjugp_6PLflw", "food-drink", 25.1435228, 55.2232167],
  "el-primo-taqueria": ["El Primo Taqueria", "ChIJyYIlcZ1DXz4RrPYzUHfuUsI", "food-drink", 25.2144893, 55.2589584],
  "iykyk-at-salvaje-dubai": ["IYKYK", "ChIJoZaNldxpXz4RHkJjaXz6MQs", "events-activities", 25.1967279, 55.2715837],
  "lahkee-al-safa": ["LahKee", "ChIJfan3vEFpXz4Rwl2oKxtJMtU", "food-drink", 25.178596, 55.2424789],
};
const entries = Object.keys(expected).map(id => payload.places.find(place => place.id === id));
const canonical = curation.places.filter(place => Object.hasOwn(expected, place.id));

test("all seven named venues from the eight-slide Dubai List carousel appear exactly once", () => {
  assert.equal(canonical.length, 7);
  assert.deepEqual(payload.places.filter(p => p.sourceUrls.includes(source)).map(p => p.id).sort(), Object.keys(expected).sort());
  for (const place of entries) {
    assert.ok(place);
    const [title, placeId, category, lat, lng] = expected[place.id];
    assert.ok(place.aliases.includes(title), `Slide title is searchable: ${title}`);
    assert.equal(place.placeId, placeId);
    assert.equal(place.emirate, "Dubai");
    assert.equal(place.taxonomy.primary, category);
    assert.ok(place.taxonomy.tags.includes("food-drink"));
    assert.ok(Math.abs(place.coordinates.lat - lat) < 1e-7);
    assert.ok(Math.abs(place.coordinates.lng - lng) < 1e-7);
    assert.equal(payload.places.filter(p => p.placeId === placeId).length, 1);
    assert.equal(payload.places.filter(p => p.id === place.id).length, 1);
    assert.equal(place.listingType, "place");
    assert.equal(place.events, undefined);
    assert.equal(place.resolution.status, "resolved");
    assert.equal(place.resolution.source, "google-places-new");
    assert.equal(place.resolution.businessStatus, "OPERATIONAL");
    assert.equal(new URL(place.googleMapsSearchUri).searchParams.get("query_place_id"), placeId);
    for (const [key, value] of Object.entries(canonical.find(p => p.id === place.id))) {
      assert.deepEqual(place[key], value, `${place.id}.${key}`);
    }
  }
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.curatedRecordCount, curation.places.length);
  assert.equal(new Set(payload.places.map(p => p.id)).size, payload.places.length);
});

test("IYKYK uses the tagged dinner-party organiser and its verified host, not the similarly named café", () => {
  const place = entries.find(p => p.id === "iykyk-at-salvaje-dubai");
  assert.equal(place.resolution.matchedName, "Salvaje Dubai");
  assert.notEqual(place.placeId, "ChIJowgoxvdDXz4RQwmdBOmwPVs");
  assert.ok(place.sourceUrls.includes("https://www.instagram.com/iykykdubai/"));
  assert.ok(place.sourceUrls.includes("https://salvajedubai.com/"));
  assert.match(place.description, /dinner-party series, not the similarly named café/);
  assert.match(place.description, /checked on 28 September 2026/);
  assert.match(place.description, /Confirm the current venue, date, entry policy and booking/);
  assert.match(place.description, /photos and directions identify Salvaje, the host venue/);
  assert.match(place.description, /no individual event date is guaranteed/);
  assert.equal(place.listingType, "place");
  assert.equal(place.events, undefined);
});

test("restaurant pins identify the intended branches rather than similarly named venues or malls", () => {
  const byId = id => entries.find(p => p.id === id);
  assert.match(byId("juntas-al-mizhar").address, /Al Mizhar Second/);
  assert.match(byId("kima-izakaya-jlt").address, /Podium Level.*Cluster R/);
  assert.match(byId("bishette-bakery-mirdif").address, /tulip building.*Mirdif/i);
  const boston = byId("boston-lane-al-quoz");
  assert.equal(boston.resolution.matchedName, "Boston Lane");
  assert.match(boston.address, /Courtyard.*Al Quoz/);
  assert.match(boston.description, /not the brand's seasonal market kiosk/);
  const primo = byId("el-primo-taqueria");
  assert.equal(primo.primaryGoogleType, "mexican_restaurant");
  assert.ok(!primo.googleTypes.includes("shopping_mall"));
  assert.ok(primo.aliases.includes("El Primo Taquería"));
  assert.match(primo.address, /365 Al Wasl Rd/);
  assert.equal(byId("lahkee-al-safa").resolution.matchedName, "LahKee Pan Asian Restaurant");
  assert.match(byId("lahkee-al-safa").locationHint, /Shop 3, Building 1, Al Safa Park Complex/);
});

test("offline regeneration preserves all seven carousel pins, sources and identity caveats", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsso-dubailist-test-"));
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
      assert.equal(place.emirate, "Dubai");
    }
  } finally {
    fs.rmSync(dir, {recursive:true,force:true});
  }
});
