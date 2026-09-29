import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { activeEventsFor, googleCalendarUrl } from "../src/lib/places-events.ts";

const payload = JSON.parse(fs.readFileSync(new URL("../src/data/places-dubai.generated.json", import.meta.url)));
const curation = JSON.parse(fs.readFileSync(new URL("../src/data/dubai-date-curation.json", import.meta.url)));
const editorial = JSON.parse(fs.readFileSync(new URL("../src/data/places-editorial.json", import.meta.url)));
const places = new Map(payload.places.map(place => [place.id, place]));
const canonical = new Map(curation.places.map(place => [place.id, place]));
const guides = new Map(editorial.guides.map(guide => [guide.placeId, guide]));

// Explicit identities recorded from the 28 September Places verification.
// Approximate centres guard against accidentally replacing a resolved branch
// with a same-name venue elsewhere; Google IDs guard the individual venue.
const newPins = [
  ["lecole-jewelry-arts-dubai", "ChIJe7NHrBdpXz4RxQjxtLnH1tU", 25.18957, 55.29808, "Dubai", "lecolevancleefarpels.com"],
  ["oo-la-lab-d3", "ChIJ-_weeOVrXz4RieeddsJd-as", 25.18848, 55.29712, "Dubai", "oola-lab.com"],
  ["yadawei-pottery-studio", "ChIJiRKgNn5pXz4RqMtDfyfIRJI", 25.14004, 55.22678, "Dubai", "yadaweistudio.com"],
  ["tashkeel-makerspace", "ChIJhz4CqQFrXz4RNQhZiK-9B_U", 25.14244, 55.22573, "Dubai", "tashkeel.org"],
  ["tashkeel-nad-al-sheba", "ChIJL51OAyVmXz4RdnZyIuAvsrE", 25.15540, 55.32337, "Dubai", "tashkeel.org"],
  ["xva-gallery-cafe", "ChIJtcXng5FCXz4R7BYg9jKLO44", 25.26411, 55.29988, "Dubai", "xvagallery.com"],
  ["crossroads-of-civilizations-museum", "ChIJAYjKxGtDXz4R3rcAPwhfejY", 25.26763, 55.28897, "Dubai", "themuseum.ae"],
  ["smccu-al-fahidi", "ChIJJ7AvWDhDXz4RgtxWx69mLkk", 25.26412, 55.30074, "Dubai", "cultures.ae"],
  ["house-of-wisdom-sharjah", "ChIJM2wxqpX19T4RKMyYzNbZvak", 25.31823, 55.50587, "Sharjah", "houseofwisdom.ae"],
  ["rain-room-sharjah", "ChIJjRqI5HNbXz4ROiwAfhh94BI", 25.36552, 55.39318, "Sharjah", "sharjahart.org"],
  ["green-art-gallery", "ChIJZXf9_X9pXz4RVZ897vIapf8", 25.14202, 55.22608, "Dubai", "gagallery.com"],
  ["the-third-line", "ChIJRcbZaklDXz4RO7L-wglILxM", 25.14270, 55.22457, "Dubai", "thethirdline.com"],
  ["lawrie-shabibi", "ChIJJ83L4X9pXz4R6D4MGyLjIcs", 25.14109, 55.22600, "Dubai", "alserkal.online"],
  ["tabari-artspace", "ChIJRcbZaklDXz4RXl9EscSd0CA", 25.21351, 55.28239, "Dubai", "tabariartspace.com"],
  ["dom-art-projects", "ChIJe8qJaJBrXz4Rr9OEMB04xGI", 25.14022, 55.22670, "Dubai", "domprojects.art"],
];

const host = url => new URL(url).hostname.replace(/^www\./, "");
const sourceHosts = new Set([
  ...newPins.map(([, , , , , domain]) => domain),
  "jameelartscentre.org", "fikerinstitute.org", "cinemaakil.com", "visitdubai.com", "mbrl.ae",
  "shop.tashkeel.org", "rainroom.sharjahart.org",
]);

