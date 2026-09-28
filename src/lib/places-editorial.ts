import editorial from "../data/places-editorial.json";

export type PlaceVisitGuide = {
  placeId: string;
  verifiedAt: string;
  dateIdea: string;
  practicalities: { label: string; text: string }[];
  sources: { label: string; url: string }[];
  pairWithPlaceIds: string[];
};

export type DatePlan = {
  id: string;
  title: string;
  area: string;
  description: string;
  placeIds: string[];
};

export const placeVisitGuides: readonly PlaceVisitGuide[] = editorial.guides;
export const datePlans: readonly DatePlan[] = editorial.datePlans;
export const editorialResearchedAt = editorial.researchedAt;

export function visitGuideFor(placeId: string) {
  return placeVisitGuides.find(guide => guide.placeId === placeId);
}
