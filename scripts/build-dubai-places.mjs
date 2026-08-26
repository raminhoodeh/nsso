import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse/sync";

const sourceFlag = process.argv.indexOf("--source");
const outputFlag = process.argv.indexOf("--output");
const curationFlag = process.argv.indexOf("--curation");
const asOfFlag = process.argv.indexOf("--as-of");
const sourcePath = sourceFlag >= 0
  ? path.resolve(process.argv[sourceFlag + 1])
  : path.resolve("../places to go/__PLACES TO GO 33a6fe2ecf3780ad8ae6d96a09ae854f.csv");
const outputPath = outputFlag >= 0
  ? path.resolve(process.argv[outputFlag + 1])
  : path.resolve("src/data/places-dubai.generated.json");
const curationPath = curationFlag >= 0
  ? path.resolve(process.argv[curationFlag + 1])
  : path.resolve("src/data/dubai-date-curation.json");
const cachePath = path.resolve(".places-geocode-cache.json");
const googleApiKey = process.env.GOOGLE_PLACES_ENRICHMENT_API_KEY;
const asOf = asOfFlag >= 0 ? process.argv[asOfFlag + 1] : new Date().toISOString();
const asOfMs = Date.parse(asOf);

if (!Number.isFinite(asOfMs)) {
  throw new Error(`Invalid --as-of value: ${asOf}`);
}

const ALIAS_GROUPS = new Map([
  ["arte-museum", "Arte Museum Dubai"],
  ["arte-museum-dubai", "Arte Museum Dubai"],
  ["al-seef", "Al Seef"],
  ["souk-al-seef", "Al Seef"],
  ["hanging-gardens-kalba", "Hanging Gardens in Kalba"],
  ["hanging-gardens-in-kalba", "Hanging Gardens in Kalba"],
  ["mazmi-cafe", "Mazmi Coffee & More"],
  ["mazmi-coffee-more", "Mazmi Coffee & More"],
  ["cat-cafe-vibrissae", "Cat Cafe Vibrissae - Dubai Creek Harbour"],
  ["cat-cafe-vibrissae-dubai-creek-harbour", "Cat Cafe Vibrissae - Dubai Creek Harbour"],
]);

const ALIAS_OVERRIDES = {
  "la-maison-laggar": ["La Maison x Laggar"],
  "kefi-books-board-games-cafe": ["Kefi Dubai", "Kefi Books, Boardgames and Specialty Coffee"],
  "seoul-spot": ["Seoul Spot Dubai"],
};

const QUERY_OVERRIDES = {
  "la-maison-laggar": "La Maison x Laggar, Palais LAGGAR, 7th Street, Za'abeel II, Dubai, UAE",
  "kefi-books-board-games-cafe": "Kefi Books Board Games Cafe, Tower 1, Al Mamzar, Dubai, UAE",
  "seoul-spot": "Seoul Spot, Silicon Central Mall, Dubai Silicon Oasis, Dubai, UAE",
  "bar-des-pres": "Bar des Pres, ICD Brookfield Place, DIFC, Dubai, UAE",
  "african-queen": "African Queen, J1 Beach, Jumeirah 1, Dubai, UAE",
  "sakhalin": "Sakhalin, J1 Beach, Jumeirah 1, Dubai, UAE",
  "siena": "Siena Restaurant, Gate Village Building 7, DIFC, Dubai, UAE",
  "birch": "Birch Restaurant, The Ritz-Carlton DIFC, Dubai, UAE",
  "maison-revka": "Maison Revka, Delano Dubai, Bluewaters Island, Dubai, UAE",
  "bkd-by-gemini": "BKD by Gemini, Al Safiya Park, Al Zorah, Ajman, UAE",
  "founder-sports-club": "Founder Sports Club, Dubai, UAE",
  "gooder": "Gooder restaurant, Dubai, UAE",
  "ona": "ONA restaurant, Dubai, UAE",
  "yesterday": "Yesterday restaurant, Dubai, UAE",
  "cherryhouse": "CherryHouse restaurant, Dubai, UAE",
  "apricot": "Apricot restaurant, Dubai, UAE",
  "ula": "Ula beach restaurant, Ras Al Khaimah, UAE",
  "mekong": "Mekong Anantara Mina Al Arab, Ras Al Khaimah, UAE",
  "bait-al-ahlam": "Bait Al Ahlam cafe, Dubai, UAE",
  "al-ghadf-garden": "Al Ghadf Garden, Ras Al Khaimah, UAE",
  "puppy-yoga-at-herinox-studios": "Herinox Studios, Dubai, UAE",
  "serpenti-beach-club": "Bvlgari Resort Dubai, Jumeira Bay Island, Dubai, UAE",
  "sunset-beach": "Umm Suqeim Sunset Beach, Dubai, UAE",
  "the-jury-experience-the-deadly-boat-ride": "Dubai Knowledge Park Conference Centre Auditorium, Block 2B, Dubai, UAE",
};