test("all fifteen researched pins have their intended Google identity, branch, coordinates and official sources", () => {
  assert.equal(newPins.length, 15);
  assert.equal(new Set(newPins.map(([id]) => id)).size, newPins.length);
  for (const [id, googleId, latitude, longitude, emirate, officialHost] of newPins) {
    const place = places.get(id);
    assert.ok(place, id);
    assert.equal(place.placeId, googleId, id);
    assert.equal(place.emirate, emirate, id);
    assert.equal(place.listingType, "place", id);
    assert.equal(place.resolution.status, "resolved", id);
    assert.equal(place.resolution.source, "google-places-new", id);
    assert.equal(place.resolution.businessStatus, "OPERATIONAL", id);
    assert.match(place.resolution.matchedAt, /^2026-09-28T/, id);
    assert.ok(place.resolution.matchedName, id);
    assert.ok(Number.isFinite(place.coordinates.lat) && Number.isFinite(place.coordinates.lng), id);
    assert.ok(Math.abs(place.coordinates.lat - latitude) < 0.003, `${id}: incorrect latitude area`);
    assert.ok(Math.abs(place.coordinates.lng - longitude) < 0.003, `${id}: incorrect longitude area`);
    assert.ok(place.address.length > 20 && place.locationHint.length > 20, id);
    assert.equal(payload.places.filter(candidate => candidate.placeId === googleId).length, 1, `${id}: duplicate Google pin`);
    const maps = new URL(place.googleMapsSearchUri);
    assert.equal(maps.origin, "https://www.google.com", id);
    assert.equal(maps.searchParams.get("query_place_id"), googleId, id);
    assert.ok(place.sourceUrls.some(url => host(url) === officialHost), `${id}: missing organiser source`);
    assert.ok(place.sourceUrls.every(url => new URL(url).protocol === "https:"), id);
    assert.deepEqual(place.sourceRows, [], `${id}: research pin should not invent a CSV source row`);
    const entry = canonical.get(id);
    assert.ok(entry, `${id}: missing canonical entry`);
    for (const key of ["name", "aliases", "description", "sourceUrls", "locationHint", "placeId", "listingType", "taxonomy", "events"]) {
      assert.deepEqual(place[key], entry[key], `${id}: generated ${key} must match curation`);
    }
  }
});

test("gallery warehouse addresses and separate Tashkeel branches are preserved", () => {
  for (const [id, pattern] of [
    ["green-art-gallery", /(?:Unit|Warehouse) 28/i],
    ["the-third-line", /Warehouse 78/i],
    ["lawrie-shabibi", /Warehouse 21/i],
    ["tabari-artspace", /Building 3.*Podium/i],
    ["dom-art-projects", /Warehouse 40.*Al Khayat/i],
    ["tashkeel-makerspace", /(?:Unit|Warehouse) 89/i],
  ]) assert.match(places.get(id).locationHint, pattern, id);
  assert.doesNotMatch(places.get("dom-art-projects").locationHint, /Alserkal/i);
  assert.notEqual(places.get("tashkeel-makerspace").placeId, places.get("tashkeel-nad-al-sheba").placeId);
  assert.ok(Math.abs(places.get("tashkeel-makerspace").coordinates.lng - places.get("tashkeel-nad-al-sheba").coordinates.lng) > 0.05);
});

test("the original twenty dated visit guides retain practical advice and official sources", () => {
  const expectedIds = [...newPins.map(([id]) => id), "jameel-arts-centre", "fiker-institute-library", "cinema-akil",
    "mohammed-bin-rashid-library", "al-safa-art-design-library"];
  assert.ok(Date.parse(editorial.researchedAt) >= Date.parse("2026-09-28"));
  assert.equal(guides.size, editorial.guides.length);
  assert.equal(expectedIds.length, 20);
  for (const id of expectedIds) {
    const guide = guides.get(id);
    assert.ok(guide, id);
    assert.ok(places.has(guide.placeId), guide.placeId);
    assert.equal(guide.verifiedAt, "2026-09-28", guide.placeId);
    assert.ok(guide.dateIdea.length >= 40, guide.placeId);
    assert.ok(guide.practicalities.length >= 2, guide.placeId);
    for (const item of guide.practicalities) {
      assert.ok(item.label && item.text.length >= 20, `${guide.placeId}: empty practical note`);
    }
    assert.ok(guide.sources.length > 0, guide.placeId);
    assert.equal(new Set(guide.sources.map(source => source.url)).size, guide.sources.length, guide.placeId);
    for (const source of guide.sources) {
      assert.ok(source.label, guide.placeId);
      assert.equal(new URL(source.url).protocol, "https:", guide.placeId);
      assert.ok(sourceHosts.has(host(source.url)), `${guide.placeId}: unexpected unverified source ${source.url}`);
    }
    assert.equal(new Set(guide.pairWithPlaceIds).size, guide.pairWithPlaceIds.length, guide.placeId);
    for (const pairId of guide.pairWithPlaceIds) {
      assert.notEqual(pairId, guide.placeId, `${guide.placeId}: self-pair`);
      assert.ok(places.has(pairId), `${guide.placeId}: broken pairing ${pairId}`);
    }
  }
});

