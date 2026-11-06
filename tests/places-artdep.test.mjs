import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { activeEventsFor, exhibitionEntries, exhibitionsCalendar, googleCalendarUrl } from "../src/lib/places-events.ts";
import { matchesExperience } from "../src/lib/places-experiences.ts";

const helperUrl = new URL("../src/lib/places-agenda.ts", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === helperUrl.href && ["./places-events", "./places-experiences"].includes(specifier)) {
      return nextResolve(new URL(`${specifier}.ts`, helperUrl).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { agendaEntries } = await import(helperUrl.href);
hooks.deregister();

const read = file => JSON.parse(fs.readFileSync(new URL(`../src/data/${file}`, import.meta.url)));
const payload = read("places-dubai.generated.json");
const curation = read("dubai-date-curation.json");
const now = Date.parse("2026-11-06T18:12:46Z");
const source = "https://www.artdepuae.com/real-estate-listing";
const salonId = "artdep-salon-of-thinkers-2026-11-14";
const walkId = "artdep-frieze-abu-dhabi-walk-2026-11-21";
const soldOutId = "artdep-frieze-abu-dhabi-walk-2026-11-22";
const artdepIds = new Set([salonId, walkId, soldOutId]);
const places = payload.places.map(place => ({ ...place,
  events: (place.events || []).filter(event => artdepIds.has(event.id)),
})).filter(place => place.events.length);
const canonical = curation.places.filter(place => (place.events || []).some(event => artdepIds.has(event.id)));
const entries = agendaEntries(places, now);

test("ArtDep has two bookable listings at two unique intended venue pins", () => {
  assert.deepEqual(entries.map(({ event }) => event.id), [salonId, walkId]);
  assert.deepEqual(entries.map(({ place }) => place.id), ["cabinet-of-curiosity", "manarat-al-saadiyat-events"]);
  for (const { place, event } of entries) {
    assert.equal(payload.places.filter(candidate => candidate.placeId === place.placeId).length, 1);
    assert.deepEqual(event, canonical.find(candidate => candidate.id === place.id).events.find(candidate => candidate.id === event.id));
    assert.equal(event.status, "scheduled");
    assert.equal(event.timezone, "Asia/Dubai");
    assert.equal(event.sourceUrl, source);
    assert.equal(event.bookingUrl, source, "organiser hub retains current pricing instead of a stale early-bird checkout");
    assert.equal(event.verifiedAt, "2026-11-06T18:12:46Z");
    assert.equal(event.verifiedUntil, event.endsAt);
    assert.match(event.visitNote, /end time is unpublished/i);
    assert.doesNotMatch(event.visitNote, /listing expiry/i, "technical expiry handling stays out of visitor copy");
  }
});

test("Cabinet of Curiosity keeps its permanent Google identity and source row", () => {
  const place = entries[0].place;
  assert.equal(place.placeId, "ChIJTRRv8d1rXz4RYOp5SgWgZic");
  assert.deepEqual(place.coordinates, { lat: 25.1301371, lng: 55.226001999999994 });
  assert.deepEqual(place.sourceRows, [47]);
  assert.equal(place.emirate, "Dubai");
  assert.notEqual(place.listingType, "event-venue");
  assert.match(place.address, /Goshi Warehouses.*Warehouse #18/);
});

test("Manarat pin is in Abu Dhabi and clearly distinguishes venue from meeting point", () => {
  const { place, event } = entries[1];
  assert.equal(place.placeId, "ChIJdyeUFkJnXj4RZ37L2WWmKpo");
  assert.deepEqual(place.coordinates, { lat: 24.5342114, lng: 54.4189099 });
  assert.equal(place.emirate, "Abu Dhabi");
  assert.equal(place.listingType, "event-venue");
  assert.equal(place.resolution.source, "firecrawl-maps");
  assert.equal(place.resolution.status, "resolved");
  assert.deepEqual(place.sourceRows, []);
  assert.equal(new URL(place.googleMapsSearchUri).searchParams.get("query_place_id"), place.placeId);
  assert.match(event.visitNote, /not the group meeting point/);
  assert.match(event.visitNote, /excludes Frieze Abu Dhabi admission/);
  assert.ok(event.visitNote.includes("https://www.friezeabudhabi.com/en/tickets"));
});

test("dates, start times and explicit price windows agree with the organiser", () => {
  const salon = entries[0].event;
  const walk = entries[1].event;
  assert.equal(salon.startsAt, "2026-11-14T18:00:00+04:00");
  assert.equal(salon.endsAt, "2026-11-15T00:00:00+04:00");
  assert.match(salon.dateLabel, /179.*5% VAT through 10 Nov.*199.*5% VAT from 11 Nov/);
  assert.equal(walk.startsAt, "2026-11-21T14:00:00+04:00");
  assert.equal(walk.endsAt, "2026-11-22T00:00:00+04:00");
  assert.match(walk.dateLabel, /250.*5% VAT through 6 Nov.*280.*5% VAT from 7 Nov/);
});

test("the 22 November sold-out session is retained canonically but not offered or exported", () => {
  const venue = canonical.find(place => place.id === "manarat-al-saadiyat-events");
  const event = venue.events.find(candidate => candidate.id === soldOutId);
  assert.equal(event.status, "sold-out");
  assert.equal(event.startsAt, "2026-11-22T14:00:00+04:00");
  assert.equal(event.bookingUrl, null);
  assert.match(event.dateLabel, /Sold out/);
  assert.match(entries[1].event.visitNote, /22 November session is sold out/);
  assert.deepEqual(activeEventsFor(venue, now).map(candidate => candidate.id), [walkId]);
  assert.ok(!exhibitionsCalendar(canonical, now).includes(soldOutId));
  assert.ok(!payload.places.flatMap(place => place.events || []).some(candidate => candidate.id === soldOutId));
});

test("salon is More events, the fair walk is Art exhibitions, and reminders remain separate", () => {
  assert.deepEqual(agendaEntries(places, now, "other-events").map(({ event }) => event.id), [salonId]);
  assert.deepEqual(exhibitionEntries(places, now).map(({ event }) => event.id), [walkId]);
  assert.deepEqual(agendaEntries(places, now, "art-exhibitions").map(({ event }) => event.id), [walkId]);
  assert.equal(agendaEntries(places, now, null, "this-month").length, 2);
  for (const { place, event } of entries) {
    const url = new URL(googleCalendarUrl(event, place));
    assert.equal(url.searchParams.get("ctz"), "Asia/Dubai");
    const day = event.id === salonId ? 14 : 21;
    assert.equal(url.searchParams.get("dates"), `202611${day}/202611${day + 1}`);
    assert.match(url.searchParams.get("details"), /not a booking/);
    assert.ok(!activeEventsFor(place, Date.parse(event.endsAt)).length);
  }
  const manarat = entries[1].place;
  const ended = activeEventsFor(manarat, Date.parse("2026-11-22T00:00:00+04:00"));
  assert.equal(matchesExperience(manarat, ended, "whats-on"), false);
});

test("catalogue metadata and identities remain consistent after the scoped addition", () => {
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.curatedRecordCount, curation.places.length);
  const events = payload.places.flatMap(place => place.events || []);
  assert.equal(payload.meta.eventCount, events.length);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  assert.equal(new Set(payload.places.map(place => place.id)).size, payload.places.length);
});