const PLACE_ID_OVERRIDES = {
  "la-maison-laggar": "ChIJnVLpYURDXz4R7hmR4xXwps8",
  "kefi-books-board-games-cafe": "ChIJZ7sLXuRdXz4RjnancgL14V8",
  "seoul-spot": "ChIJJaoM7vplXz4R8Imid0qsfZs",
  "bar-des-pres": "ChIJO99024RDXz4ROeOXlO9r1Nw",
  "african-queen": "ChIJNxOhXp9DXz4R7g6wKFRDvoU",
  "sakhalin": "ChIJT9GYCg5DXz4RKg24uryt96k",
  "siena": "ChIJ6erW87BDXz4RJse67LY6Qdw",
  "birch": "ChIJrYEcdixDXz4Rb2ixZc7wp18",
  "maison-revka": "ChIJWzLbKUEVXz4RLztzPfLDWjI",
};

const RESOLUTION_OVERRIDES = {
  "al-ghadf-garden": {
    address: "Al Sagel Road, 8 District, Ras Al Khaimah",
    coordinates: { lat: 25.283293, lng: 56.174277 },
    placeId: null,
    matchedName: "Al Gadf Garden",
    resolutionSource: "source-yango-2gis-crosscheck",
    resolutionStatus: "resolved",
    fetchedAt: "2026-08-22T13:04:30.901Z",
  },
  "founder-sports-club": {
    address: "Dubai meetup location shared after matching",
    coordinates: { lat: 25.2048, lng: 55.2708 },
    placeId: null,
    matchedName: "Founder Sports Club by Art of Mondays",
    resolutionSource: "source-description",
    resolutionStatus: "non-fixed",
    fetchedAt: "2026-08-22T13:04:30.899Z",
  },
};

const SOURCE_URL_OVERRIDES = {
  "la-maison-laggar": [
    "https://www.instagram.com/p/DbYd1GPMeqo/",
    "https://laggar.ae/pages/stocklist",
  ],
  "kefi-books-board-games-cafe": "https://www.kefi.ae/",
  "seoul-spot": [
    "https://www.seoulspotuae.ae/",
    "https://www.seoulspotuae.ae/pages/experimental-booth",
    "https://www.seoulspotuae.ae/pages/faq",
  ],
  "bar-des-pres": "https://www.bardespres.com/dubai/",
  "african-queen": "https://africanqueen-restaurant.com/dubai/",
  "sakhalin": "https://sakhalin.rest/dubai/en",
  "siena": "https://siena-restaurants.com/dubai/",
  "birch": "https://birchrestaurants.com/",
  "maison-revka": "https://maisonrevka.com/dubai/",
  "serpenti-beach-club": "https://www.bulgarihotels.com/en_US/dubai/the-resort/serpenti-beach-club",
};

const RESOLUTION_PATCHES = {
  "sunset-beach": {
    address: "Sunset Beach (Umm Suqeim Beach), Umm Suqeim 3, Dubai",
    matchedName: "Sunset Beach / Umm Suqeim Beach",
  },
};

