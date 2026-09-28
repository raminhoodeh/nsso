import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { matchesExperience } from "../src/lib/places-experiences.ts";
import { placeClosureNotice, surpriseCandidates } from "../src/lib/places-business-status.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const payload = JSON.parse(fs.readFileSync(path.join(root, "src/data/places-dubai.generated.json")));
const curation = JSON.parse(fs.readFileSync(path.join(root, "src/data/dubai-date-curation.json")));
const editorial = JSON.parse(fs.readFileSync(path.join(root, "src/data/places-editorial.json")));
const carousel = "https://www.instagram.com/p/DdOdLB7ivlr/";

// Branch identities and coordinates verified with Google Places on 28 September.
// Closed seasonal venues remain bookmarks; they are not current-open promises.
const expected = {
  "hidden-desert-cafe": {
    placeId: "ChIJT9Rbs4aBXz4REeRFuxHkQ14", lat: 24.8908125, lng: 55.4329375,
    emirate: "Dubai", profile: "https://www.instagram.com/hidden_dubai/",
    map: "https://maps.app.goo.gl/phGKeRBfAJfz67nD6",
  },
  "limited-desert-cafe": {
    placeId: "ChIJu0-8EQCDXz4RI5xuNUoQosk", lat: 24.8500893, lng: 55.3482021,
    emirate: "Dubai", profile: "https://www.instagram.com/limited.dubai/",
    map: "https://maps.app.goo.gl/VDCESNeXbhzowNxv8",
  },
  "parkers-al-marmoom": {
    placeId: "ChIJ0-Uren2DXz4R9hDE2XNbucw", lat: 24.8403125, lng: 55.3649375,
    emirate: "Dubai", profile: "https://www.instagram.com/parkers/",
    map: "https://maps.app.goo.gl/NVxBVAb1yBckmuhn6",
  },
  "one-degree-mushrif": {
    placeId: "ChIJqQn6Y_aD9T4RgIGU5gIr_34", lat: 25.2205796, lng: 55.456386,
    emirate: "Dubai", profile: "https://www.instagram.com/onedegree.ae/",
    map: "https://maps.app.goo.gl/mnoDUPrV2e4n4C9V8",
  },
  "my-space-desert-cafe": {
    placeId: "ChIJyXfcDv2D9T4R0gqhSiTk_vI", lat: 24.9875037, lng: 55.6634863,
    emirate: "Sharjah", profile: "https://www.instagram.com/myspace.cafe/",
    map: "https://maps.app.goo.gl/unsFF2YrRJkJ4QiR9?g_st=ipc",
  },
};
const ids = Object.keys(expected);
const places = new Map(payload.places.map(place => [place.id, place]));
const guides = new Map(editorial.guides.map(guide => [guide.placeId, guide]));
const canonical = curation.places.filter(place => Object.hasOwn(expected, place.id));
const entries = ids.map(id => places.get(id));
const uncommonId = "the-uncommon-desert-cafe";
const allIds = [...ids, uncommonId];
const allCanonical = curation.places.filter(place => allIds.includes(place.id));
const guideText = id => guides.get(id).practicalities.map(item => item.text).join(" ");

test("all six distinct cafes from the eight-slide carousel have one canonical map bookmark", () => {
  assert.equal(allCanonical.length, 6);
  assert.deepEqual(payload.places.filter(place => place.sourceUrls.includes(carousel)).map(place => place.id).sort(), [...allIds].sort());
  assert.equal(new Set(allCanonical.map(place => place.id)).size, 6);
});

