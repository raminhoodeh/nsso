"use client";

import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { TahoeNavPlatformCapabilities, TahoeNavPlatformRoute } from "./nav-platform";

type RouteResolver = (capabilities: TahoeNavPlatformCapabilities) => TahoeNavPlatformRoute;

/** The supplied lens has one radius. Preserve intentional speech-bubble and
 * other asymmetric corners with their existing renderer, never square them. */
export function supportsChromeGlassGeometry(radius?: string | number, style?: CSSProperties): boolean {
  if ([style?.borderTopLeftRadius, style?.borderTopRightRadius, style?.borderBottomLeftRadius, style?.borderBottomRightRadius].some(value => value !== undefined)) return false;
  return [radius, style?.borderRadius].every(value => typeof value !== "string" || !/[\s/]/.test(value.trim()));
}

export function prefersNewChromeOptics(route: TahoeNavPlatformRoute, userAgent: string, width: number, coarsePointer: boolean): boolean {
  // The approved change is desktop-only. All existing mobile paths, including
  // Android Chrome's SVG lens, retain their original optics and accessibility.
  return route === "svg-live-dom" && width >= 768 && !coarsePointer &&
    !/Android|Mobile|iPhone|iPad|iPod|CriOS/i.test(userAgent);
}

const ACCESSIBILITY_QUERIES = ["(prefers-reduced-transparency: reduce)", "(forced-colors: active)", "(pointer: coarse)"];
function subscribePolicy(callback: () => void) {
  const queries = ACCESSIBILITY_QUERIES.map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener("change", callback));
  window.addEventListener("resize", callback);
  return () => {
    queries.forEach((query) => query.removeEventListener("change", callback));
    window.removeEventListener("resize", callback);
  };
}
const serverPolicy = () => false;
const noSubscription = () => () => {};

export function useDesktopChromeGlassPolicy(resolveRoute: RouteResolver, eligible = true) {
  return useSyncExternalStore(eligible ? subscribePolicy : noSubscription, () => {
    if (!eligible) return false;
    const capabilities = {
      userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints,
      supportsReferenceSyntax: CSS.supports("backdrop-filter", "url(#tahoe-nav-probe)") || CSS.supports("-webkit-backdrop-filter", "url(#tahoe-nav-probe)"),
      supportsPrimitives: "SVGFEImageElement" in window && "SVGFEDisplacementMapElement" in window,
      reducedTransparency: window.matchMedia(ACCESSIBILITY_QUERIES[0]).matches,
      forcedColors: window.matchMedia(ACCESSIBILITY_QUERIES[1]).matches,
    };
    return prefersNewChromeOptics(resolveRoute(capabilities), capabilities.userAgent, window.innerWidth, window.matchMedia(ACCESSIBILITY_QUERIES[2]).matches);
  }, serverPolicy);
}