const EMIRATE_CENTERS = {
  "Abu Dhabi": { lat: 24.4539, lng: 54.3773 },
  Ajman: { lat: 25.4052, lng: 55.5136 },
  Dubai: { lat: 25.2048, lng: 55.2708 },
  Fujairah: { lat: 25.1288, lng: 56.3265 },
  "Ras Al Khaimah": { lat: 25.8007, lng: 55.9762 },
  Sharjah: { lat: 25.3463, lng: 55.4209 },
  "Umm Al Quwain": { lat: 25.5647, lng: 55.5552 },
};

const PRIMARY_OVERRIDES = {
  "la-maison-laggar": "food-drink",
  "kefi-books-board-games-cafe": "food-drink",
  "seoul-spot": "shows-immersive",
  "bar-des-pres": "food-drink",
  "african-queen": "food-drink",
  "sakhalin": "food-drink",
  "siena": "food-drink",
  "birch": "food-drink",
  "maison-revka": "food-drink",
  "al-ain-oasis": "nature-wildlife",
  "dalma-island": "beach-water",
  "emirates-bio-farm": "nature-wildlife",
  "jubail-mangrove-park": "nature-wildlife",
  "shuweihat-island": "beach-water",
  "al-zorah-nature-reserve": "nature-wildlife",
  "bkd-by-gemini": "food-drink",
  "al-seef": "shopping-stroll",
  "amongst-few-cafe": "food-drink",
  "apricot": "food-drink",
  "aquaventure-waterpark": "sport-active",
  "arte-museum-dubai": "arts-culture-heritage",
  "at-mosphere": "food-drink",
  "bait-al-ahlam": "food-drink",
  "barbari": "food-drink",
  "cabinet-of-curiosity": "arts-culture-heritage",
  "cat-cafe-vibrissae": "family-animals",
  "cat-cafe-vibrissae-dubai-creek-harbour": "family-animals",
  "cherryhouse": "food-drink",
  "city-walk": "shopping-stroll",
  "dalia-bagel-bar": "food-drink",
  "delano-dubai": "resort-beach-club",
  "dubai-pottery-studio": "creative-workshop",
  "fairmont-the-palm": "resort-beach-club",
  "founder-sports-club": "sport-active",
  "gooder": "food-drink",
  "hatta-dam": "beach-water",
  "kite-beach": "beach-water",
  "la-mer-beach": "beach-water",
  "maison-terrae": "food-drink",
  "marsa-al-arab-boulevard": "shopping-stroll",
  "mazmi-coffee-more": "food-drink",
  "mohammed-bin-rashid-library": "arts-culture-heritage",
  "ona": "food-drink",
  "port-de-la-mer": "shopping-stroll",
  "puppy-yoga-at-herinox-studios": "wellness",
  "ramen-hisa": "food-drink",
  "saltzen-spa": "wellness",
  "samadhi-wellness": "wellness",
  "serpenti-beach-club": "resort-beach-club",
  "seva-experience": "wellness",
  "souk-murjan": "shopping-stroll",
  "soul-senses-spa-wellness": "wellness",
  "subko": "food-drink",
  "sunset-beach": "beach-water",
  "the-courtyard-playhouse": "shows-immersive",
  "the-jury-experience-the-deadly-boat-ride": "shows-immersive",
  "treasure-pots": "creative-workshop",
  "wawa-dining": "food-drink",
  "wild-wadi-water-park": "sport-active",
  "yaazar-cafe": "food-drink",
  "yesterday": "food-drink",
  "al-dahir-trail": "mountain-hiking",
  "snoopy-island": "beach-water",
  "wadi-abadilah": "mountain-hiking",
  "wadi-al-milh": "mountain-hiking",
  "al-ghadf-garden": "nature-wildlife",
  "jebel-jais": "mountain-hiking",
  "mekong": "food-drink",
  "movenpick-resort-al-marjan-island": "resort-beach-club",
  "suwaidi-pearls": "arts-culture-heritage",
  "ula": "food-drink",
  "al-madam-ghost-village": "arts-culture-heritage",
  "al-noor-island": "nature-wildlife",
  "al-rafisah-dam": "beach-water",
  "hanging-gardens-in-kalba": "nature-wildlife",
  "khor-kalba-mangrove-centre": "nature-wildlife",
  "khorfakkan-beach": "beach-water",
  "mleiha-archaeological-centre": "arts-culture-heritage",
  "wasit-wetland-centre": "nature-wildlife",
  "casa-mikoko": "resort-beach-club",
  "mangrove-beach": "beach-water",
};

