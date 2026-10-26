import { dubaiPlaces } from "@/data/places-dubai";
import { datePlans, placeVisitGuides } from "@/lib/places-editorial";
import { createPlacesChatHandler } from "@/lib/deity/places-service";
import { geminiPlacesProvider } from "@/lib/deity/places-provider";
import { openChatBudget } from "@/lib/deity/chat-budget-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Public catalog only: deliberately separate from profile-aware Deity actions and Supabase.
const handler = createPlacesChatHandler({
  places: dubaiPlaces.places, guides: placeVisitGuides, datePlans,
}, async () => { throw new Error("Budgeted provider required"); }, Date.now, request => async input => {
  const budget = await openChatBudget(request, "places");
  return geminiPlacesProvider(input, budget);
});

export async function POST(request: Request) { return handler(request); }