test("five date plans reference real distinct venues and distinguish suggestions from bookings or routes", () => {
  const expected = {
    "alserkal-books-film": ["fiker-institute-library", "green-art-gallery", "cinema-akil"],
    "old-dubai-conversations": ["xva-gallery-cafe", "smccu-al-fahidi"],
    "jaddaf-art-books": ["jameel-arts-centre", "mohammed-bin-rashid-library"],
    "sharjah-rain-reading": ["rain-room-sharjah", "house-of-wisdom-sharjah"],
    "d3-make-a-memory": ["oo-la-lab-d3", "lecole-jewelry-arts-dubai", "qinwan-d3"],
  };
  assert.equal(editorial.datePlans.length, 5);
  assert.equal(new Set(editorial.datePlans.map(plan => plan.id)).size, 5);
  for (const plan of editorial.datePlans) {
    assert.deepEqual(plan.placeIds, expected[plan.id], plan.id);
    assert.ok(plan.title && plan.area && plan.description.length >= 80, plan.id);
    assert.equal(new Set(plan.placeIds).size, plan.placeIds.length, plan.id);
    assert.ok(plan.placeIds.every(id => places.has(id)), plan.id);
    assert.match(plan.description, /confirm|check|reserve|book/i, `${plan.id}: needs scheduling caveat`);
  }
  const sharjah = editorial.datePlans.find(plan => plan.id === "sharjah-rain-reading");
  assert.match(sharjah.description, /drive between/i);
  assert.match(sharjah.description, /not a walking route/i);
  assert.match(editorial.datePlans.find(plan => plan.id === "d3-make-a-memory").description, /not a package/i);
});

test("visit guides retain researched access, conflicting-source and booking caveats", () => {
  const text = id => guides.get(id).practicalities.map(item => item.text).join(" ");
  assert.match(text("fiker-institute-library"), /AED 85/);
  assert.match(text("fiker-institute-library"), /Books stay inside/i);
  assert.match(text("jameel-arts-centre"), /differ on.*closing times/i);
  assert.match(text("jameel-arts-centre"), /Closed Tuesdays/i);
  assert.match(text("yadawei-pottery-studio"), /up to three weeks/i);
  assert.match(text("yadawei-pottery-studio"), /220.*231/);
  assert.match(text("tashkeel-makerspace"), /different access schedules/i);
  assert.match(text("cinema-akil"), /actual film and showtime/i);
});

test("Oo La's date night is 20 November 2026 at 7–9pm Dubai time, not an undated weekly promise", () => {
  const place = places.get("oo-la-lab-d3");
  assert.equal(place.events.length, 1);
  const event = place.events[0];
  assert.equal(event.id, "oo-la-date-night-challenge-2026-11-20");
  assert.equal(event.startsAt, "2026-11-20T19:00:00+04:00");
  assert.equal(event.endsAt, "2026-11-20T21:00:00+04:00");
  assert.equal(Date.parse(event.endsAt) - Date.parse(event.startsAt), 2 * 60 * 60 * 1000);
  assert.equal(event.timezone, "Asia/Dubai");
  assert.equal(event.sourceUrl, "https://oola-lab.com/products/dubai-date-night-challenge-edition");
  assert.equal(event.bookingUrl, event.sourceUrl);
  assert.match(event.dateLabel, /20 Nov 2026.*AED 550 per couple/);
  assert.match(event.visitNote, /remaining places.*not verified/i);
  assert.match(event.visitNote, /all-day reminder/i);
  assert.match(event.visitNote, /Building 4, Unit 204B/);
  assert.deepEqual(event.calendar, { startDate: "2026-11-20", endDateExclusive: "2026-11-21" });
  assert.deepEqual(event, canonical.get(place.id).events[0]);
  assert.equal(activeEventsFor(place, Date.parse("2026-11-20T20:59:59+04:00")).length, 1);
  assert.equal(activeEventsFor(place, Date.parse("2026-11-20T21:00:00+04:00")).length, 0);
  const calendar = new URL(googleCalendarUrl(event, place));
  assert.equal(calendar.searchParams.get("dates"), "20261120/20261121");
  assert.equal(calendar.searchParams.get("ctz"), "Asia/Dubai");
  assert.match(calendar.searchParams.get("details"), /not a booking/);
});

test("catalogue metadata and all place/event IDs remain internally consistent", () => {
  assert.equal(places.size, payload.places.length);
  assert.equal(canonical.size, curation.places.length);
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.curatedRecordCount, curation.places.length);
  const ids = payload.places.flatMap(place => (place.events || []).map(event => event.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(payload.meta.eventCount, ids.length);
});