const TAG_OVERRIDES = {
  "la-maison-laggar": ["food-drink"],
  "kefi-books-board-games-cafe": ["food-drink", "arts-culture-heritage"],
  "seoul-spot": ["shows-immersive", "shopping-stroll"],
  "bar-des-pres": ["food-drink"],
  "african-queen": ["food-drink", "beach-water", "resort-beach-club"],
  "sakhalin": ["food-drink", "beach-water", "resort-beach-club"],
  "siena": ["food-drink"],
  "birch": ["food-drink"],
  "maison-revka": ["food-drink", "resort-beach-club"],
};

function normalize(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-and-/g, "-");
}

function cleanUrl(value = "") {
  const markdownMatch = value.match(/\]\((https?:\/\/[^)]+)\)$/);
  const candidate = markdownMatch?.[1] || value.trim();
  if (!candidate.startsWith("http")) return null;
  try {
    const url = new URL(candidate);
    ["fbclid", "igsh", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return candidate;
  }
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const EVENT_STATUSES = new Set(["scheduled", "sold-out", "cancelled"]);
const PLACE_CATEGORIES = new Set([
  "food-drink",
  "nature-wildlife",
  "beach-water",
  "mountain-hiking",
  "arts-culture-heritage",
  "shows-immersive",
  "creative-workshop",
  "wellness",
  "resort-beach-club",
  "sport-active",
  "shopping-stroll",
  "family-animals",
  "events-activities",
  "date-ideas",
]);

function requireHttpsUrl(value, field) {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`${field} must be an HTTPS URL`);
  }
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${field} is not a valid URL`);
  }
}

function requireIsoDateTime(value, field) {
  if (typeof value !== "string" || !ISO_DATE_TIME.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be an ISO 8601 date-time with a timezone`);
  }
  return value;
}

