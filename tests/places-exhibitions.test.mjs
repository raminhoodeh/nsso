import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { activeEventsFor, exhibitionEntries, exhibitionsCalendar, googleCalendarUrl } from "../src/lib/places-events.ts";

const payload = JSON.parse(fs.readFileSync(new URL("../src/data/places-dubai.generated.json", import.meta.url)));
const curation = JSON.parse(fs.readFileSync(new URL("../src/data/dubai-date-curation.json", import.meta.url)));
const now = Date.parse("2026-09-23T18:00:00+04:00");
const entries = exhibitionEntries(payload.places, now);
// Preserve the original carousel contract without treating every future
// exhibition addition as a regression in that five-event import.
const carouselEventIds = ["dubai-design-week-2026", "downtown-design-dubai-2026", "art-connects-women-2026", "world-art-dubai-2026", "quoz-arts-fest-2027"];
const carouselPlaces = payload.places.map(place => ({ ...place,
  events: (place.events || []).filter(event => carouselEventIds.includes(event.id)),
}));
const carouselEntries = exhibitionEntries(carouselPlaces, now);

// These date and venue fixtures were checked against the organisers on
// 28 September 2026. Exclusive calendar ends are intentional.
const researchEvents = [
  ["private-world-green-art-2026", "green-art-gallery", "2026-09-23", "2026-10-25", "www.gagallery.com"],
  ["rana-begum-taking-form-2026", "the-third-line", "2026-09-23", "2026-11-11", "www.thethirdline.com"],
  ["nada-elkalaawy-butterflys-burden-2026", "lawrie-shabibi", "2026-09-23", "2026-11-08", "www.lawrieshabibi.com"],
  ["fellow-travellers-tabari-2026", "tabari-artspace", "2026-10-08", "2026-12-01", "tabariartspace.com"],
  ["walid-siti-artists-room-2026", "jameel-arts-centre", "2026-09-20", "2027-02-01", "jameelartscentre.org"],
  ["salah-elmur-heart-of-mango-2026", "jameel-arts-centre", "2026-10-31", "2027-03-15", "jameelartscentre.org"],
  ["titize-venetian-dream-2026", "dubai-opera-events", "2026-10-29", "2026-11-01", "www.dubaiopera.com"],
  ["swan-lake-on-ice-2027", "dubai-opera-events", "2027-01-14", "2027-01-18", "www.dubaiopera.com"],
  ["studio-wounds-battles-dom-2026", "dom-art-projects", "2026-09-23", "2026-10-12", "domprojects.art"],
  ["sara-masinaei-boundaries-breaches-2026", "dom-art-projects", "2026-09-23", "2026-10-19", "domprojects.art"],
  ["oo-la-date-night-challenge-2026-11-20", "oo-la-lab-d3", "2026-11-20", "2026-11-21", "oola-lab.com"],
];

test("initial exhibition framing sets centre and zoom together, allowing for the sidebar", () => {
  const explorer=fs.readFileSync(new URL("../src/app/places/dubai/PlacesExplorer.tsx",import.meta.url),"utf8");
  assert.ok(!explorer.includes("map.fitBounds("));
  assert.match(explorer,/map\.moveCamera\(\{ center: \{ lat: center\.lat\(\), lng: center\.lng\(\) - longitudeOffset \}, zoom: fittedZoom \}\)/);
  assert.match(explorer,/mapRect\.width - leftPadding - rightPadding/);
});

test("all five carousel events are distinct and chronological at four venues", () => {
  assert.deepEqual(carouselEntries.map(({event})=>event.id), carouselEventIds);
  assert.equal(new Set(carouselEntries.map(({place})=>place.id)).size, 4);
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
  assert.equal(exhibitionEntries(carouselPlaces, now, "Design").length, 2);
  assert.equal(exhibitionEntries(carouselPlaces, now, "Downtown Design").length, 2); // DDW description explains its separate fair in visitNote.
  assert.equal(exhibitionEntries(payload.places, now, "World Art Dubai").length, 1);
  assert.equal(exhibitionEntries(payload.places, now, "not-an-event").length, 0);
});

test("expired, stale, cancelled and invalid events never appear", () => {
  const place=entries[0].place;
  for (const patch of [{status:"cancelled"}, {status:"sold-out"}, {endsAt:"2020-01-01"}, {verifiedUntil:"2020-01-01"}, {endsAt:"invalid"}]) {
    assert.equal(activeEventsFor({...place,events:[{...entries[0].event,...patch}]},now).length,0);
  }
  assert.equal(activeEventsFor(place,null).length,0);
  assert.equal(exhibitionEntries(carouselPlaces,Date.parse("2027-02-01T00:00:00+04:00")).length,0);
  assert.deepEqual(exhibitionEntries(payload.places,Date.parse("2027-02-01T00:00:00+04:00")).map(({event})=>event.id), ["salah-elmur-heart-of-mango-2026"]);
  assert.equal(exhibitionEntries(payload.places,Date.parse("2027-03-15T00:00:00+04:00")).length,0);
});