test("five verified desert-carousel bookmarks preserve exact Google branches, coordinates and canonical sources", () => {
  assert.equal(canonical.length, 5);
  assert.equal(new Set(canonical.map(place => place.id)).size, 5);
  for (const id of ids) {
    const place = places.get(id);
    const wanted = expected[id];
    assert.ok(place, id);
    assert.equal(place.placeId, wanted.placeId, id);
    assert.equal(place.emirate, wanted.emirate, id);
    assert.ok(Math.abs(place.coordinates.lat - wanted.lat) < 1e-7, `${id}: wrong latitude`);
    assert.ok(Math.abs(place.coordinates.lng - wanted.lng) < 1e-7, `${id}: wrong longitude`);
    assert.equal(payload.places.filter(item => item.id === id).length, 1, `${id}: duplicate record`);
    assert.equal(payload.places.filter(item => item.placeId === wanted.placeId).length, 1, `${id}: duplicate Google pin`);
    assert.equal(place.listingType, "place", id);
    assert.deepEqual(place.sourceRows, [], `${id}: must not invent CSV provenance`);
    assert.ok(place.sourceUrls.includes(carousel), `${id}: missing carousel provenance`);
    assert.ok(place.sourceUrls.includes(wanted.profile), `${id}: missing official profile`);
    assert.ok(place.sourceUrls.includes(wanted.map), `${id}: missing official branch map`);
    const maps = new URL(place.googleMapsSearchUri);
    assert.equal(maps.origin, "https://www.google.com", id);
    assert.equal(maps.searchParams.get("query_place_id"), wanted.placeId, id);
    assert.equal(place.resolution.status, "resolved", id);
    assert.equal(place.resolution.source, "google-places-new", id);
    assert.match(place.resolution.matchedAt, /^2026-09-28T/, id);
    assert.ok(place.resolution.matchedName, id);
    for (const [key, value] of Object.entries(canonical.find(item => item.id === id))) {
      assert.deepEqual(place[key], value, `${id}: canonical ${key} mismatch`);
    }
  }
});

test("closed seasonal cafes stay browsable in Eat & drink without becoming random outings or fabricated events", () => {
  for (const place of entries) {
    assert.equal(place.taxonomy.primary, "food-drink", place.id);
    assert.ok(place.taxonomy.tags.includes("food-drink"), place.id);
    assert.ok(matchesExperience(place, [], "eat-drink"), place.id);
    assert.ok(matchesExperience(place, [], "eat-drink", "cafes"), `${place.id}: missing from cafe navigation`);
    assert.equal(place.resolution.businessStatus, "CLOSED_TEMPORARILY", place.id);
    assert.deepEqual(placeClosureNotice(place), {
      label: "Reported temporarily closed", checkedDate: "28 Sept 2026",
      sourceLabel: "Google listing snapshot", note: null, sourceUrl: null,
    }, place.id);
    assert.match(place.description, /temporarily closed/i, place.id);
    assert.match(place.description, /confirm|check/i, place.id);
    assert.equal(place.events, undefined, `${place.id}: do not turn undated seasons into events`);
    assert.equal(matchesExperience(place, [], "whats-on"), false, place.id);
  }
  assert.deepEqual(surpriseCandidates(entries, null), []);
});

test("five new visit guides retain dated practical advice and branch-specific primary sources", () => {
  const allowedHosts = new Set([
    "instagram.com", "maps.app.goo.gl", "byparkers.com", "linktr.ee",
    "arabian-adventures.presspage.com",
  ]);
  for (const id of ids) {
    const guide = guides.get(id);
    assert.ok(guide, id);
    assert.equal(editorial.guides.filter(item => item.placeId === id).length, 1, `${id}: duplicate guide`);
    assert.equal(guide.verifiedAt, "2026-09-28", id);
    assert.ok(guide.dateIdea.length >= 40, id);
    assert.ok(guide.practicalities.length >= 3, id);
    assert.match(guideText(id), /temporarily closed/i, id);
    assert.match(guideText(id), /entrance|arrival route/i, id);
    assert.match(guideText(id), /confirm|check/i, id);
    for (const note of guide.practicalities) {
      assert.ok(note.label && note.text.length >= 30, id);
    }
    assert.ok(guide.sources.some(source => source.url === expected[id].profile), `${id}: missing official brand source`);
    assert.ok(guide.sources.some(source => source.url === expected[id].map), `${id}: missing official branch map`);
    assert.equal(new Set(guide.sources.map(source => source.url)).size, guide.sources.length, id);
    for (const source of guide.sources) {
      const url = new URL(source.url);
      assert.ok(source.label, id);
      assert.equal(url.protocol, "https:", id);
      assert.ok(allowedHosts.has(url.hostname.replace(/^www\./, "")), `${id}: non-primary guide source ${url}`);
      assert.ok(places.get(id).sourceUrls.includes(source.url), `${id}: guide source absent from provenance`);
    }
    assert.deepEqual(guide.pairWithPlaceIds, [], `${id}: seasonal cafe should not promise a ready-to-go date plan`);
  }
});