function validateCuratedData(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.places)) {
    throw new Error("Curated data must have version 1 and a places array");
  }

  const placeIds = new Set();
  const eventIds = new Set();
  return payload.places.map((place, placeIndex) => {
    const label = `curation.places[${placeIndex}]`;
    if (!place || typeof place !== "object") throw new Error(`${label} must be an object`);
    for (const field of ["id", "name", "description", "locationHint", "placeId"]) {
      if (typeof place[field] !== "string" || !place[field].trim()) {
        throw new Error(`${label}.${field} is required`);
      }
    }
    if (normalize(place.id) !== place.id) throw new Error(`${label}.id must be normalized`);
    if (placeIds.has(place.id)) throw new Error(`Duplicate curated place id: ${place.id}`);
    placeIds.add(place.id);
    if (!Array.isArray(place.aliases) || !place.aliases.every((value) => typeof value === "string" && value.trim())) {
      throw new Error(`${label}.aliases must be an array of non-empty strings`);
    }
    if (!Array.isArray(place.sourceUrls) || !place.sourceUrls.length) {
      throw new Error(`${label}.sourceUrls must contain at least one official source`);
    }
    const sourceUrls = place.sourceUrls.map((url, index) => requireHttpsUrl(url, `${label}.sourceUrls[${index}]`));
    if (!place.taxonomy || typeof place.taxonomy.primary !== "string" || !Array.isArray(place.taxonomy.tags)) {
      throw new Error(`${label}.taxonomy must include primary and tags`);
    }
    if (!PLACE_CATEGORIES.has(place.taxonomy.primary) || !place.taxonomy.tags.every((tag) => PLACE_CATEGORIES.has(tag))) {
      throw new Error(`${label}.taxonomy contains an unknown category`);
    }
    if (!place.taxonomy.tags.includes(place.taxonomy.primary)) {
      throw new Error(`${label}.taxonomy.tags must include its primary category`);
    }
    const listingType = place.listingType || "place";
    if (!["place", "event-venue"].includes(listingType)) {
      throw new Error(`${label}.listingType must be place or event-venue`);
    }
    const events = (place.events || []).map((event, eventIndex) => {
      const eventLabel = `${label}.events[${eventIndex}]`;
      for (const field of ["id", "title", "description", "timezone", "dateLabel"]) {
        if (typeof event[field] !== "string" || !event[field].trim()) {
          throw new Error(`${eventLabel}.${field} is required`);
        }
      }
      if (eventIds.has(event.id)) throw new Error(`Duplicate curated event id: ${event.id}`);
      eventIds.add(event.id);
      if (event.timezone !== "Asia/Dubai") throw new Error(`${eventLabel}.timezone must be Asia/Dubai`);
      if (!EVENT_STATUSES.has(event.status)) throw new Error(`${eventLabel}.status is invalid`);
      const startsAt = requireIsoDateTime(event.startsAt, `${eventLabel}.startsAt`);
      const endsAt = requireIsoDateTime(event.endsAt, `${eventLabel}.endsAt`);
      const verifiedAt = requireIsoDateTime(event.verifiedAt, `${eventLabel}.verifiedAt`);
      const verifiedUntil = requireIsoDateTime(event.verifiedUntil, `${eventLabel}.verifiedUntil`);
      if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error(`${eventLabel}.endsAt must be after startsAt`);
      if (Date.parse(verifiedUntil) < Date.parse(verifiedAt)) throw new Error(`${eventLabel}.verifiedUntil must not precede verifiedAt`);
      if (!Array.isArray(event.taxonomyTags) || !event.taxonomyTags.length) {
        throw new Error(`${eventLabel}.taxonomyTags must not be empty`);
      }
      if (!event.taxonomyTags.every((tag) => PLACE_CATEGORIES.has(tag))) {
        throw new Error(`${eventLabel}.taxonomyTags contains an unknown category`);
      }
      return {
        ...event,
        startsAt,
        endsAt,
        verifiedAt,
        verifiedUntil,
        bookingUrl: event.bookingUrl === null
          ? null
          : requireHttpsUrl(event.bookingUrl, `${eventLabel}.bookingUrl`),
        sourceUrl: requireHttpsUrl(event.sourceUrl, `${eventLabel}.sourceUrl`),
      };
    });
    if (listingType === "event-venue" && !events.length) {
      throw new Error(`${label} is an event venue but has no events`);
    }
    return {
      ...place,
      aliases: [...new Set(place.aliases)],
      sourceUrls: [...new Set(sourceUrls)],
      listingType,
      ...(events.length ? { events } : {}),
    };
  });
}

function isActiveEvent(event) {
  return event.status === "scheduled"
    && Date.parse(event.endsAt) > asOfMs
    && Date.parse(event.verifiedUntil) > asOfMs;
}

function inferEmirate(location, name) {
  if (/bkd/i.test(name)) return "Ajman";
  if (/\bdubai\b/i.test(location)) return "Dubai";
  if (/umm al quwain/i.test(location)) return "Umm Al Quwain";
  if (/ras al khaimah|al rams/i.test(location)) return "Ras Al Khaimah";
  if (/fujairah|al aqah/i.test(location)) return "Fujairah";
  if (/sharjah|kalba|khorfakkan|mleiha|al madam/i.test(location)) return "Sharjah";
  if (/abu dhabi|al ain|al dhafra|jubail island/i.test(location)) return "Abu Dhabi";
  if (/ajman/i.test(location)) return "Ajman";
  return "Dubai";
}