test("original carousel ICS retains five non-blocking all-day reminders with exclusive ends", () => {
  const ics=exhibitionsCalendar(carouselPlaces,now);
  const unfolded=ics.replace(/\r\n /g,"");
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,5);
  assert.equal((ics.match(/TRANSP:TRANSPARENT/g)||[]).length,5);
  assert.equal((ics.match(/BEGIN:VALARM/g)||[]).length,10);
  for(const {event} of carouselEntries) {
    assert.ok(unfolded.includes(`UID:${event.id}@nsso.me`));
    assert.ok(unfolded.includes(`DTEND;VALUE=DATE:${event.calendar.endDateExclusive.replaceAll("-","")}`));
  }
  assert.ok(ics.split("\r\n").every(line=>Buffer.byteLength(line)<=75));
  assert.match(unfolded,/TRIGGER:-P7D/);
  assert.match(unfolded,/TRIGGER:-P1D/);
  assert.match(unfolded,/DTEND;VALUE=DATE:20270201/);
});

test("all eleven researched additions retain their verified dates, venue and official source", () => {
  for (const [id, venueId, startDate, endDateExclusive, sourceHost] of researchEvents) {
    const place = payload.places.find(candidate => candidate.id === venueId);
    assert.ok(place, `${id}: missing venue`);
    const event = place.events.find(candidate => candidate.id === id);
    assert.ok(event, id);
    assert.deepEqual(event.calendar, { startDate, endDateExclusive }, id);
    const calendar = new URL(googleCalendarUrl(event, place));
    assert.equal(calendar.origin, "https://calendar.google.com", id);
    assert.equal(calendar.searchParams.get("dates"), `${startDate.replaceAll("-", "")}/${endDateExclusive.replaceAll("-", "")}`, id);
    assert.equal(calendar.searchParams.get("ctz"), "Asia/Dubai", id);
    assert.ok(calendar.searchParams.get("details").includes(event.sourceUrl), id);
    assert.ok(calendar.searchParams.get("details").includes(event.visitNote), id);
    assert.match(calendar.searchParams.get("details"), /not a booking/, id);
    assert.equal(event.timezone, "Asia/Dubai", id);
    assert.equal(event.status, "scheduled", id);
    assert.equal(new URL(event.sourceUrl).hostname, sourceHost, id);
    assert.match(event.verifiedAt, /^2026-09-28T/, id);
    assert.ok(Date.parse(event.endsAt) > Date.parse(event.startsAt), id);
    assert.ok(Date.parse(event.verifiedUntil) >= Date.parse(event.endsAt), id);
    assert.match(event.startsAt, /\+04:00$/, id);
    assert.match(event.endsAt, /\+04:00$/, id);
    if (id !== "oo-la-date-night-challenge-2026-11-20") {
      assert.equal(event.startsAt, `${startDate}T00:00:00+04:00`, id);
      assert.equal(event.endsAt, `${endDateExclusive}T00:00:00+04:00`, id);
    }
    const canonical = curation.places.find(candidate => candidate.id === venueId);
    assert.deepEqual(event, canonical.events.find(candidate => candidate.id === id), id);
    assert.equal(payload.places.filter(candidate => candidate.placeId === place.placeId).length, 1, venueId);
    assert.ok(activeEventsFor(place, Date.parse("2026-09-28T12:00:00+04:00")).some(candidate => candidate.id === id), id);
    assert.ok(!activeEventsFor(place, Date.parse(event.endsAt)).some(candidate => candidate.id === id), `${id}: exact end must expire`);
  }
});

test("expanded exhibitions export includes eight new art shows and the corrected library display, not performances", () => {
  const expected = [...carouselEventIds,
    ...researchEvents.filter(([, venue]) => !["dubai-opera-events", "oo-la-lab-d3"].includes(venue)).map(([id]) => id),
    "library-circles-rend-beiruti-2026",
  ];
  assert.equal(expected.length, 14);
  assert.deepEqual(entries.map(({event}) => event.id).sort(), expected.sort());
  const ics = exhibitionsCalendar(payload.places, now);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, expected.length);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, expected.length * 2);
  assert.ok(ics.split("\r\n").every(line => Buffer.byteLength(line) <= 75));
  for (const {event} of entries) {
    assert.ok(unfolded.includes(`UID:${event.id}@nsso.me`), event.id);
    assert.ok(unfolded.includes(`DTSTART;VALUE=DATE:${event.calendar.startDate.replaceAll("-", "")}`), event.id);
    assert.ok(unfolded.includes(`DTEND;VALUE=DATE:${event.calendar.endDateExclusive.replaceAll("-", "")}`), event.id);
  }
  for (const id of ["titize-venetian-dream-2026", "swan-lake-on-ice-2027", "oo-la-date-night-challenge-2026-11-20"]) {
    assert.ok(!unfolded.includes(`UID:${id}@nsso.me`), `${id} is not an art exhibition`);
  }
});

test("Library Circles advertises the ongoing display, not the finished September tour", () => {
  const event = entries.find(({event}) => event.id === "library-circles-rend-beiruti-2026").event;
  assert.deepEqual(event.calendar, { startDate: "2026-09-16", endDateExclusive: "2027-01-12" });
  assert.equal(event.endsAt, "2027-01-12T00:00:00+04:00");
  assert.match(event.description, /research display/i);
  assert.match(event.description, /baqala/i);
  assert.doesNotMatch(event.description + event.dateLabel, /guided tour|19 Sep|3pm/i);
  assert.match(event.visitNote, /19 September guided tour has finished/);
  assert.equal(event.bookingUrl, null);
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
