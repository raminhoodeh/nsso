import type { DubaiEvent, DubaiPlace, PlaceCategory } from "../data/places-dubai";

export type ExperienceId =
  | "eat-drink"
  | "arts-culture"
  | "outdoors"
  | "activities"
  | "unwind"
  | "whats-on";

export type ExperienceSubcategory = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category?: PlaceCategory;
};

export type Experience = {
  readonly id: ExperienceId;
  readonly label: string;
  readonly description: string;
  readonly color: string;
  readonly subcategories: readonly ExperienceSubcategory[];
};

export const EXPERIENCES: readonly Experience[] = [
  {
    id: "eat-drink", label: "Eat & drink", color: "#d46643",
    description: "Find a table, a coffee stop or something sweet.",
    subcategories: [
      { id: "cafes", label: "Cafés & coffee", description: "Coffee shops, tea stops and cafés." },
      { id: "bakeries", label: "Bakeries & sweets", description: "Bakes, pastries and dessert stops." },
      { id: "restaurants", label: "Restaurants", description: "Places to sit down for a meal." },
    ],
  },
  {
    id: "arts-culture", label: "Art & culture", color: "#865b8e",
    description: "Explore art, stories, books and local heritage.",
    subcategories: [
      { id: "museums", label: "Museums", description: "Collections, discoveries and immersive museums." },
      { id: "galleries", label: "Galleries & art spaces", description: "Art galleries, studios and cultural spaces." },
      { id: "libraries", label: "Libraries & reading", description: "Libraries and book cafés to browse together." },
      { id: "heritage", label: "History & heritage", description: "Historic neighbourhoods and local stories." },
    ],
  },
  {
    id: "outdoors", label: "Get outdoors", color: "#4f7955",
    description: "Make time for greenery, water and open skies.",
    subcategories: [
      { id: "parks", label: "Parks & nature", description: "Gardens, parks, farms and nature reserves." },
      { id: "water", label: "Beaches & water", description: "Beaches, islands and waterside adventures.", category: "beach-water" },
      { id: "mountains", label: "Mountains & hiking", description: "Mountain viewpoints, trails and wadis.", category: "mountain-hiking" },
      { id: "stargazing", label: "Stargazing", description: "Places chosen for a night under the stars." },
    ],
  },
  {
    id: "activities", label: "Do something together", color: "#b97a36",
    description: "Make, play, explore or catch a show together.",
    subcategories: [
      { id: "workshops", label: "Creative workshops", description: "Studios and places offering creative sessions.", category: "creative-workshop" },
      { id: "games-active", label: "Games & getting active", description: "Board games, sports and active outings." },
      { id: "shows", label: "Shows & immersive", description: "Cinemas, performance venues and immersive experiences.", category: "shows-immersive" },
      { id: "strolls", label: "Strolls & shopping", description: "Neighbourhood walks, markets and browsing.", category: "shopping-stroll" },
    ],
  },
  {
    id: "unwind", label: "Relax & unwind", color: "#668078",
    description: "Find a spa, a wellness session or a beach-club escape.",
    subcategories: [
      { id: "wellness", label: "Spas & wellness", description: "Spas, yoga and wellness spaces.", category: "wellness" },
      { id: "beach-clubs", label: "Resorts & beach clubs", description: "Resorts and beach clubs for a slower day.", category: "resort-beach-club" },
    ],
  },
  {
    id: "whats-on", label: "What's on", color: "#b85270",
    description: "Explore dated events and upcoming exhibitions.",
    subcategories: [
      { id: "art-exhibitions", label: "Art exhibitions", description: "Dated art exhibitions, fairs and festivals.", category: "art-exhibitions" },
      { id: "live-shows", label: "Live shows", description: "Upcoming performances, music and comedy." },
      { id: "other-events", label: "More events", description: "Other dated happenings and programmes." },
    ],
  },
];

const PARENT_CATEGORIES: Record<Exclude<ExperienceId, "whats-on">, readonly PlaceCategory[]> = {
  "eat-drink": ["food-drink"],
  "arts-culture": ["arts-culture-heritage", "art-exhibitions"],
  outdoors: ["nature-wildlife", "beach-water", "mountain-hiking"],
  activities: ["creative-workshop", "sport-active", "shows-immersive", "shopping-stroll", "family-animals", "events-activities", "date-ideas"],
  unwind: ["wellness", "resort-beach-club"],
};

function hasCategory(place: DubaiPlace, category: PlaceCategory) {
  return place.taxonomy.primary === category || place.taxonomy.tags.includes(category);
}

function hasType(place: DubaiPlace, pattern: RegExp) {
  return [place.primaryGoogleType, ...place.googleTypes].some((type) => type !== null && pattern.test(type));
}

// Names and aliases identify the venue. Descriptions and addresses can mention
// nearby attractions or things a place is explicitly not, so do not classify by them.
function named(place: DubaiPlace, pattern: RegExp) {
  return [place.name, ...place.aliases].some((name) => pattern.test(
    name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  ));
}

// These exceptions are backed by the existing curated records and their sources.
// Fiker is a Google research_institute; Pages is a book cafe; Al Quaa is a
// tourist_attraction. None of those generic types describes the intended visit.
const READING_PLACES = new Set(["fiker-institute-library", "pages-cafe", "lecole-jewelry-arts-dubai"]);
// Official venue programmes identify these art spaces despite generic Google types.
const ART_SPACES = new Set(["dom-art-projects", "lecole-jewelry-arts-dubai"]);
const STARGAZING_PLACES = new Set(["al-quaa-milky-way-spot"]);
const BOARD_GAME_PLACES = new Set(["kefi-books-board-games-cafe"]);
const HERITAGE_PLACES = new Set([
  "al-ain-oasis", "al-seef", "al-shindagha-museum", "etihad-museum",
  "al-madam-ghost-village", "mleiha-archaeological-centre", "suwaidi-pearls",
]);

