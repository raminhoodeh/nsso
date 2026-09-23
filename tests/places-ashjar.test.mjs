import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const payload = JSON.parse(fs.readFileSync(new URL("../src/data/places-dubai.generated.json", import.meta.url)));
const curation = JSON.parse(fs.readFileSync(new URL("../src/data/dubai-date-curation.json", import.meta.url)));
const id = "ashjar-cafe-ras-al-khaimah";
const place = payload.places.find((entry) => entry.id === id);

test("Ashjar is one verified RAK café, not an event or a Dubai branch", () => {
  assert.ok(place);
  assert.equal(place.emirate, "Ras Al Khaimah");
  assert.match(place.address, /9 26B Street - Al Digdaga/);
  assert.deepEqual(place.coordinates, { lat: 25.6884091, lng: 55.9666946 });
  assert.equal(place.placeId, "ChIJYU0HLgDZ9T4Rg-5mKO9HqzA");
  assert.equal(payload.places.filter((entry) => entry.placeId === place.placeId).length, 1);
  assert.equal(place.resolution.status, "resolved");
  assert.equal(place.resolution.businessStatus, "OPERATIONAL");
  assert.equal(place.listingType, "place");
  assert.equal(place.events, undefined);
  assert.deepEqual(place.taxonomy, { primary: "food-drink", tags: ["food-drink"] });
  assert.match(place.description, /deer sightings are not guaranteed/);
  assert.equal(new URL(place.googleMapsSearchUri).searchParams.get("query_place_id"), place.placeId);
});

test("Ashjar editorial data survives regeneration and dataset counts stay accurate", () => {
  const canonical = curation.places.find((entry) => entry.id === id);
  assert.ok(canonical);
  for (const [key, value] of Object.entries(canonical)) assert.deepEqual(place[key], value, key);
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.curatedRecordCount, curation.places.length);
  assert.equal(new Set(payload.places.map((entry) => entry.id)).size, payload.places.length);
});
