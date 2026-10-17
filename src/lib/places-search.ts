import type { DubaiPlace, PlaceCategory } from "../data/places-dubai";

const CATEGORY_WORDS: Record<PlaceCategory, string> = {
  "food-drink": "food drink", "nature-wildlife": "nature wildlife",
  "beach-water": "beach water", "mountain-hiking": "mountain hiking",
  "arts-culture-heritage": "art culture heritage", "art-exhibitions": "art exhibition",
  "shows-immersive": "show immersive performance", "creative-workshop": "creative workshop",
  wellness: "wellness spa", "resort-beach-club": "resort beach club",
  "sport-active": "sport active", "shopping-stroll": "shopping stroll",
  "family-animals": "family animal", "events-activities": "event activity", "date-ideas": "date romantic couple",
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Whole phrases, not substring expansion: JLT must not accidentally match a name.
const AREA_ALIASES: [RegExp, string][] = [
  [/\bjumeirah lakes? towers\b/g, "jlt"],
  [/\bdubai silicon oasis\b/g, "dso"],
  [/\bdubai design district\b/g, "d3"],
  [/\bdubai international financial cent(?:re|er)\b/g, "difc"],
  [/\bdubai creek harbour\b/g, "dch"],
  [/\bjumeirah village circle\b/g, "jvc"],
  [/\bras al khaimah\b|\bras al khaima\b/g, "rak"],
  [/\babu dhabi\b/g, "abudhabi"],
  [/\bumm al quwain\b|\bumm al qaiwain\b|\bumm al quwai[nm]\b/g, "uaq"],
  [/\bal qouz\b|\bal quoz\b/g, "alquoz"],
  [/\b(?:qouz|quoz)\b/g, "alquoz"],
  [/\bal serkal\b|\balserkal\b/g, "alserkal"],
  [/\bal jadaf\b|\bal jaddaf\b/g, "aljaddaf"],
  [/\bkhor fa[kq]{1,2}an\b|\bkhorfa[kq]{1,2}an\b/g, "khorfakkan"],
  [/\bjumeira\b/g, "jumeirah"],
  [/\blisaili\b|\blesaily\b/g, "lisaili"],
  [/القوز/g, " alquoz "], [/دبي/g, " dubai "], [/الشارقة/g, " sharjah "],
  [/ابو ظبي/g, " abudhabi "],
];

function canonical(value: string): string {
  return AREA_ALIASES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), normalize(value))
    .replace(/\s+/g, " ").trim();
}

const FILLER = new Set("a an the and or of at in on to for with from near around please find show me us we i you can could want would like some somewhere where go going place places thing things do doing lets something have get my our together is are make making learn try take taking nice good best".split(" "));
const EMIRATES = new Set(["dubai", "abudhabi", "sharjah", "ajman", "fujairah", "rak", "uaq"]);

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function words(value: string): string[] {
  return [...new Set(canonical(value).split(" ").filter(Boolean).map(stem))];
}

