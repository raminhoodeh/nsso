import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { activeEventsFor, exhibitionEntries, exhibitionsCalendar, googleCalendarUrl } from "../src/lib/places-events.ts";

const payload = JSON.parse(fs.readFileSync(new URL("../src/data/places-dubai.generated.json", import.meta.url)));
const curation = JSON.parse(fs.readFileSync(new URL("../src/data/dubai-date-curation.json", import.meta.url)));
const now = Date.parse("2026-09-23T18:00:00+04:00");
const entries = exhibitionEntries(payload.places, now);

test("all five carousel events are distinct and chronological at four venues", () => {
  assert.deepEqual(entries.map(({event})=>event.id), ["dubai-design-week-2026", "downtown-design-dubai-2026", "art-connects-women-2026", "world-art-dubai-2026", "quoz-arts-fest-2027"]);
  assert.equal(new Set(entries.map(({place})=>place.id)).size, 4);
  assert.equal(new Set(payload.places.map(p=>p.id)).size, payload.places.length);
  const eventIds = payload.places.flatMap(p=>(p.events||[]).map(e=>e.id));
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.equal(payload.meta.placeCount, payload.places.length);
  assert.equal(payload.meta.eventCount, eventIds.length);
});

test("generated events match canonical curation, without duplicate venues", () => {
  for (const {place,event} of entries) {
    assert.deepEqual(event, curation.places.find(p=>p.id===place.id).events.find(e=>e.id===event.id));
    assert.equal(payload.places.filter(p=>p.placeId===place.placeId).length, 1);
    assert.ok(event.visitNote);
    assert.ok(event.sourceUrl.startsWith("https://"));
  }
});

test("World Art Dubai is at DWTC, not the superseded Expo City pin", () => {
  assert.equal(entries.find(({event})=>event.id==="world-art-dubai-2026").place.id, "dubai-world-trade-centre-events");
  assert.ok(!payload.places.find(p=>p.id==="dubai-exhibition-centre-events").events.some(e=>e.id==="world-art-dubai-2026"));
});

test("public dates and provisional access notes are retained", () => {
  const downtown = entries.find(({event})=>event.id==="downtown-design-dubai-2026").event;
  assert.equal(downtown.calendar.startDate, "2026-11-05");
  assert.match(downtown.visitNote, /invitation-only/);
  const acw = entries.find(({event})=>event.id==="art-connects-women-2026");
  assert.equal(acw.place.resolution.status, "approximate");
  assert.match(acw.event.visitNote, /not confirmed admission/);
});

test("search returns individual events, including both events at d3", () => {
  assert.equal(exhibitionEntries(payload.places, now, "Design").length, 2);
  assert.equal(exhibitionEntries(payload.places, now, "Downtown Design").length, 2); // DDW description explains its separate fair in visitNote.
  assert.equal(exhibitionEntries(payload.places, now, "World Art Dubai").length, 1);
  assert.equal(exhibitionEntries(payload.places, now, "not-an-event").length, 0);
});

test("expired, stale, cancelled and invalid events never appear", () => {
  const place=entries[0].place;
  for (const patch of [{status:"cancelled"}, {status:"sold-out"}, {endsAt:"2020-01-01"}, {verifiedUntil:"2020-01-01"}, {endsAt:"invalid"}]) {
    assert.equal(activeEventsFor({...place,events:[{...entries[0].event,...patch}]},now).length,0);
  }
  assert.equal(activeEventsFor(place,null).length,0);
  assert.equal(exhibitionEntries(payload.places,Date.parse("2027-02-01T00:00:00+04:00")).length,0);
});

test("ICS includes five free all-day events, exclusive ends and two reminders each", () => {
  const ics=exhibitionsCalendar(payload.places,now);
  const unfolded=ics.replace(/\r\n /g,"");
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,5);
  assert.equal((ics.match(/TRANSP:TRANSPARENT/g)||[]).length,5);
  assert.equal((ics.match(/BEGIN:VALARM/g)||[]).length,10);
  for(const {event} of entries) {
    assert.ok(unfolded.includes(`UID:${event.id}@nsso.me`));
    assert.ok(unfolded.includes(`DTEND;VALUE=DATE:${event.calendar.endDateExclusive.replaceAll("-","")}`));
  }
  assert.ok(ics.split("\r\n").every(line=>Buffer.byteLength(line)<=75));
  assert.match(unfolded,/TRIGGER:-P7D/);
  assert.match(unfolded,/TRIGGER:-P1D/);
  assert.match(unfolded,/DTEND;VALUE=DATE:20270201/);
});

test("Google Calendar links use full public date spans in Dubai time", () => {
  for(const {place,event} of entries) {
    const url=new URL(googleCalendarUrl(event,place));
    assert.equal(url.origin,"https://calendar.google.com");
    assert.equal(url.searchParams.get("ctz"),"Asia/Dubai");
    assert.equal(url.searchParams.get("dates"),`${event.calendar.startDate.replaceAll("-","")}/${event.calendar.endDateExclusive.replaceAll("-","")}`);
    assert.ok(url.searchParams.get("details").includes(event.visitNote));
  }
});
