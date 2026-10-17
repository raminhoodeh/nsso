import type { DubaiPlace, PlaceCategory } from "../data/places-dubai";

const CATEGORY_WORDS: Record<PlaceCategory, string> = {
  "food-drink": "food drink",
  "nature-wildlife": "nature wildlife",
  "beach-water": "beaches water",
  "mountain-hiking": "mountains hiking",
  "arts-culture-heritage": "art culture heritage",
  "art-exhibitions": "art exhibitions",
  "shows-immersive": "shows immersive performances",
  "creative-workshop": "creative workshops",
  wellness: "wellness spas",
  "resort-beach-club": "resorts beach clubs",
  "sport-active": "sports active",
  "shopping-stroll": "shopping strolls",
  "family-animals": "family animals",
  "events-activities": "events activities",
  "date-ideas": "date ideas",
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type SearchField = { text: string; compact: string };

function field(value: string): SearchField {
  const text = normalize(value);
  return { text, compact: text.replace(/\s/g, "") };
}

function relevance(value: SearchField, query: SearchField, tokens: string[]): number {
  if (!value.text) return 0;
  // Compacted forms also accept common spacing variants, e.g. Khor Fakkan.
  if (value.text === query.text || value.compact === query.compact) return 4;
  if (value.text.startsWith(query.text) || value.compact.startsWith(query.compact)) return 3;
  if (value.text.includes(query.text) || value.compact.includes(query.compact)) return 2;
  return tokens.every(token => value.text.includes(token)) ? 1 : 0;
}

/** Search the supplied catalog without mutating it or applying hidden filters. */
export function searchPlaces(places: readonly DubaiPlace[], query: string): DubaiPlace[] {
  const needle = field(query);
  if (!needle.text) return [];
  const tokens = [...new Set(needle.text.split(" "))];

  return places.flatMap((place, index) => {
    const name = field(place.name);
    const aliases = place.aliases.map(field);
    const locations = [place.address, place.locationHint, place.emirate].map(field);
    const categories = [...new Set([place.taxonomy.primary, ...place.taxonomy.tags])]
      .map(category => field(CATEGORY_WORDS[category]));
    const types = place.googleTypes.filter(type => !["point_of_interest", "establishment"].includes(type)).map(field);
    const searchable = [name, ...aliases, ...locations, ...categories, ...types];
    const phraseMatch = searchable.some(value => relevance(value, needle, tokens) > 0);
    const acrossFields = tokens.every(token => searchable.some(value => value.text.includes(token)));
    if (!phraseMatch && !acrossFields) return [];

    // Identity beats location/category matches. Descriptions deliberately stay
    // out of the index: they can mention a different venue or a nearby landmark.
    const bestAlias = Math.max(0, ...aliases.map(value => relevance(value, needle, tokens)));
    const bestLocation = Math.max(0, ...locations.map(value => relevance(value, needle, tokens)));
    const nameScores = [0, 400, 600, 800, 1000];
    const aliasScores = [0, 350, 500, 700, 900];
    const identityTokens = Math.max(...[name, ...aliases].map(value => tokens.filter(token => value.text.includes(token)).length));
    const score = Math.max(nameScores[relevance(name, needle, tokens)], aliasScores[bestAlias])
      + bestLocation * 2 + identityTokens / (tokens.length + 1);
    return [{ place, score, name: name.text, index }];
  }).sort((a, b) => b.score - a.score
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    || (a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0)
    || a.index - b.index).map(result => result.place);
}
