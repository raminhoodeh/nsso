import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EXPERIENCES, matchesExperience } from "../src/lib/places-experiences.ts";
import { activeEventsFor } from "../src/lib/places-events.ts";

const { places } = JSON.parse(fs.readFileSync(new URL("../src/data/places-dubai.generated.json", import.meta.url)));
const now = Date.parse("2026-09-28T12:00:00+04:00");
const byId = (id) => {
  const place = places.find((entry) => entry.id === id);
  assert.ok(place, `Missing fixture ${id}`);
  return place;
};
const matches = (id, experience, subcategory) => {
  const place = byId(id);
  return matchesExperience(place, activeEventsFor(place, now), experience, subcategory);
};

test("six experiences use stable IDs and globally unique refinements", () => {
  assert.deepEqual(EXPERIENCES.map(({ id, label }) => [id, label]), [
    ["eat-drink", "Eat & drink"], ["arts-culture", "Art & culture"],
    ["outdoors", "Get outdoors"], ["activities", "Do something together"],
    ["unwind", "Relax & unwind"], ["whats-on", "What's on"],
  ]);
  const ids = EXPERIENCES.flatMap((experience) => experience.subcategories.map(({ id }) => id));
  assert.equal(new Set(ids).size, ids.length);
  for (const experience of EXPERIENCES) {
    assert.ok(experience.description && experience.color && experience.subcategories.length);
    assert.ok(experience.subcategories.every(({ label, description }) => label && description));
  }
  assert.equal(EXPERIENCES.find(({ id }) => id === "whats-on")
    .subcategories.find(({ id }) => id === "art-exhibitions").category, "art-exhibitions");
});

test("every saved place stays reachable even without any active events", () => {
  for (const place of places) {
    assert.ok(EXPERIENCES.some(({ id }) => matchesExperience(place, [], id)), place.id);
  }
});

test("parents include their refinements and count a place once despite overlapping tags", () => {
  for (const experience of EXPERIENCES) {
    const members = places.filter((place) => matchesExperience(place, activeEventsFor(place, now), experience.id));
    assert.equal(members.length, new Set(members.map(({ id }) => id)).size, experience.id);
    for (const child of experience.subcategories) {
      const childMembers = places.filter((place) => matchesExperience(place, activeEventsFor(place, now), experience.id, child.id));
      assert.ok(childMembers.length > 0, `${experience.id}/${child.id} needs a meaningful selection`);
      assert.ok(childMembers.length < members.length, `${experience.id}/${child.id} should refine the parent`);
      assert.ok(childMembers.every((place) => members.some(({ id }) => id === place.id)));
    }
  }
  const cafe = byId("artisan-bakers-jumeirah");
  assert.ok(matchesExperience(cafe, [], "eat-drink", "cafes"));
  assert.ok(matchesExperience(cafe, [], "eat-drink", "bakeries"));
  assert.equal(places.filter((place) => place.id === cafe.id && matchesExperience(place, [], "eat-drink")).length, 1);
});

test("recent curated pins have useful refinements", () => {
  for (const id of ["ethr-al-ain-oasis", "legacy-cafe-dibba-mountain-park", "ashjar-cafe-ras-al-khaimah"]) {
    assert.ok(matches(id, "eat-drink", "cafes"), id);
  }
  assert.ok(matches("montys-emirates-hills", "eat-drink", "restaurants"));
  assert.ok(matches("knafeh-omar-odali-cactus-park", "eat-drink", "bakeries"));
  assert.ok(matches("emirates-national-auto-museum", "arts-culture", "museums"));
  assert.ok(matches("dubai-hills-cycling-start", "activities", "games-active"));
  assert.ok(matches("al-mamzar-cycling-finish", "activities", "games-active"));
  assert.ok(matches("al-quaa-milky-way-spot", "outdoors", "stargazing"));
  assert.ok(matches("fiker-institute-library", "arts-culture", "libraries"));
  assert.ok(matches("pages-cafe", "arts-culture", "libraries"));
  assert.ok(matches("kefi-books-board-games-cafe", "activities", "games-active"));
});

