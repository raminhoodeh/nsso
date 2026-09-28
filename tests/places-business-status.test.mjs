import test from "node:test";
import assert from "node:assert/strict";
import { placeClosureNotice, surpriseCandidates } from "../src/lib/places-business-status.ts";

const place = (id, businessStatus, matchedAt = "2026-09-28T09:00:00Z") => ({
  id, resolution: { businessStatus, matchedAt },
});
const googleSource = { sourceLabel: "Google listing snapshot", note: null, sourceUrl: null };

test("closure notices distinguish temporary and permanent Google listing snapshots", () => {
  assert.deepEqual(placeClosureNotice(place("seasonal", "CLOSED_TEMPORARILY")), {
    label: "Reported temporarily closed", checkedDate: "28 Sept 2026", ...googleSource,
  });
  assert.deepEqual(placeClosureNotice(place("closed", "CLOSED_PERMANENTLY")), {
    label: "Reported closed", checkedDate: "28 Sept 2026", ...googleSource,
  });
});

test("snapshot date uses Dubai's date rather than the browser's timezone", () => {
  assert.equal(placeClosureNotice(place("seasonal", "CLOSED_TEMPORARILY", "2026-09-30T21:00:00Z")).checkedDate, "1 Oct 2026");
});

test("invalid and missing snapshot dates retain the warning without inventing a date", () => {
  for (const matchedAt of ["not-a-date", "", null]) {
    assert.deepEqual(placeClosureNotice(place("closed", "CLOSED_PERMANENTLY", matchedAt)), {
      label: "Reported closed", checkedDate: null, ...googleSource,
    });
  }
});

test("operational, absent and unknown business statuses do not claim closure or live opening", () => {
  for (const status of ["OPERATIONAL", null, undefined, "BUSINESS_STATUS_UNSPECIFIED", "UNKNOWN"]) {
    assert.equal(placeClosureNotice(place("venue", status)), null);
  }
});

test("Surprise us excludes both kinds of reported closure and the current selection", () => {
  const choices = [place("temporary", "CLOSED_TEMPORARILY"), place("open", "OPERATIONAL"),
    place("permanent", "CLOSED_PERMANENTLY"), place("other", "OPERATIONAL")];
  assert.deepEqual(surpriseCandidates(choices, "open").map(item => item.id), ["other"]);
  assert.equal(choices.length, 4, "the browsable source collection is unchanged");
});

test("a single eligible venue can repeat but does not fall back to a closed alternative", () => {
  const eligible = place("open", "OPERATIONAL");
  assert.deepEqual(surpriseCandidates([eligible, place("closed", "CLOSED_PERMANENTLY")], "open"), [eligible]);
});

test("all-closed and empty selections return no random recommendation", () => {
  const choices = [place("seasonal", "CLOSED_TEMPORARILY"), place("closed", "CLOSED_PERMANENTLY")];
  assert.deepEqual(surpriseCandidates(choices, null), []);
  assert.deepEqual(surpriseCandidates(choices, "seasonal"), []);
  assert.deepEqual(surpriseCandidates([], null), []);
});

test("unknown statuses remain eligible without asserting that the venue is currently open", () => {
  const unknown = place("unknown", null);
  assert.deepEqual(surpriseCandidates([unknown, place("closed", "CLOSED_TEMPORARILY")], null), [unknown]);
});

const seasonalPlace = {
  ...place("seasonal-unconfirmed", null),
  visitStatus: {
    kind: "season-unconfirmed", checkedAt: "2026-09-30T21:00:00Z",
    note: "A historical seasonal site; confirm this year's reopening before travelling.",
    sourceUrl: "https://example.com/official-seasonal-site",
  },
};

test("unconfirmed seasonal status cites its official-source check rather than Google", () => {
  assert.deepEqual(placeClosureNotice(seasonalPlace), {
    label: "Seasonal reopening unconfirmed", checkedDate: "1 Oct 2026",
    sourceLabel: "Official-source check", note: seasonalPlace.visitStatus.note,
    sourceUrl: seasonalPlace.visitStatus.sourceUrl,
  });
  assert.equal(placeClosureNotice({ ...seasonalPlace, visitStatus: { ...seasonalPlace.visitStatus, checkedAt: "invalid" } }).checkedDate, null);
});

test("unconfirmed seasonal venues stay out of Surprise us even without a Google closure flag", () => {
  const eligible = place("eligible", null);
  assert.deepEqual(surpriseCandidates([seasonalPlace], null), []);
  assert.deepEqual(surpriseCandidates([seasonalPlace, eligible], null), [eligible]);
});

test("an explicit Google closure keeps its own source and snapshot date if a seasonal note also exists", () => {
  assert.deepEqual(placeClosureNotice({ ...seasonalPlace, resolution: { ...seasonalPlace.resolution, businessStatus: "CLOSED_TEMPORARILY" } }), {
    label: "Reported temporarily closed", checkedDate: "28 Sept 2026", ...googleSource,
  });
});
