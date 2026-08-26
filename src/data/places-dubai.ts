import payload from "./places-dubai.generated.json";

export type PlaceCategory =
  | "food-drink"
  | "nature-wildlife"
  | "beach-water"
  | "mountain-hiking"
  | "arts-culture-heritage"
  | "shows-immersive"
  | "creative-workshop"
  | "wellness"
  | "resort-beach-club"
  | "sport-active"
  | "shopping-stroll"
  | "family-animals"
  | "events-activities"
  | "date-ideas";

export type DubaiEvent = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: "Asia/Dubai";
  status: "scheduled" | "sold-out" | "cancelled";
  bookingUrl: string | null;
  sourceUrl: string;
  verifiedAt: string;
  verifiedUntil: string;
  dateLabel: string;
  taxonomyTags: PlaceCategory[];
};

export type DubaiPlace = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  sourceUrls: string[];
  sourceRows: number[];
  locationHint: string;
  emirate: string;
  address: string;
  coordinates: { lat: number; lng: number };
  placeId: string | null;
  googleTypes: string[];
  primaryGoogleType: string | null;
  listingType?: "place" | "event-venue";
  events?: DubaiEvent[];
  taxonomy: {
    primary: PlaceCategory;
    tags: PlaceCategory[];
  };
  resolution: {
    status: "resolved" | "candidate" | "approximate" | "non-fixed";
    source: string;
    matchedAt: string;
    osm: { type: string; id: number } | null;
    matchedName: string | null;
    websiteUri: string | null;
    businessStatus: string | null;
  };
  googleMapsSearchUri: string;
};

export type PlacesPayload = {
  meta: {
    title: string;
    source: string;
    sourceRecordCount: number;
    curatedRecordCount?: number;
    eventCount?: number;
    placeCount: number;
    generatedAt: string;
    expiresAt: string | null;
    cacheMisses: number;
    geocoder: "google-places-new" | "openstreetmap-nominatim";
    attribution: string;
  };
  places: DubaiPlace[];
};

export const dubaiPlaces = payload as PlacesPayload;
