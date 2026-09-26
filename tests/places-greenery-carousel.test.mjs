import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const payload = JSON.parse(fs.readFileSync(path.join(root, "src/data/places-dubai.generated.json")));
const curated = JSON.parse(fs.readFileSync(path.join(root, "src/data/dubai-date-curation.json")));
const source = "https://www.instagram.com/p/DdrDeFmjWOA/";
const ids = ["artisan-bakers-jumeirah", "oath-cafe-jumeirah", "the-barn-al-khazzan-park", "seva-experience", "the-farm-al-barari"];
const newIds = ids.filter((id) => id !== "seva-experience");
const entries = ids.map((id) => payload.places.find((place) => place.id === id));

test("all five named venues from all seven slides are covered exactly once", () => {
  assert.ok(entries.every(Boolean));
  assert.deepEqual(payload.places.filter((place) => place.sourceUrls.includes(source)).map((place) => place.id).sort(), [...ids].sort());
  for (const place of entries) {
    assert.equal(payload.places.filter((candidate) => candidate.id === place.id).length, 1);
    assert.equal(payload.places.filter((candidate) => candidate.placeId === place.placeId).length, 1);
    assert.equal(place.emirate, "Dubai");
    assert.ok(place.taxonomy.tags.includes("food-drink"));
    assert.equal(place.resolution.status, "resolved");
    assert.equal(place.resolution.businessStatus, "OPERATIONAL");
    assert.equal(place.events, undefined);
  }
});

test("four new café listings match curation and point to the verified branches", () => {
  const expected = {
    "artisan-bakers-jumeirah": ["ChIJMRHoSVNqXz4Rqnbr28NiHpE", /3 Umm Suqeim St/],
    "oath-cafe-jumeirah": ["ChIJuTVLBwBDXz4R7Na6NxH4wL0", /342 Al Wasl Rd/],
    "the-barn-al-khazzan-park": ["ChIJ12D64s9DXz4RSVJd_4qB1X4", /Al Khazan Park/],
    "the-farm-al-barari": ["ChIJ5eRM1GNvXz4RbTaTNuyR1pA", /Al Barari/],
  };
  for (const id of newIds) {
    const place = entries.find((entry) => entry.id === id);
    const canonical = curated.places.find((entry) => entry.id === id);
    assert.ok(canonical);
    for (const [key, value] of Object.entries(canonical)) assert.deepEqual(place[key], value, `${id}.${key}`);
    assert.equal(place.placeId, expected[id][0]);
    assert.match(place.address, expected[id][1]);
    assert.equal(new URL(place.googleMapsSearchUri).searchParams.get("query_place_id"), place.placeId);
    assert.ok(place.coordinates.lat > 25 && place.coordinates.lat < 25.3);
    assert.ok(place.coordinates.lng > 55.1 && place.coordinates.lng < 55.4);
    assert.equal(place.listingType, "place");
    assert.equal(place.taxonomy.primary, "food-drink");
  }
});

test("SEVA Table remains searchable without changing the existing saved-place identity", () => {
  const seva = entries.find((place) => place.id === "seva-experience");
  assert.equal(seva.placeId, "ChIJG1R26VNCXz4RZ_pfWFgjfms");
  assert.equal(seva.name, "Seva Experience");
  assert.ok(seva.aliases.includes("SEVA Table"));
  assert.equal(seva.taxonomy.primary, "wellness");
  assert.deepEqual(seva.sourceRows, [53]);
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.curatedRecordCount, curated.places.length);
});

test("offline regeneration retains the new cafés and SEVA aliases and source links", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsso-greenery-test-"));
  try {
    const csv = "Location Name,Location Description,Location URL,Location\nSeva Experience,Wellness center with a plant-based cafe,https://www.sevaexperience.com/,\"Dubai, UAE\"\n";
    fs.writeFileSync(path.join(dir, "source.csv"), csv);
    fs.writeFileSync(path.join(dir, "curation.json"), JSON.stringify({version:1,places:curated.places.filter((entry) => newIds.includes(entry.id))}));
    const cache = {};
    for (const place of entries) {
      const key = place.id === "seva-experience" ? "google:Seva Experience, Dubai, United Arab Emirates" : `google-place-id:${place.placeId}`;
      cache[key] = {
        address:place.address, coordinates:place.coordinates, placeId:place.placeId,
        googleTypes:place.googleTypes, primaryGoogleType:place.primaryGoogleType,
        resolutionSource:place.resolution.source, resolutionStatus:place.resolution.status,
        fetchedAt:place.resolution.matchedAt, matchedName:place.resolution.matchedName,
        websiteUri:place.resolution.websiteUri, businessStatus:place.resolution.businessStatus,
      };
    }
    fs.writeFileSync(path.join(dir, ".places-geocode-cache.json"), JSON.stringify(cache));
    fs.writeFileSync(path.join(dir, "no-network.mjs"), "globalThis.fetch = () => { throw new Error('Unexpected network call in offline fixture'); };\n");
    execFileSync(process.execPath, ["--import",path.join(dir,"no-network.mjs"),path.join(root,"scripts/build-dubai-places.mjs"),"--source","source.csv","--curation","curation.json","--output","output.json","--as-of","2026-09-26T08:00:00Z"], {
      cwd:dir, env:{...process.env,GOOGLE_PLACES_ENRICHMENT_API_KEY:"offline-test-only"}, timeout:15000,
    });
    const rebuilt = JSON.parse(fs.readFileSync(path.join(dir,"output.json")));
    assert.equal(rebuilt.meta.cacheMisses, 0);
    assert.equal(rebuilt.places.length, 5);
    for (const place of rebuilt.places) {
      assert.ok(place.sourceUrls.includes(source), place.id);
      assert.equal(place.placeId, entries.find((entry) => entry.id === place.id).placeId);
    }
    assert.ok(rebuilt.places.find((place) => place.id === "seva-experience").aliases.includes("SEVA Table"));
  } finally {
    fs.rmSync(dir, {recursive:true,force:true});
  }
});
