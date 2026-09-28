import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Next resolves extensionless local TypeScript imports. Mirror that narrowly
// when running these helpers directly with Node's built-in TypeScript support.
const helperUrl = new URL("../src/lib/places-agenda.ts", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === helperUrl.href && ["./places-events", "./places-experiences"].includes(specifier)) {
      return nextResolve(new URL(`${specifier}.ts`, helperUrl).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { agendaEntries, agendaVerifiedDate, agendaDateTile } = await import(helperUrl.href);
hooks.deregister();

const now = Date.parse("2026-09-28T18:00:00+04:00");
const event = (id, patch = {}) => ({
  id, title: id, description: "Official programme", startsAt: "2026-10-01T10:00:00+04:00",
  endsAt: "2026-10-01T23:00:00+04:00", timezone: "Asia/Dubai", status: "scheduled",
  bookingUrl: null, sourceUrl: "https://example.com/programme", verifiedAt: "2026-09-28T10:00:00+04:00",
  verifiedUntil: "2026-12-31T00:00:00+04:00", dateLabel: "1 October 2026",
  taxonomyTags: ["events-activities"], ...patch,
});
const place = events => ({ id: "test-venue", name: "Test venue", events });
const ids = (events, date = now, category = null, window = "all") => agendaEntries([place(events)], date, category, window).map(({ event }) => event.id);

test("agenda keeps individual events at one venue and sorts ongoing before upcoming dates", () => {
  const events = [event("next-week", { startsAt: "2026-10-06T10:00:00+04:00", endsAt: "2026-10-06T23:00:00+04:00" }),
    event("upcoming"), event("ongoing", { startsAt: "2026-09-01T10:00:00+04:00", endsAt: "2026-10-30T23:00:00+04:00" })];
  assert.deepEqual(ids(events), ["ongoing", "upcoming", "next-week"]);
  assert.equal(agendaEntries([place(events)], now).every(entry => entry.place.id === "test-venue"), true);
});

test("agenda subcategories follow the existing experience taxonomy, including overlaps", () => {
  const events = [event("art", { taxonomyTags: ["art-exhibitions"] }),
    event("show", { taxonomyTags: ["shows-immersive"] }),
    event("both", { taxonomyTags: ["art-exhibitions", "shows-immersive"] }), event("other")];
  assert.deepEqual(ids(events, now, "art-exhibitions"), ["art", "both"]);
  assert.deepEqual(ids(events, now, "live-shows"), ["both", "show"]);
  assert.deepEqual(ids(events, now, "other-events"), ["other"]);
  assert.deepEqual(ids(events, now, "missing"), []);
});

test("expired, stale, cancelled, sold-out and invalid events do not appear", () => {
  for (const patch of [{ status: "cancelled" }, { status: "sold-out" }, { endsAt: new Date(now).toISOString() },
    { verifiedUntil: new Date(now).toISOString() }, { endsAt: "invalid" }, { startsAt: "invalid" },
    { verifiedUntil: "invalid" }, { startsAt: "2026-10-02T00:00:00+04:00" }]) {
    assert.deepEqual(ids([event("invalid", patch)]), [], JSON.stringify(patch));
  }
  assert.deepEqual(ids([event("valid")], null), []);
  assert.deepEqual(ids([event("valid")], NaN), []);
  assert.deepEqual(ids([event("valid")], now, null, "not-a-window"), []);
});

test("This week includes seven Dubai calendar dates rather than 168 hours from now", () => {
  const events = [event("today", { startsAt: "2026-09-28T20:00:00+04:00", endsAt: "2026-09-28T23:00:00+04:00" }),
    event("seventh-day", { startsAt: "2026-10-04T23:59:59+04:00", endsAt: "2026-10-05T01:00:00+04:00" }),
    event("eighth-day", { startsAt: "2026-10-05T00:00:00+04:00", endsAt: "2026-10-05T01:00:00+04:00" })];
  assert.deepEqual(ids(events, now, null, "this-week"), ["today", "seventh-day"]);
});

test("Dubai midnight controls month boundaries even while it is still the previous UTC date", () => {
  const dubaiOctober = Date.parse("2026-09-30T20:30:00Z");
  const events = [event("ongoing", { startsAt: "2026-09-01T00:00:00+04:00", endsAt: "2026-10-03T00:00:00+04:00" }),
    event("month-end", { startsAt: "2026-10-31T23:59:59+04:00", endsAt: "2026-11-01T02:00:00+04:00" }),
    event("next-month", { startsAt: "2026-11-01T00:00:00+04:00", endsAt: "2026-11-02T00:00:00+04:00" })];
  assert.deepEqual(ids(events, dubaiOctober, null, "this-month"), ["ongoing", "month-end"]);
  assert.deepEqual(ids(events, now, null, "this-month"), ["ongoing"]);
});

test("Dubai week windows cross year boundaries and retain ongoing programmes", () => {
  const dubaiNewYear = Date.parse("2026-12-31T20:30:00Z");
  const events = [event("ongoing", { startsAt: "2026-12-15T00:00:00+04:00", endsAt: "2027-01-02T00:00:00+04:00", verifiedUntil: "2027-02-01T00:00:00+04:00" }),
    event("day-seven", { startsAt: "2027-01-07T23:00:00+04:00", endsAt: "2027-01-08T00:00:00+04:00", verifiedUntil: "2027-02-01T00:00:00+04:00" }),
    event("day-eight", { startsAt: "2027-01-08T00:00:00+04:00", endsAt: "2027-01-09T00:00:00+04:00", verifiedUntil: "2027-02-01T00:00:00+04:00" })];
  assert.deepEqual(ids(events, dubaiNewYear, null, "this-week"), ["ongoing", "day-seven"]);
});

test("display dates also use Dubai time and handle an invalid source-check date safely", () => {
  assert.equal(agendaVerifiedDate("2026-09-30T21:00:00Z"), "1 Oct 2026");
  assert.deepEqual(agendaDateTile("2026-09-30T21:00:00Z"), { day: "1", month: "Oct" });
  assert.equal(agendaVerifiedDate("invalid"), "Date unavailable");
  assert.deepEqual(agendaDateTile("invalid"), { day: "—", month: "Date" });
});