test("subtypes use venue evidence instead of nearby words or broad source tags", () => {
  assert.equal(matches("wild-wadi-water-park", "outdoors", "mountains"), false);
  assert.equal(matches("yaazar-cafe", "outdoors", "mountains"), false);
  assert.equal(matches("arte-museum-dubai", "outdoors", "water"), false);
  assert.equal(matches("al-madam-ghost-village", "outdoors", "water"), false);
  assert.equal(matches("tino-mercato-beach", "outdoors", "water"), false);
  assert.equal(matches("better-al-wasl", "unwind", "wellness"), false);
  assert.equal(matches("wawa-dining", "unwind", "beach-clubs"), false);
  const ordinaryCafe = { ...byId("ethr-al-ain-oasis"),
    description: "Near a library, bakery and observatory; not a restaurant.",
    address: "Museum Road, Beach Park", taxonomy: { primary: "food-drink", tags: ["food-drink", "arts-culture-heritage", "nature-wildlife"] },
  };
  assert.equal(matchesExperience(ordinaryCafe, [], "arts-culture", "libraries"), false);
  assert.equal(matchesExperience(ordinaryCafe, [], "outdoors", "stargazing"), false);
  assert.equal(matchesExperience(ordinaryCafe, [], "eat-drink", "bakeries"), false);
  assert.equal(matchesExperience(ordinaryCafe, [], "eat-drink", "restaurants"), false);
});

test("What's on only uses supplied active dated events, never permanent series tags", () => {
  const series = byId("iykyk-at-salvaje-dubai");
  assert.ok(matchesExperience(series, [], "activities"));
  assert.equal(matchesExperience(series, [], "whats-on"), false);
  const venue = byId("dubai-design-district-events");
  assert.ok(venue.events.length > 1);
  assert.equal(matchesExperience(venue, [], "whats-on"), false);
  assert.equal(matchesExperience(venue, [], "whats-on", "art-exhibitions"), false);
  assert.ok(matchesExperience(venue, activeEventsFor(venue, now), "whats-on", "art-exhibitions"));
  assert.equal(matchesExperience(venue, activeEventsFor(venue, Date.parse("2027-02-01")), "whats-on"), false);
  assert.equal(matchesExperience(venue, activeEventsFor(venue, null), "whats-on"), false);
});

test("event cancellation, sold-out, expiry and verification rules pass through from activeEventsFor", () => {
  const place = byId("dubai-design-district-events");
  const event = place.events[0];
  for (const patch of [
    { status: "cancelled" }, { status: "sold-out" },
    { endsAt: "2020-01-01" }, { verifiedUntil: "2020-01-01" }, { endsAt: "invalid" },
  ]) {
    const changed = { ...place, events: [{ ...event, ...patch }] };
    assert.equal(matchesExperience(changed, activeEventsFor(changed, now), "whats-on"), false);
  }
  assert.ok(matches("dubai-opera-events", "whats-on", "live-shows"));
  assert.ok(matches("jameel-arts-centre", "whats-on", "art-exhibitions"));
  assert.equal(matches("jameel-arts-centre", "whats-on", "other-events"), false);
  assert.ok(matches("oo-la-lab-d3", "whats-on", "other-events"));
});

test("new cultural and workshop venues are reachable through meaningful refinements", () => {
  for (const id of ["lecole-jewelry-arts-dubai", "oo-la-lab-d3", "yadawei-pottery-studio", "tashkeel-makerspace", "tashkeel-nad-al-sheba"]) {
    assert.ok(matches(id, "activities", "workshops"), id);
  }
  for (const id of ["green-art-gallery", "the-third-line", "lawrie-shabibi", "tabari-artspace", "dom-art-projects", "xva-gallery-cafe"]) {
    assert.ok(matches(id, "arts-culture", "galleries"), id);
  }
  assert.ok(matches("lecole-jewelry-arts-dubai", "arts-culture", "libraries"));
  assert.ok(matches("house-of-wisdom-sharjah", "arts-culture", "libraries"));
  assert.ok(matches("crossroads-of-civilizations-museum", "arts-culture", "museums"));
  assert.ok(matches("smccu-al-fahidi", "arts-culture", "heritage"));
  assert.ok(matches("rain-room-sharjah", "activities", "shows"));
});

test("editorial classification exceptions do not mislabel arbitrary schools or art spaces", () => {
  for (const [id, refinement] of [["lecole-jewelry-arts-dubai", "libraries"], ["dom-art-projects", "galleries"], ["smccu-al-fahidi", "heritage"]]) {
    const source = byId(id);
    assert.ok(matchesExperience(source, [], "arts-culture", refinement), id);
    const unrelated = { ...source, id: "unrelated-venue", name: "Unrelated venue", aliases: [], googleTypes: [], primaryGoogleType: null };
    assert.equal(matchesExperience(unrelated, [], "arts-culture", refinement), false, `${id}: evidence must not leak to arbitrary places`);
  }
});

test("unknown refinements and children under the wrong parent never expand results", () => {
  const place = byId("ethr-al-ain-oasis");
  assert.equal(matchesExperience(place, [], "eat-drink", "missing"), false);
  assert.equal(matchesExperience(place, [], "arts-culture", "cafes"), false);
  assert.equal(matchesExperience(place, [], "missing"), false);
  assert.equal(matchesExperience(place, [], "eat-drink", null), true);
});
