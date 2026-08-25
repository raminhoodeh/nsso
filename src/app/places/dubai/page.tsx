import type { Metadata, Viewport } from "next";
import { dubaiPlaces } from "@/data/places-dubai";
import PlacesExplorer from "./PlacesExplorer";

export const metadata: Metadata = {
  title: "Places to go in the UAE | nsso",
  description: "A map of cafés, coastlines, culture, wellness, and date ideas across the UAE.",
  openGraph: {
    title: "Where should we go?",
    description: `${dubaiPlaces.meta.placeCount} ideas for a good day out across the UAE.`,
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#d9ddd5",
};

export default function DubaiPlacesPage() {
  return <PlacesExplorer payload={dubaiPlaces} />;
}