test("Hidden's 1 October announcement remains distinct from its 28 September closed snapshot", () => {
  const hidden = places.get("hidden-desert-cafe");
  const announcement = "https://www.instagram.com/hidden_dubai/reel/DdtWRkGpXPN/";
  assert.ok(hidden.sourceUrls.includes(announcement));
  assert.ok(guides.get(hidden.id).sources.some(source => source.url === announcement));
  assert.match(hidden.description, /announced.*1 October 2026/i);
  assert.match(guideText(hidden.id), /25 September 2026.*1 October 2026/i);
  assert.match(guideText(hidden.id), /confirm that reopening has happened/i);
  assert.equal(hidden.resolution.businessStatus, "CLOSED_TEMPORARILY");
  assert.match(guideText(hidden.id), /Fort.*own admission.*not automatically included/i);
});

test("carousel mislabelling and similarly named city branches do not overwrite the intended locations", () => {
  const parkers = places.get("parkers-al-marmoom");
  assert.match(parkers.name, /Parker.*Al Marmoom/i);
  assert.match(parkers.description, /Parker.*signage in the carousel/i);
  assert.doesNotMatch([parkers.name, ...parkers.aliases].join(" "), /uncommon/i);
  assert.match(parkers.address, /R9R7\+4X8.*Saih Al Salam/i);
  assert.match(guideText(parkers.id), /mall restaurants and Nad Al Sheba.*different destinations/i);
  assert.ok(parkers.sourceUrls.includes("https://byparkers.com/parkers-international/social-media-uae/"));

  const myspace = places.get("my-space-desert-cafe");
  assert.match(myspace.name, /Desert, Nazwa/);
  assert.match(myspace.address, /XMQ7\+38M.*Al Qasimia City.*Sharjah/);
  assert.match(myspace.description, /separate from its Aljada city café/i);
  assert.match(guideText(myspace.id), /\+971 52 729 6666/);
  assert.match(guideText(myspace.id), /Aljada's 24\/7 hours do not apply/i);
  assert.doesNotMatch(myspace.locationHint, /Aljada/);

  const oneDegree = places.get("one-degree-mushrif");
  assert.match(oneDegree.name, /Winter.*Mushrif/);
  assert.match(oneDegree.address, /Mushrif Nat'l Pk.*Mushraif/);
  assert.match(oneDegree.description, /not the older Margham pop-up/i);
  assert.match(guideText(oneDegree.id), /Al Warqa, Jumeirah and Last Exit are separate branches/i);
  assert.doesNotMatch(oneDegree.locationHint, /Margham|Lahbab|Al Warqa/i);
});

test("The Uncommon preserves the official historical DSF location without a fabricated live Google venue", () => {
  const place = places.get(uncommonId);
  const guide = guides.get(uncommonId);
  const source = "https://theuncommon.ae/pages/about-us";
  assert.ok(place);
  assert.equal(payload.places.filter(item => item.id === uncommonId).length, 1);
  assert.equal(place.placeId, null);
  assert.deepEqual(place.googleTypes, []);
  assert.equal(place.primaryGoogleType, null);
  assert.equal(place.emirate, "Dubai");
  assert.equal(place.listingType, "place");
  assert.deepEqual(place.coordinates, { lat: 24.8393125, lng: 55.3570625 });
  assert.match(place.address, /7HPQR9Q4\+PR.*former Al Marmoom/);
  assert.equal(place.resolution.source, "official-dsf-map");
  assert.equal(place.resolution.status, "resolved");
  assert.equal(place.resolution.businessStatus, null);
  assert.equal(place.visitStatus.kind, "season-unconfirmed");
  assert.match(place.visitStatus.checkedAt, /^2026-09-28T/);
  assert.equal(place.visitStatus.sourceUrl, source);
  assert.match(place.visitStatus.note, /Historical desert-site bookmark/i);
  assert.ok(place.sourceUrls.includes(carousel));
  assert.ok(place.sourceUrls.includes("https://dsfmap.visitdubai.com/assets/maps/dsfinteractive.json"));
  assert.match(place.description, /official archived festival map/);
  assert.match(place.description, /not a guaranteed current entrance/);
  assert.match(place.description, /not the brand’s DIFC, beach or Al Fayah venue/);
  const map = new URL(place.googleMapsSearchUri);
  assert.equal(map.origin, "https://www.google.com");
  assert.equal(map.searchParams.get("query"), "24.8393125,55.3570625");
  assert.equal(map.searchParams.has("query_place_id"), false);
  assert.equal(place.events, undefined);
  assert.ok(matchesExperience(place, [], "eat-drink", "cafes"));
  assert.equal(matchesExperience(place, [], "whats-on"), false);
  assert.deepEqual(placeClosureNotice(place), {
    label: "Seasonal reopening unconfirmed", checkedDate: "28 Sept 2026",
    sourceLabel: "Official-source check", note: place.visitStatus.note, sourceUrl: source,
  });
  assert.deepEqual(surpriseCandidates([...entries, place], null), []);
  for (const [key, value] of Object.entries(allCanonical.find(item => item.id === uncommonId))) {
    assert.deepEqual(place[key], value, `Uncommon canonical ${key}`);
  }
  assert.ok(guide);
  assert.equal(editorial.guides.filter(item => item.placeId === uncommonId).length, 1);
  assert.equal(guide.verifiedAt, "2026-09-28");
  assert.ok(guide.dateIdea.length >= 40);
  assert.equal(guide.practicalities.length, 3);
  assert.match(guideText(uncommonId), /approximately 14-metre map cell/);
  assert.match(guideText(uncommonId), /not a verified current entrance or parking area/);
  assert.match(guideText(uncommonId), /No new desert season or reopening date was confirmed/);
  assert.match(guideText(uncommonId), /no live Google gallery is available/);
  assert.match(guideText(uncommonId), /not advertised as upcoming events/);
  for (const source of guide.sources) {
    assert.ok(source.label);
    assert.equal(new URL(source.url).protocol, "https:");
    assert.ok(place.sourceUrls.includes(source.url));
  }
  assert.ok(guide.sources.some(item => item.url === "https://dsfmap.visitdubai.com/"));
  assert.ok(guide.sources.some(item => item.url === source));
  assert.deepEqual(guide.pairWithPlaceIds, []);
});

test("offline regeneration preserves all six seasonal identities, statuses and exact map destinations", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsso-desert-carousel-test-"));
  try {
    fs.writeFileSync(path.join(dir, "source.csv"), "Location Name,Location Description,Location URL,Location\n");
    fs.writeFileSync(path.join(dir, "curation.json"), JSON.stringify({ version: 1, places: allCanonical }));
    const cache = Object.fromEntries(entries.map(place => [`google-place-id:${place.placeId}`, {
      address: place.address, coordinates: place.coordinates, placeId: place.placeId,
      googleTypes: place.googleTypes, primaryGoogleType: place.primaryGoogleType,
      resolutionSource: place.resolution.source, resolutionStatus: place.resolution.status,
      fetchedAt: place.resolution.matchedAt, matchedName: place.resolution.matchedName,
      websiteUri: place.resolution.websiteUri, businessStatus: place.resolution.businessStatus,
      googleMapsSearchUri: place.googleMapsSearchUri,
    }]));
    fs.writeFileSync(path.join(dir, ".places-geocode-cache.json"), JSON.stringify(cache));
    fs.writeFileSync(path.join(dir, "no-network.mjs"), "globalThis.fetch = () => { throw new Error('Unexpected network call'); };\n");
    execFileSync(process.execPath, [
      "--import", path.join(dir, "no-network.mjs"), path.join(root, "scripts/build-dubai-places.mjs"),
      "--source", "source.csv", "--curation", "curation.json", "--output", "output.json",
      "--as-of", "2026-09-28T09:00:00Z",
    ], { cwd: dir, env: { ...process.env, GOOGLE_PLACES_ENRICHMENT_API_KEY: "offline-test-only" }, timeout: 15000 });
    const rebuilt = JSON.parse(fs.readFileSync(path.join(dir, "output.json")));
    assert.equal(rebuilt.meta.cacheMisses, 0);
    assert.equal(rebuilt.places.length, 6);
    for (const entry of allCanonical) {
      const place = rebuilt.places.find(item => item.id === entry.id);
      assert.ok(place, entry.id);
      for (const [key, value] of Object.entries(entry)) assert.deepEqual(place[key], value, `${entry.id}.${key}`);
      assert.deepEqual(place.coordinates, places.get(entry.id).coordinates, entry.id);
      assert.equal(place.emirate, places.get(entry.id).emirate, entry.id);
      assert.equal(place.resolution.businessStatus, places.get(entry.id).resolution.businessStatus, entry.id);
      assert.equal(place.googleMapsSearchUri, places.get(entry.id).googleMapsSearchUri, entry.id);
      assert.ok(matchesExperience(place, [], "eat-drink", "cafes"), entry.id);
    }
    const rebuiltUncommon = rebuilt.places.find(place => place.id === uncommonId);
    assert.equal(rebuiltUncommon.placeId, null);
    assert.equal(rebuiltUncommon.resolution.source, "official-dsf-map");
    assert.deepEqual(rebuiltUncommon.visitStatus, places.get(uncommonId).visitStatus);
    assert.deepEqual(surpriseCandidates(rebuilt.places, null), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a nullable Google ID is rejected without an explicit verified location override", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsso-desert-invalid-test-"));
  try {
    fs.writeFileSync(path.join(dir, "source.csv"), "Location Name,Location Description,Location URL,Location\n");
    fs.writeFileSync(path.join(dir, "no-network.mjs"), "globalThis.fetch = () => { throw new Error('Unexpected network call'); };\n");
    const fixture = { ...allCanonical.find(place => place.id === uncommonId), id: "unverified-seasonal-location" };
    fs.writeFileSync(path.join(dir, "curation.json"), JSON.stringify({ version: 1, places: [fixture] }));
    assert.throws(() => execFileSync(process.execPath, [
      "--import", path.join(dir, "no-network.mjs"), path.join(root, "scripts/build-dubai-places.mjs"),
      "--source", "source.csv", "--curation", "curation.json", "--output", "output.json",
      "--as-of", "2026-09-28T09:00:00Z",
    ], {
      cwd: dir, env: { ...process.env, GOOGLE_PLACES_ENRICHMENT_API_KEY: "offline-test-only" },
      timeout: 15000, stdio: "pipe",
    }), error => {
      assert.match(error.stderr.toString(), /placeId is required unless an explicit verified location override exists/);
      assert.doesNotMatch(error.stderr.toString(), /Unexpected network call/);
      return true;
    });
    assert.equal(fs.existsSync(path.join(dir, "output.json")), false, "invalid location must not produce an approximate pin");
    assert.equal(fs.existsSync(path.join(dir, ".places-geocode-cache.json")), false, "invalid location must not geocode");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
