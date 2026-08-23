export type TahoeNavPlatformRoute =
  | "svg-live-dom"
  | "webgl-owned-scene"
  | "css-material"
  | "solid";

export interface TahoeNavPlatformCapabilities {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  supportsReferenceSyntax: boolean;
  supportsPrimitives: boolean;
  reducedTransparency: boolean;
  forcedColors: boolean;
}

/**
 * Selects the nav optical architecture without relying on viewport size.
 *
 * Chromium on Android can use the live SVG backdrop path. Every browser on
 * iPhone/iPad currently uses WebKit, so it receives the owned-scene WebGL
 * renderer instead. Desktop Safari remains on the honest CSS material path.
 */
export function resolveTahoeNavPlatformRoute(
  capabilities: TahoeNavPlatformCapabilities,
): TahoeNavPlatformRoute {
  if (capabilities.forcedColors || capabilities.reducedTransparency) {
    return "solid";
  }

  const appleMobile =
    /iPad|iPhone|iPod/i.test(capabilities.userAgent) ||
    (capabilities.platform === "MacIntel" &&
      capabilities.maxTouchPoints > 1);
  if (appleMobile) return "webgl-owned-scene";

  const chromium =
    /(Chrome|Chromium|Edg|OPR|SamsungBrowser)/i.test(
      capabilities.userAgent,
    );
  if (
    chromium &&
    capabilities.supportsReferenceSyntax &&
    capabilities.supportsPrimitives
  ) {
    return "svg-live-dom";
  }

  return "css-material";
}
