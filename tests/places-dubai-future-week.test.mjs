import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { activeEventsFor, exhibitionEntries, googleCalendarUrl } from "../src/lib/places-events.ts";
import { matchesExperience } from "../src/lib/places-experiences.ts";
import { searchPlaces } from "../src/lib/places-search.ts";

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

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const payload = read("../src/data/places-dubai.generated.json");
const canonical = read("../src/data/dubai-date-curation.json");
// Independent official programme snapshot, including sessions intentionally not published.
const manifest = read("../docs/places-dubai-future-week-2026-source.json");
const publicSessions = manifest.sessions.filter(session => session.accessLevel === "public");
const inviteSessions = manifest.sessions.filter(session => session.accessLevel === "invite_only");
const eventId = session => `dfw-2026-${session.code.toLowerCase()}`;
const isDfw = event => event.id.startsWith("dfw-2026-");
const entries = payload.places.flatMap(place => (place.events || []).filter(isDfw).map(event => ({ place, event })));
const byId = new Map(entries.map(entry => [entry.event.id, entry]));
const canonicalEvents = canonical.places.flatMap(place => (place.events || []).filter(isDfw));
const venues = payload.places.filter(place => (place.events || []).some(isDfw));
const now = Date.parse("2026-11-06T18:12:46Z");
const sorted = values => [...values].sort();
const venueFor = session => session.location.startsWith("Museum of the Future") ? "museum-of-the-future"
  : session.location.startsWith("3D Printed Office") ? "office-of-the-future-dfw"
    : "emirates-towers-dubai-future-week";

test("all 115 public DFW sessions are imported once; 46 invitation-only sessions are not offered", () => {
  assert.equal(manifest.sessions.length, 161);
  assert.equal(manifest.publicSessionCount, 115);
  assert.equal(publicSessions.length, 115);
  assert.equal(inviteSessions.length, 46);
  const expected = sorted(publicSessions.map(eventId));
  assert.deepEqual(sorted(entries.map(({ event }) => event.id)), expected);
  assert.deepEqual(sorted(canonicalEvents.map(event => event.id)), expected);
  assert.equal(byId.size, 115, "daily repeats must retain separate source session IDs");
  for (const session of inviteSessions) {
    assert.ok(!byId.has(eventId(session)), session.title);
    assert.ok(!canonicalEvents.some(event => event.id === eventId(session)), session.title);
  }
  assert.equal(agendaEntries(venues, now).filter(({ event }) => isDfw(event)).length, 115);
});

test("each session retains its official start/end, room, access and registration information", () => {
  for (const session of publicSessions) {
    const { place, event } = byId.get(eventId(session));
    assert.equal(event.title, `Dubai Future Week — ${session.title}`);
    assert.equal(event.startsAt, session.startsAt, event.id);
    assert.equal(event.endsAt, session.endsAt, event.id);
    assert.match(event.startsAt, /\+04:00$/);
    assert.match(event.endsAt, /\+04:00$/);
    assert.equal(event.verifiedUntil, session.endsAt);
    assert.equal(event.timezone, "Asia/Dubai");
    assert.equal(event.status, "scheduled");
    assert.ok(Number.isFinite(Date.parse(event.verifiedAt)));
    assert.equal(event.sourceUrl, "https://www.dubaifutureweek.com/en/whats-happening");
    assert.equal(event.bookingUrl, "https://www.dubaifutureweek.com/en#register");
    assert.ok(event.description.trim());
    assert.ok(event.visitNote.includes(session.room), `${event.id}: room omitted`);
    assert.ok(event.visitNote.includes(session.location), `${event.id}: location omitted`);
    assert.equal(place.id, venueFor(session), `${event.id}: wrong campus/building`);
    const original = canonical.places.find(candidate => candidate.id === place.id).events.find(candidate => candidate.id === event.id);
    assert.deepEqual(event, original, event.id);
  }
});

test("three building pins serve 34 museum, 78 Emirates Towers and 3 Learning Centre sessions", () => {
  const expected = [
    ["museum-of-the-future", 34, "ChIJqU_DoUtDXz4RxC8gnP8G_Ss", 25.219203399999998, 55.2819328],
    ["emirates-towers-dubai-future-week", 78, "ChIJy91k8pJCXz4R05SelPC02fY", 25.2174377, 55.2827632],
    ["office-of-the-future-dfw", 3, "ChIJ76hFh5JCXz4RqvlK9fWWjts", 25.2165451, 55.281386899999994],
  ];
  assert.deepEqual(sorted(venues.map(place => place.id)), sorted(expected.map(([id]) => id)));
  for (const [id, count, placeId, lat, lng] of expected) {
    const place = venues.find(candidate => candidate.id === id);
    assert.equal(place.events.filter(isDfw).length, count);
    assert.equal(place.placeId, placeId);
    assert.ok(Math.abs(place.coordinates.lat - lat) < 1e-10);
    assert.ok(Math.abs(place.coordinates.lng - lng) < 1e-10);
    assert.equal(payload.places.filter(candidate => candidate.placeId === placeId).length, 1);
    assert.equal(place.emirate, "Dubai");
    if (id === "museum-of-the-future") {
      assert.equal(place.listingType, "place", "museum must remain after the festival");
      assert.deepEqual(place.sourceRows, []);
      assert.equal(place.resolution.source, "google-places-new");
    } else {
      assert.equal(place.listingType, "event-venue");
      assert.equal(place.resolution.source, "firecrawl-maps");
      assert.equal(new URL(place.googleMapsSearchUri).searchParams.get("query_place_id"), placeId);
    }
  }
  assert.ok(!venues.some(place => place.placeId === "ChIJvSwT-ZJCXz4RkKTQzvKWOmU"), "hotel is not the festival campus pin");
});

