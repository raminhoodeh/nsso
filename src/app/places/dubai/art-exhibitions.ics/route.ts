import { dubaiPlaces } from "@/data/places-dubai";
import { exhibitionsCalendar } from "@/lib/places-events";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(exhibitionsCalendar(dubaiPlaces.places, Date.now()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nsso-art-exhibitions.ics"',
      "Cache-Control": "no-store",
    },
  });
}
