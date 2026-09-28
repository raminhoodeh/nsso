/** Public, read-only Places chat contract. No profile or account actions are supported. */
export type PlacesChatHistoryItem = { role: "user" | "assistant"; content: string };

export type PlacesChatRequest = {
  message: string;
  history?: PlacesChatHistoryItem[];
  context?: {
    selectedPlaceId?: string | null;
    filteredPlaceIds?: string[];
    savedPlaceIds?: string[];
  };
};

export type PlacesChatRecommendation = {
  placeId: string;
  reason: string;
  eventId?: string;
};

export type PlacesChatItinerary = {
  title: string;
  summary: string;
  /** A suggested visiting date, not a booking; absent when the user has not chosen a day. */
  date?: string;
  stops: (PlacesChatRecommendation & { timeLabel: string })[];
};

export type PlacesChatResponse = {
  message: string;
  recommendations: PlacesChatRecommendation[];
  itinerary: PlacesChatItinerary | null;
  warnings: string[];
};