// These are discovery concepts, not claims about live availability. Specific
// activities need supporting venue evidence; a generic category is not enough.
const TOPIC_ALIASES: Record<string, string[]> = {
  pottery: ["pottery", "ceramic", "ceramics", "clay", "wheel throwing", "wheelthrowing", "hand building", "handbuilding"],
  coffee: ["coffee", "coffees", "cafe", "cafes", "cafeteria", "coffee shop", "coffeeshop", "roastery"],
  reading: ["book", "books", "library", "libraries", "reading", "bookshop", "bookstore"],
  stargazing: ["stargazing", "star gazing", "stars", "astronomy", "astrophotography", "milky way", "night sky", "dark sky", "observatory"],
  cycling: ["cycling", "cycle", "bicycle", "bicycling", "biking", "bike"],
  hiking: ["hiking", "hike", "trekking", "trek", "trail", "trails"],
  kayaking: ["kayak", "kayaking", "canoe", "canoeing", "paddling", "paddleboarding"],
  cinema: ["cinema", "movie", "movies", "film", "films", "screening"],
  theatre: ["theatre", "theater", "improv", "acting", "comedy"],
  games: ["board games", "board game", "boardgames", "boardgame"],
  karaoke: ["karaoke", "singing", "k pop", "kpop"],
  perfume: ["perfume", "perfumery", "fragrance", "perfume making"],
  painting: ["painting", "paint", "canvas"],
  candlemaking: ["candlemaking", "candle making", "candle", "candles"],
  workshop: ["workshop", "workshops", "class", "classes", "lesson", "lessons", "craft", "crafts", "creative"],
  restaurant: ["restaurant", "restaurants", "dining", "dinner", "meal", "eat", "eating", "eatery", "eateries"],
  dessert: ["dessert", "desserts", "sweet", "sweets", "bakery", "bakeries", "pastry", "pastries"],
  beach: ["beach", "beaches", "seaside", "shore", "shoreline", "coast", "coastal"],
  garden: ["garden", "gardens", "park", "parks", "greenery", "green"],
  desert: ["desert", "dune", "dunes"],
  art: ["art", "arts", "gallery", "galleries", "exhibition", "exhibitions"],
  museum: ["museum", "museums"],
  heritage: ["heritage", "historic", "historical", "history"],
  wellness: ["wellness", "relaxation", "unwind"],
  spa: ["spa", "spas", "massage"],
  romantic: ["romantic", "romance", "date", "dates", "couple", "couples"],
};

const TOPIC_TERMS = Object.entries(TOPIC_ALIASES).flatMap(([topic, terms]) => terms.map(term => ({ topic, term: words(term).join(" ") })))
  .sort((a, b) => b.term.length - a.term.length);
const TOPIC_WORDS = new Map(TOPIC_TERMS.filter(({ term }) => !term.includes(" ")).map(({ term, topic }) => [term, topic]));
for (const topic of Object.keys(TOPIC_ALIASES)) TOPIC_WORDS.set(stem(topic), topic);

// Do not index neighbouring recommendations or explicit negatives as offerings.
// Identity/location searches never depend on description-only references.
function ownDescription(description: string): string {
  return description.split(/[.!?;]/).filter(sentence => !/\b(?:not the|nearby|pair (?:it |a |the |your )?|after(?:wards)?(?: class)?|instead of|rather than)\b/i.test(sentence)).join(" ");
}

type IndexedPlace = {
  names: string[]; locations: string[]; identity: string[]; location: string[];
  categories: string[]; description: string[]; topics: Set<string>; emirate: string;
};
const indexCache = new WeakMap<DubaiPlace, IndexedPlace>();