function taxonomy(id, name, description) {
  const text = `${name} ${description}`.toLowerCase();
  const tags = new Set();
  const add = (...values) => values.forEach((value) => tags.add(value));

  if (/beach|island|waterpark|water park|kayak|snork|diving|dam|mangrove|pearl/.test(text)) add("beach-water");
  if (/mangrove|oasis|farm|wadi|trail|mountain|jebel|wetland|garden|reserve|wildlife|desert|nature|island/.test(text)) add("nature-wildlife");
  if (/wadi|trail|hiking|mountain|jebel/.test(text)) add("mountain-hiking");
  if (/museum|library|heritage|archaeolog|souk|pottery|\bart\b|historic|pearl|ghost village|theatre|playhouse|curiosity/.test(text)) add("arts-culture-heritage");
  if (/jury|immersive|theatre|playhouse|\bshow\b/.test(text)) add("shows-immersive");
  if (/pottery|studio|workshop|playhouse/.test(text)) add("creative-workshop");
  if (/\bspa\b|wellness|yoga|meditation|holistic|seva|samadhi/.test(text)) add("wellness");
  if (/resort|hotel|beach club|fairmont|delano|movenpick|mövenpick/.test(text)) add("resort-beach-club");
  if (/sports club|waterpark|water park|kayak|yoga|trail|hiking|cycling|adventure/.test(text)) add("sport-active");
  if (/cafe|café|coffee|restaurant|dining|ramen|bagel|breakfast|brunch|food|cuisine|bakery|bkd|barbari|apricot|subko|gooder|cherryhouse|yesterday|ona\b|wawa|ula\b|mekong|bait al ahlam|maison terra/.test(text)) add("food-drink");
  if (/souk|city walk|boulevard|al seef|port de la mer/.test(text)) add("shopping-stroll");
  if (/cat cafe|puppy|waterpark|water park|family|animals|farm/.test(text)) add("family-animals");

  const primaryOrder = [
    "food-drink",
    "wellness",
    "shows-immersive",
    "creative-workshop",
    "arts-culture-heritage",
    "resort-beach-club",
    "mountain-hiking",
    "beach-water",
    "nature-wildlife",
    "sport-active",
    "shopping-stroll",
    "family-animals",
  ];

  const override = PRIMARY_OVERRIDES[id];
  const tagOverride = TAG_OVERRIDES[id];
  if (tagOverride) {
    return { primary: override || tagOverride[0], tags: tagOverride };
  }
  if (override) add(override);
  if (!tags.size) add("date-ideas");
  return { primary: override || primaryOrder.find((candidate) => tags.has(candidate)) || [...tags][0], tags: [...tags] };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function normalizeGooglePlace(candidate) {
  if (!candidate?.location) return null;
  return {
    address: candidate.formattedAddress,
    coordinates: { lat: candidate.location.latitude, lng: candidate.location.longitude },
    placeId: candidate.id,
    matchedName: candidate.displayName?.text || null,
    websiteUri: candidate.websiteUri || null,
    businessStatus: candidate.businessStatus || null,
    googleTypes: candidate.types || [],
    primaryGoogleType: candidate.primaryType || null,
    resolutionSource: "google-places-new",
    resolutionStatus: "resolved",
    fetchedAt: new Date().toISOString(),
  };
}

async function getGooglePlace(placeId) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": googleApiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,primaryType,businessStatus,websiteUri",
      Referer: process.env.GOOGLE_PLACES_REFERER || "http://localhost:3000/",
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Google Places returned ${response.status}`);
  return normalizeGooglePlace(body);
}

async function searchGoogle(query) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleApiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.businessStatus,places.websiteUri",
      Referer: process.env.GOOGLE_PLACES_REFERER || "http://localhost:3000/",
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "AE",
      languageCode: "en",
      maxResultCount: 3,
      locationBias: {
        rectangle: {
          low: { latitude: 22.5, longitude: 51.4 },
          high: { latitude: 26.4, longitude: 56.7 },
        },
      },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Google Places returned ${response.status}`);
  return normalizeGooglePlace(body.places?.[0]);
}

