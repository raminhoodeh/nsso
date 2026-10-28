"use client";

import * as React from "react";
import { useLiquidGlass, type GlassAppearance } from "@/components/ui/experimental/liquid-glass-candidate";
import { resolveTahoeNavPlatformRoute } from "@/lib/tahoe-glass/nav-platform";
import { useDesktopChromeGlassPolicy } from "@/lib/tahoe-glass/chrome-policy";

export type { GlassAppearance } from "@/components/ui/experimental/liquid-glass-candidate";

/** Optics only: existing semantic wrappers, refs, tints and children stay put. */
export function useChromeGlassOptics(
  rootRef: React.RefObject<HTMLElement | null>,
  eligible: boolean,
  navigation = false,
  appearance: GlassAppearance = "dark",
  squareTop = false,
  satin = false,
) {
  const desktopChrome = useDesktopChromeGlassPolicy(resolveTahoeNavPlatformRoute, eligible);
  const enabled = eligible && desktopChrome;
  const glass = useLiquidGlass({
    material: "clear", appearance, refraction: 32,
    bezel: navigation ? 28 : 32, blur: satin ? 5 : 1, mode: "auto",
    interactive: false, motion: "none", fluid: false, squareTop,
  }, rootRef, enabled);
  return { enabled, ready: enabled && glass.mode === "refract", layers: enabled ? glass.layers : null };
}