function indexPlace(place: DubaiPlace): IndexedPlace {
  const cached = indexCache.get(place);
  if (cached) return cached;
  const names = [place.name, ...place.aliases].map(canonical);
  const locations = [place.address, place.locationHint, place.emirate].map(canonical);
  const description = ownDescription(place.description);
  const body = canonical(`${names.join(" ")} ${description}`);
  const types = [place.primaryGoogleType, ...place.googleTypes].filter(Boolean).join(" ");
  const categories = [...new Set([place.taxonomy.primary, ...place.taxonomy.tags])];
  const has = (category: PlaceCategory) => categories.includes(category);
  const topics = new Set<string>();
  const add = (topic: string, matches: boolean) => { if (matches) topics.add(topic); };

  add("pottery", /\b(?:pottery|ceramic|ceramics|clay)\b/.test(body)
    && /\b(?:studio|classes|workshops?|wheels?|throwing|hand building|handbuilding|kilns?)\b/.test(body));
  add("coffee", /\b(?:cafe|coffee_shop|coffee_roastery|tea_house|cat_cafe)\b/.test(types)
    || /\b(?:cafe|coffee|roastery)\b/.test(names.join(" ")));
  add("reading", /\b(?:library|libraries|books?|bookshop|bookstore|reading)\b/.test(body));
  add("stargazing", /\b(?:stargazing|astronomy|astrophotography|milky way|observatory|dark sky)\b/.test(body));
  add("cycling", /\b(?:cycling|cycle|bicycle|bikes?|biking)\b/.test(body));
  add("hiking", /\b(?:hiking|hike|trekking|trails?)\b/.test(body) || place.taxonomy.primary === "mountain-hiking");
  add("kayaking", /\b(?:kayaks?|kayaking|canoeing|paddling|paddleboarding)\b/.test(body));
  add("cinema", /\b(?:cinema|screenings?|movie theater)\b/.test(body) || /movie_theater/.test(types));
  add("theatre", /\b(?:theatre|theater|improv|acting|comedy)\b/.test(body));
  add("games", /\bboard ?games?\b/.test(body));
  add("karaoke", /\bkaraoke\b/.test(body));
  add("perfume", /\b(?:perfume|fragrance|perfumery)\b/.test(body)
    && /\b(?:lab|mixology|workshop|create|blend|blending)\b/.test(body));
  add("painting", /\b(?:painting|paint|canvas)\b/.test(body) && /\b(?:studio|workshops?|classes)\b/.test(body));
  add("candlemaking", /\b(?:candle making|candlemaking|candle workshop|make candles)\b/.test(body));
  add("workshop", has("creative-workshop") || /\b(?:workshops?|classes|lessons)\b/.test(body));
  add("restaurant", ((has("food-drink") || has("resort-beach-club")) && /(?:^|\s)(?:\w+_)?restaurant\b|\b(?:deli|steak_house)\b/.test(types))
    || /\b(?:restaurant|izakaya|dining)\b/.test(body));
  add("dessert", /\b(?:bakery|bakers|patisserie|desserts?|pastries|knafeh|kunafa|sweets?)\b/.test(body));
  add("beach", has("beach-water") || /\b(?:beach|seaside|shoreline|coast)\b/.test(body));
  add("garden", /\b(?:gardens?|parks?|greenery|oasis|wetland|mangrove)\b/.test(body));
  add("desert", /\b(?:desert|dunes?)\b/.test(body));
  add("art", has("art-exhibitions") || /\b(?:art_gallery|art_studio|art_museum)\b/.test(types)
    || /\b(?:gallery|galleries|exhibitions?|contemporary art|art space|art museum|art studio|art centre|art center)\b/.test(body));
  add("museum", /\bmuseums?\b/.test(names.join(" ")) || /\b(?:museum|art_museum)\b/.test(types));
  add("heritage", /\b(?:heritage|historic|historical|archaeological)\b/.test(body));
  add("wellness", has("wellness") || /\b(?:spa|wellness|yoga|meditation)\b/.test(body));
  add("spa", /\b(?:spa|massage_spa)\b/.test(types) || /\b(?:spa|massage)\b/.test(body));
  add("romantic", has("date-ideas") || /\b(?:romantic|couples?|date|candlelight|candle lit)\b/.test(body));

  const indexed = { names, locations, identity: words(names.join(" ")), location: words(locations.join(" ")),
    categories: words(categories.map(category => CATEGORY_WORDS[category]).join(" ") + " " + types.replace(/point_of_interest|establishment/g, "")),
    description: words(description), topics, emirate: canonical(place.emirate) };
  indexCache.set(place, indexed);
  return indexed;
}

// Bounded Damerau-Levenshtein accepts a missing letter or adjacent transposition,
// without making short inputs like "art" fuzzy enough to match unrelated words.
function typoDistance(a: string, b: string): number {
  const limit = a.length >= 8 ? 2 : 1;
  if (a.length < 4 || Math.abs(a.length - b.length) > limit) return Infinity;
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length] <= limit ? rows[a.length][b.length] : Infinity;
}

function phraseScore(values: string[], query: string, exact: number, prefix: number, contains: number): number {
  const compact = query.replace(/\s/g, "");
  return Math.max(0, ...values.map(value => {
    if (value === query || value.replace(/\s/g, "") === compact) return exact;
    if (value.startsWith(query) || value.replace(/\s/g, "").startsWith(compact)) return prefix;
    return (` ${value} `).includes(` ${query} `) ? contains : 0;
  }));
}

/** Instant, typo-tolerant catalog discovery. Every meaningful term must match;
 * location constraints are never silently discarded to manufacture results. */
