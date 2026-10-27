import type { TahoeGlassWebGLSource } from "@/lib/tahoe-glass/types";

/** The original blue grain image extracted from NSSO's supplied pitch deck. */
export const DECK_BACKGROUND_ASSET = "/assets/backgrounds/nsso-deck-blue.webp";
export const DECK_BACKGROUND_COLOR = "#43628c";
export const DECK_BACKGROUND_LABEL = "nsso-deck-blue";

/** Keep the glass renderer and the visible scene on the exact same pixels. */
export const DECK_BACKGROUND_IMAGE_SOURCE = {
  kind: "image",
  src: DECK_BACKGROUND_ASSET,
  fit: "cover",
  label: DECK_BACKGROUND_LABEL,
} as const satisfies TahoeGlassWebGLSource;