function matchesPlaceSubcategory(place: DubaiPlace, subcategoryId: string) {
  switch (subcategoryId) {
    case "cafes":
      return hasType(place, /^(?:cafe|coffee_shop|coffee_roastery|tea_house|cat_cafe)$/)
        || named(place, /\b(?:cafe|coffee|roastery|tea house)\b/);
    case "bakeries":
      return hasType(place, /^(?:bakery|bagel_shop|cake_shop|dessert_shop|dessert_restaurant|confectionery|chocolate_shop|candy_store|ice_cream_shop)$/)
        || named(place, /\b(?:bakery|bakers|patisserie|knafeh|kunafa)\b/);
    case "restaurants":
      return hasType(place, /^(?:restaurant|.+_restaurant|deli|sandwich_shop|steak_house)$/)
        || named(place, /\b(?:restaurant|dining)\b/);
    case "museums":
      return hasType(place, /^(?:museum|art_museum)$/) || named(place, /\bmuseum\b/);
    case "galleries":
      return hasType(place, /^(?:art_gallery|art_studio|art_museum)$/)
        || ART_SPACES.has(place.id)
        || named(place, /\b(?:gallery|galleries|arts? cent(?:re|er))\b/)
        || place.id === "cabinet-of-curiosity";
    case "libraries":
      return hasType(place, /^library$/) || READING_PLACES.has(place.id)
        || named(place, /\b(?:library|libraries|book cafe)\b/);
    case "heritage":
      return HERITAGE_PLACES.has(place.id)
        || ["smccu-al-fahidi", "crossroads-of-civilizations-museum", "xva-gallery-cafe"].includes(place.id)
        || hasType(place, /^(?:historical_landmark|historical_place|heritage_museum)$/)
        || named(place, /\b(?:heritage|archaeological|historic|historical|souk|souq)\b/);
    case "parks":
      return hasType(place, /^(?:park|national_park|nature_preserve|garden|botanical_garden|wildlife_park|zoo|farm)$/)
        || (place.taxonomy.primary === "nature-wildlife"
          && named(place, /\b(?:oasis|wetland|mangrove|gardens?|nature reserve)\b/));
    case "water":
      return place.taxonomy.primary === "beach-water"
        || hasType(place, /^(?:beach|island|water_park|marina)$/)
        || (place.taxonomy.primary !== "food-drink" && hasCategory(place, "beach-water")
          && named(place, /\b(?:beach|mangrove|dam|dive|waterpark|water park)\b/));
    case "mountains":
      return place.taxonomy.primary === "mountain-hiking"
        || hasType(place, /^(?:hiking_area|mountain_peak)$/);
    case "stargazing":
      return STARGAZING_PLACES.has(place.id) || hasType(place, /^observatory$/)
        || named(place, /\b(?:stargazing|milky way|observatory)\b/);
    case "workshops":
      return hasCategory(place, "creative-workshop");
    case "games-active":
      return hasCategory(place, "sport-active") || BOARD_GAME_PLACES.has(place.id)
        || hasType(place, /^(?:bowling_alley|amusement_center|amusement_park|video_arcade|sports_complex|adventure_sports_center)$/)
        || named(place, /\b(?:board ?games?|escape room|bowling)\b/);
    case "shows":
      return hasCategory(place, "shows-immersive");
    case "strolls":
      return hasCategory(place, "shopping-stroll");
    case "wellness":
      return place.taxonomy.primary === "wellness"
        || hasType(place, /^(?:spa|massage_spa|wellness_center|yoga_studio)$/);
    case "beach-clubs":
      return place.taxonomy.primary === "resort-beach-club"
        || hasType(place, /^resort_hotel$/) || named(place, /\bbeach club\b/);
    default:
      return false;
  }
}

/**
 * Pass the result of activeEventsFor(place, now) as events. This function does
 * not read place.events or the wall clock: the existing expiry/verification
 * rules remain the single source of truth for What's on, including SSR.
 */
export function matchesExperience(
  place: DubaiPlace,
  events: DubaiEvent[],
  experienceId: ExperienceId,
  subcategoryId?: string | null,
): boolean {
  const experience = EXPERIENCES.find((entry) => entry.id === experienceId);
  if (!experience || (subcategoryId && !experience.subcategories.some((entry) => entry.id === subcategoryId))) return false;

  if (experienceId === "whats-on") {
    if (!subcategoryId) return events.length > 0;
    return events.some((event) => {
      if (subcategoryId === "art-exhibitions") return event.taxonomyTags.includes("art-exhibitions");
      if (subcategoryId === "live-shows") return event.taxonomyTags.includes("shows-immersive");
      return !event.taxonomyTags.includes("art-exhibitions") && !event.taxonomyTags.includes("shows-immersive");
    });
  }

  const inParent = PARENT_CATEGORIES[experienceId].some((category) => hasCategory(place, category))
    || (experienceId === "activities" && BOARD_GAME_PLACES.has(place.id));
  return inParent && (!subcategoryId || matchesPlaceSubcategory(place, subcategoryId));
}
