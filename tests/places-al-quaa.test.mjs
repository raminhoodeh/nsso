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
const id = "al-quaa-milky-way-spot";
const place = payload.places.find(entry => entry.id === id);
const canonical = curation.places.find(entry => entry.id === id);

test("Al Quaa is one verified Abu Dhabi stargazing spot, not a hotel or dated event", () => {
  assert.ok(place);
  assert.equal(place.emirate, "Abu Dhabi");
  assert.equal(place.placeId, "ChIJIVnqB_z3YD4RdA-_0oMYJRw");
  assert.deepEqual(place.coordinates, {lat:23.6054742, lng:54.7504395});
  assert.match(place.address, /Al Sout.*Abu Dhabi/);
  assert.equal(payload.places.filter(entry => entry.placeId === place.placeId).length, 1);
  assert.equal(place.resolution.status, "resolved");
  assert.equal(place.resolution.businessStatus, "OPERATIONAL");
  assert.equal(place.listingType, "place");
  assert.equal(place.events, undefined);
  assert.deepEqual(place.taxonomy, {primary:"nature-wildlife",tags:["nature-wildlife"]});
  assert.equal(new URL(place.googleMapsSearchUri).searchParams.get("query_place_id"), place.placeId);
});

test("Al Quaa curation retains search aliases and realistic visit notes", () => {
  assert.ok(canonical);
  for (const [key,value] of Object.entries(canonical)) assert.deepEqual(place[key],value,key);
  for (const alias of ["Al Quaa", "Al Qua'a", "Abu Dhabi Stargazing"]) assert.ok(place.aliases.includes(alias));
  assert.match(place.description, /moonless night/);
  assert.match(place.description, /fainter to the naked eye/);
  assert.match(place.description, /Check current access and weather/);
  assert.equal(payload.meta.placeCount,payload.places.length);
  assert.equal(payload.meta.curatedRecordCount,curation.places.length);
  assert.equal(new Set(payload.places.map(entry => entry.id)).size,payload.places.length);
});

test("offline regeneration preserves Al Quaa's exact location and category", () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nsso-al-quaa-test-"));
  try {
    fs.writeFileSync(path.join(dir,"source.csv"),"Location Name,Location Description,Location URL,Location\n");
    fs.writeFileSync(path.join(dir,"curation.json"),JSON.stringify({version:1,places:[canonical]}));
    fs.writeFileSync(path.join(dir,".places-geocode-cache.json"),JSON.stringify({
      [`google-place-id:${place.placeId}`]: {
        address:place.address,coordinates:place.coordinates,placeId:place.placeId,
        googleTypes:place.googleTypes,primaryGoogleType:place.primaryGoogleType,
        resolutionSource:place.resolution.source,resolutionStatus:place.resolution.status,
        fetchedAt:place.resolution.matchedAt,matchedName:place.resolution.matchedName,
        websiteUri:place.resolution.websiteUri,businessStatus:place.resolution.businessStatus,
      },
    }));
    fs.writeFileSync(path.join(dir,"no-network.mjs"),"globalThis.fetch = () => { throw new Error('Unexpected network call'); };\n");
    execFileSync(process.execPath,["--import",path.join(dir,"no-network.mjs"),path.join(root,"scripts/build-dubai-places.mjs"),"--source","source.csv","--curation","curation.json","--output","output.json","--as-of","2026-09-26T08:00:00Z"],{
      cwd:dir,env:{...process.env,GOOGLE_PLACES_ENRICHMENT_API_KEY:"offline-test-only"},timeout:15000,
    });
    const rebuilt=JSON.parse(fs.readFileSync(path.join(dir,"output.json")));
    assert.equal(rebuilt.meta.cacheMisses,0);
    assert.equal(rebuilt.places.length,1);
    assert.equal(rebuilt.places[0].emirate,"Abu Dhabi");
    assert.deepEqual(rebuilt.places[0].coordinates,place.coordinates);
    for(const [key,value] of Object.entries(canonical))assert.deepEqual(rebuilt.places[0][key],value,key);
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
