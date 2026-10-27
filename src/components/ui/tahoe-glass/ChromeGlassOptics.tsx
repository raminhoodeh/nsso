"use client";

import * as React from "react";
import { useLiquidGlass } from "@/components/ui/experimental/liquid-glass-candidate";
import { resolveTahoeNavPlatformRoute } from "@/lib/tahoe-glass/nav-platform";
import { useDesktopChromeGlassPolicy } from "@/lib/tahoe-glass/chrome-policy";

/** Optics only: existing semantic wrappers, refs, tints and children stay put. */
export function useChromeGlassOptics(
  rootRef: React.RefObject<HTMLElement | null>,
  eligible: boolean,
  navigation = false,
) {
  const desktopChrome = useDesktopChromeGlassPolicy(resolveTahoeNavPlatformRoute, eligible);
  const enabled = eligible && desktopChrome;
  const glass = useLiquidGlass({
    material: "clear", appearance: "dark", refraction: 32,
    bezel: navigation ? 28 : 32, blur: 1, mode: "auto",
    interactive: false, motion: "none", fluid: false,
  }, rootRef, enabled);
  return { enabled, ready: enabled && glass.mode === "refract", layers: enabled ? glass.layers : null };
}