export function searchPlaces(places: readonly DubaiPlace[], query: string): DubaiPlace[] {
  const needle = canonical(query);
  if (!needle) return [];
  // "Book a class" is a request for an activity, not books AND a class.
  const conversational = needle.replace(/\bbook (?=(?:a|an|the|us|me)\b)/g, "");
  let expanded = words(conversational).join(" ");
  for (const { term, topic } of TOPIC_TERMS) {
    if (term.includes(" ")) expanded = (` ${expanded} `).split(` ${term} `).join(` ${stem(topic)} `).trim();
  }
  const tokens = [...new Set(expanded.split(" ").filter(token => !FILLER.has(token)))];
  if (!tokens.length) return [];
  const entries = places.map(place => ({ place, index: indexPlace(place) }));
  const identityVocabulary = new Set(entries.flatMap(({ index }) => [...index.identity, ...index.location]));
  const distanceCache = new Map<string, number>();
  const distance = (a: string, b: string) => {
    const key = `${a}:${b}`;
    if (!distanceCache.has(key)) distanceCache.set(key, typoDistance(a, b));
    return distanceCache.get(key)!;
  };
  const topicFor = (token: string): string | undefined => {
    if (TOPIC_WORDS.has(token)) return TOPIC_WORDS.get(token);
    if (token.length >= 3) {
      const prefixes = new Set([...TOPIC_WORDS].filter(([word]) => word.startsWith(token)).map(([, topic]) => topic));
      if (prefixes.size === 1 && !identityVocabulary.has(token)) return [...prefixes][0];
    }
    const suggestions = [...TOPIC_WORDS].map(([word, topic]) => ({ topic, distance: distance(token, word) }))
      .filter(match => Number.isFinite(match.distance)).sort((a, b) => a.distance - b.distance);
    // Prefer a real name/area token to a coincidentally similar activity word.
    return identityVocabulary.has(token) ? undefined : suggestions[0]?.topic;
  };
  const queryTerms = tokens.map(token => ({ token, topic: topicFor(token) }));
  const match = (token: string, vocabulary: string[], fuzzy: boolean): number => {
    if (vocabulary.includes(token)) return 1;
    if (vocabulary.some(word => word.startsWith(token))) return 0.8;
    if (fuzzy && vocabulary.some(word => Number.isFinite(distance(token, word)))) return 0.55;
    return 0;
  };

  return entries.flatMap(({ place, index }) => {
    const exactName = phraseScore(index.names.slice(0, 1), needle, 1000, 800, 600);
    const aliasName = phraseScore(index.names.slice(1), needle, 900, 700, 500);
    const identityQuery = tokens.filter(token => !EMIRATES.has(token)).join(" ");
    // Keep a complete venue/alias ahead of neighbours sharing its address when
    // the query adds an emirate ("Courtyard Quoz Dubai", for example).
    const identityPhrase = identityQuery ? phraseScore(index.names, identityQuery, 120, 80, 60) : 0;
    let score = Math.max(exactName, aliasName) + identityPhrase;
    for (const { token, topic } of queryTerms) {
      if (EMIRATES.has(token) && index.emirate !== token) return [];
      // A venue explicitly named Pottery still counts, but ancient pottery in a
      // museum's prose is not evidence of a hands-on pottery activity.
      const semantic = topic && index.topics.has(topic) ? 1 : 0;
      let identity = match(token, index.identity, !topic);
      if (topic && !semantic && identity < 1) identity = 0;
      // An activity must not match an unrelated street through a typo (paint /
      // point) or a word prefix (spa / space). Names still support partial typing.
      const location = !topic || semantic ? match(token, index.location, !topic) : 0;
      const category = !topic ? match(token, index.categories, false) : 0;
      const descriptive = !topic && !identityVocabulary.has(token) ? match(token, index.description, false) : 0;
      if (!identity && !location && !semantic && !category && !descriptive) return [];
      score += (identity * 45 + location * 12 + semantic * 18 + category * 5 + descriptive * 3) / queryTerms.length;
    }
    return [{ place, score, name: index.names[0] }];
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "en") || a.place.id.localeCompare(b.place.id, "en"))
    .map(({ place }) => place);
}
