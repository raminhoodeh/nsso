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

export const TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS = 512 * 512;

export interface TahoeDirectBackdropFieldSampling {
  /** CSS dimensions passed to the displacement-field generator. */
  generationCssWidth: number;
  generationCssHeight: number;
  fieldDpr: number;
  pixelWidth: number;
  pixelHeight: number;
  capped: boolean;
}

/**
 * Resolves a bounded sampling grid for a direct SVG/local-WebGL backdrop.
 * Filter and surface geometry continue to use the original CSS dimensions;
 * only the generated displacement texture is downsampled.
 */
export function resolveTahoeDirectBackdropFieldSampling(
  cssWidth: number,
  cssHeight: number,
  preferredDpr = 1,
): TahoeDirectBackdropFieldSampling {
  if (!Number.isFinite(cssWidth) || cssWidth <= 0) {
    throw new Error("tahoe-direct-backdrop-width-invalid");
  }
  if (!Number.isFinite(cssHeight) || cssHeight <= 0) {
    throw new Error("tahoe-direct-backdrop-height-invalid");
  }
  if (!Number.isFinite(preferredDpr) || preferredDpr <= 0) {
    throw new Error("tahoe-direct-backdrop-dpr-invalid");
  }

  // createTahoeDisplacementField clamps its DPR to 0.25. If the effective
  // sample scale must be lower, reduce the generator's CSS dimensions too so
  // the final canvas still honors the same hard pixel budget.
  const safePreferredDpr = Math.max(0.25, preferredDpr);
  const preferredPixelWidth = Math.max(
    1,
    Math.round(cssWidth * safePreferredDpr),
  );
  const preferredPixelHeight = Math.max(
    1,
    Math.round(cssHeight * safePreferredDpr),
  );
  if (
    preferredPixelWidth * preferredPixelHeight <=
    TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS
  ) {
    return {
      generationCssWidth: cssWidth,
      generationCssHeight: cssHeight,
      fieldDpr: safePreferredDpr,
      pixelWidth: preferredPixelWidth,
      pixelHeight: preferredPixelHeight,
      capped: false,
    };
  }

  const effectiveDpr = Math.sqrt(
    TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS / (cssWidth * cssHeight),
  );
  let pixelWidth = Math.max(1, Math.floor(cssWidth * effectiveDpr));
  let pixelHeight = Math.max(1, Math.floor(cssHeight * effectiveDpr));
  // Preserve the hard area bound even for pathological aspect ratios where
  // one calculated dimension rounds below the mandatory one-pixel minimum.
  if (
    pixelWidth * pixelHeight >
    TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS
  ) {
    if (pixelWidth >= pixelHeight) {
      pixelWidth = Math.max(
        1,
        Math.floor(
          TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS / pixelHeight,
        ),
      );
    } else {
      pixelHeight = Math.max(
        1,
        Math.floor(
          TAHOE_DIRECT_BACKDROP_MAX_FIELD_PIXELS / pixelWidth,
        ),
      );
    }
  }
  const fieldDpr = Math.max(0.25, effectiveDpr);

  return {
    generationCssWidth: pixelWidth / fieldDpr,
    generationCssHeight: pixelHeight / fieldDpr,
    fieldDpr,
    pixelWidth,
    pixelHeight,
    capped: true,
  };
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