test("repeated daily experiences survive, and school sessions retain their audience caveat", () => {
  for (const [title, dates] of [
    ["Research Encounters", ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]],
    ["Dubai Future Solutions - Prototypes For Humanity Exhibition", ["2026-11-18", "2026-11-19", "2026-11-20"]],
  ]) {
    const repeats = entries.filter(({ event }) => event.title === `Dubai Future Week — ${title}`);
    assert.deepEqual(sorted(repeats.map(({ event }) => event.startsAt.slice(0, 10))), dates);
    assert.equal(new Set(repeats.map(({ event }) => event.id)).size, dates.length);
  }
  const schools = publicSessions.filter(session => /School Session/.test(session.title));
  assert.equal(schools.length, 3);
  for (const session of schools) {
    const event = byId.get(eventId(session)).event;
    assert.match(event.title, /School Session/);
    assert.match(event.visitNote, /school/i);
    assert.match(event.visitNote, /eligib|groups?|students?/i);
  }
});

test("festival search finds all three venues and categories separate art, performances and talks", () => {
  for (const query of ["Dubai Future Week", "Dubai FutureWeek"]) {
    const found = new Set(searchPlaces(payload.places, query).map(place => place.id));
    for (const venue of venues) assert.ok(found.has(venue.id), `${query}: missing ${venue.id}`);
  }
  for (const session of publicSessions) {
    const { place, event } = byId.get(eventId(session));
    assert.ok(event.taxonomyTags.includes("events-activities"));
    assert.equal(matchesExperience(place, [event], "whats-on"), true);
    if (/Performance|Jam Session/i.test(session.sessionType || "")) {
      assert.equal(matchesExperience(place, [event], "whats-on", "live-shows"), true, event.title);
    }
    if (/Research Encounters|Prototypes For Humanity Exhibition/.test(session.title)) {
      assert.equal(matchesExperience(place, [event], "whats-on", "art-exhibitions"), true, event.title);
    }
    if (session.sessionType === "Workshop" || /Weaving the Future|10,000 Prompts/.test(session.title)) {
      assert.ok(event.taxonomyTags.includes("creative-workshop"), event.title);
    }
  }
  const welcome = entries.find(({ event }) => /A Big Welcome to Dubai Future Week$/.test(event.title));
  assert.equal(matchesExperience(welcome.place, [welcome.event], "whats-on", "other-events"), true);
  assert.equal(exhibitionEntries(venues, now).filter(({ event }) => isDfw(event)).length, 7);
});

test("each session expires at its actual end and calendar links remain all-day reminders", () => {
  for (const { place, event } of entries) {
    const end = Date.parse(event.endsAt);
    assert.ok(activeEventsFor(place, end - 1).some(candidate => candidate.id === event.id), event.id);
    assert.ok(!activeEventsFor(place, end).some(candidate => candidate.id === event.id), event.id);
    const date = event.startsAt.slice(0, 10);
    const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    assert.deepEqual(event.calendar, { startDate: date, endDateExclusive: nextDate });
    const reminder = new URL(googleCalendarUrl(event, place));
    assert.equal(reminder.searchParams.get("dates"), `${date.replaceAll("-", "")}/${nextDate.replaceAll("-", "")}`);
    assert.equal(reminder.searchParams.get("ctz"), "Asia/Dubai");
    assert.match(reminder.searchParams.get("details"), /not a booking/);
  }
  const festivalEnd = Math.max(...entries.map(({ event }) => Date.parse(event.endsAt)));
  assert.equal(agendaEntries(venues, festivalEnd).filter(({ event }) => isDfw(event)).length, 0);
  for (const venue of venues.filter(place => place.listingType === "event-venue")) {
    assert.equal(activeEventsFor(venue, festivalEnd).length, 0);
    assert.equal(matchesExperience(venue, [], "whats-on"), false);
  }
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.eventCount, payload.places.reduce((count, place) => count + (place.events?.length || 0), 0));
});
