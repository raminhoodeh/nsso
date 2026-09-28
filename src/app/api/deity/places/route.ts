import { dubaiPlaces } from "@/data/places-dubai";
import { datePlans, placeVisitGuides } from "@/lib/places-editorial";
import { createPlacesChatHandler } from "@/lib/deity/places-service";
import { geminiPlacesProvider } from "@/lib/deity/places-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Public catalog only: deliberately separate from profile-aware Deity actions and Supabase.
export const POST = createPlacesChatHandler({
  places: dubaiPlaces.places, guides: placeVisitGuides, datePlans,
}, geminiPlacesProvider);