async function searchNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    namedetails: "1",
    extratags: "1",
    countrycodes: "ae",
    limit: "5",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      "User-Agent": "nsso-places-explorer/1.0 (https://nsso.me/places/dubai)",
      "Accept-Language": "en",
    },
  });
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
  const candidates = await response.json();
  const candidate = candidates[0];
  if (!candidate) return null;
  return {
    address: candidate.display_name,
    coordinates: { lat: Number(candidate.lat), lng: Number(candidate.lon) },
    placeId: null,
    osm: { type: candidate.osm_type, id: candidate.osm_id },
    resolutionSource: "openstreetmap-nominatim",
    resolutionStatus: Number(candidate.importance || 0) >= 0.35 ? "resolved" : "candidate",
  };
}

const raw = await fs.readFile(sourcePath, "utf8");
const records = parse(raw, {
  bom: true,
  columns: true,
  relax_column_count: true,
  relax_quotes: true,
  skip_empty_lines: true,
});

const uaeRows = records.filter((row) => /\b(?:UAE|United Arab Emirates)\b/i.test(row.Location || ""));
const grouped = new Map();

for (const [index, row] of uaeRows.entries()) {
  const rawName = row["Location Name"].trim();
  const rawSlug = normalize(rawName);
  const canonicalName = ALIAS_GROUPS.get(rawSlug) || rawName;
  const id = normalize(canonicalName);
  const existing = grouped.get(id) || {
    id,
    name: canonicalName,
    aliases: [],
    description: row["Location Description"]?.trim() || "",
    sourceUrls: [],
    sourceRows: [],
    locationHint: row.Location.trim(),
  };
  for (const alias of ALIAS_OVERRIDES[id] || []) {
    if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
  }
  if (canonicalName !== rawName && !existing.aliases.includes(rawName)) existing.aliases.push(rawName);
  if (!existing.description && row["Location Description"]) existing.description = row["Location Description"].trim();
  const url = cleanUrl(row["Location URL"]);
  if (url && !existing.sourceUrls.includes(url)) existing.sourceUrls.push(url);
  existing.sourceRows.push(index + 2);
  if (rawName === "BKD. BY Gemini") existing.locationHint = "Al Zorah, Ajman, UAE";
  grouped.set(id, existing);
}

const curatedPayload = JSON.parse(await fs.readFile(curationPath, "utf8"));
const curatedEntries = validateCuratedData(curatedPayload);
const includedCuratedIds = new Set();

for (const curatedEntry of curatedEntries) {
  const activeEvents = (curatedEntry.events || []).filter(isActiveEvent);
  if (curatedEntry.listingType === "event-venue" && !activeEvents.length) continue;
  const existing = grouped.get(curatedEntry.id);
  if (existing) {
    grouped.set(curatedEntry.id, {
      ...existing,
      ...(activeEvents.length ? { events: activeEvents } : {}),
    });
    includedCuratedIds.add(curatedEntry.id);
    continue;
  }

  const curatedPlace = { ...curatedEntry };
  delete curatedPlace.events;
  grouped.set(curatedEntry.id, {
    ...curatedPlace,
    sourceRows: [],
    ...(activeEvents.length ? { events: activeEvents } : {}),
  });
  includedCuratedIds.add(curatedEntry.id);
}

const cache = await loadCache();
const places = [];
let cacheMisses = 0;
const provider = googleApiKey ? "google" : "nominatim";

for (const entry of grouped.values()) {
  const emirate = inferEmirate(entry.locationHint, entry.name);
  const query = QUERY_OVERRIDES[entry.id] || `${entry.name}, ${entry.locationHint.replace(/UAE/gi, "United Arab Emirates")}`;
  const placeIdOverride = entry.placeId || PLACE_ID_OVERRIDES[entry.id];
  const cacheKey = googleApiKey && placeIdOverride
    ? `google-place-id:${placeIdOverride}`
    : `${provider}:${query}`;
  const hasResolutionOverride = Object.hasOwn(RESOLUTION_OVERRIDES, entry.id);
  let resolution = hasResolutionOverride ? RESOLUTION_OVERRIDES[entry.id] : cache[cacheKey];

  if (!hasResolutionOverride && !Object.hasOwn(cache, cacheKey)) {
    cacheMisses += 1;
    try {
      resolution = googleApiKey
        ? placeIdOverride ? await getGooglePlace(placeIdOverride) : await searchGoogle(query)
        : await searchNominatim(query);
    } catch (error) {
      console.warn(`[warn] ${entry.name}: ${error.message}`);
      resolution = null;
    }
    cache[cacheKey] = resolution;
    await saveCache(cache);
    if (!googleApiKey) await sleep(1100);
  }

  const sourceUrlOverrides = SOURCE_URL_OVERRIDES[entry.id];
  for (const sourceUrl of Array.isArray(sourceUrlOverrides) ? sourceUrlOverrides : [sourceUrlOverrides].filter(Boolean)) {
    if (!entry.sourceUrls.includes(sourceUrl)) entry.sourceUrls.push(sourceUrl);
  }
  if (googleApiKey && resolution?.resolutionSource === "google-places-new") {
    resolution = {
      ...resolution,
      resolutionStatus: "resolved",
      fetchedAt: resolution.fetchedAt || new Date().toISOString(),
    };
    cache[cacheKey] = resolution;
  }
  resolution = RESOLUTION_OVERRIDES[entry.id] || resolution;
  if (resolution && RESOLUTION_PATCHES[entry.id]) {
    resolution = { ...resolution, ...RESOLUTION_PATCHES[entry.id] };
  }
  const editorial = entry.taxonomy || taxonomy(entry.id, entry.name, entry.description);
  const fallbackCenter = EMIRATE_CENTERS[emirate];
  const coordinates = resolution?.coordinates || fallbackCenter;
  const address = resolution?.address || entry.locationHint;
  const resolutionStatus = resolution?.resolutionStatus || "approximate";

  places.push({
    ...entry,
    emirate,
    address,
    coordinates,
    placeId: resolution?.placeId || entry.placeId || null,
    googleTypes: resolution?.googleTypes || [],
    primaryGoogleType: resolution?.primaryGoogleType || null,
    taxonomy: editorial,
    resolution: {
      status: resolutionStatus,
      source: resolution?.resolutionSource || "emirate-center-fallback",
      matchedAt: resolution?.fetchedAt || new Date().toISOString(),
      osm: resolution?.osm || null,
      matchedName: resolution?.matchedName || null,
      websiteUri: resolution?.websiteUri || null,
      businessStatus: resolution?.businessStatus || null,
    },
    googleMapsSearchUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  });
}

places.sort((a, b) => a.emirate.localeCompare(b.emirate) || a.name.localeCompare(b.name));
await saveCache(cache);
const googleFetchedAt = places
  .filter((place) => place.resolution.source === "google-places-new")
  .map((place) => Date.parse(place.resolution.matchedAt))
  .filter(Number.isFinite);
const oldestGoogleFetch = googleFetchedAt.length ? Math.min(...googleFetchedAt) : null;
const payload = {
  meta: {
    title: "Places to go in the UAE",
    source: path.basename(sourcePath),
    sourceRecordCount: uaeRows.length,
    curatedRecordCount: includedCuratedIds.size,
    eventCount: places.reduce((count, place) => count + (place.events?.length || 0), 0),
    placeCount: places.length,
    generatedAt: new Date().toISOString(),
    expiresAt: oldestGoogleFetch === null
      ? null
      : new Date(oldestGoogleFetch + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cacheMisses,
    geocoder: googleApiKey ? "google-places-new" : "openstreetmap-nominatim",
    attribution: googleApiKey
      ? "Place IDs and current location data supplied by Google Maps Platform."
      : "Geocoding data © OpenStreetMap contributors, ODbL 1.0.",
  },
  places,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...payload.meta }, null, 2));
