export interface TahoeGlassCapabilities {
  svgDisplacement: boolean;
  webgl: boolean;
  safariFamily: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  forcedColors: boolean;
  dpr: number;
}

function mediaMatches(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

export function isSafariFamily(userAgent: string, vendor: string): boolean {
  return (
    /Apple/i.test(vendor) &&
    /Safari/i.test(userAgent) &&
    !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android)/i.test(userAgent)
  );
}

function supportsSvgDisplacement(): boolean {
  if (typeof document === "undefined") return false;
  const hasFilterPrimitive =
    typeof SVGElement !== "undefined" &&
    "SVGFEImageElement" in window &&
    "SVGFEDisplacementMapElement" in window;
  const supportsCssFilter =
    typeof CSS !== "undefined" &&
    (CSS.supports("filter", "url(#tahoe-glass-probe)") ||
      CSS.supports("-webkit-filter", "url(#tahoe-glass-probe)"));
  return hasFilterPrimitive && supportsCssFilter;
}

function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  try {
    const context =
      canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
      }) || canvas.getContext("experimental-webgl");
    if (!context) return false;
    const loseContext = (context as WebGLRenderingContext)
      .getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function detectTahoeGlassCapabilities(): TahoeGlassCapabilities {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      svgDisplacement: false,
      webgl: false,
      safariFamily: false,
      reducedMotion: false,
      reducedTransparency: false,
      forcedColors: false,
      dpr: 1,
    };
  }

  return {
    svgDisplacement: supportsSvgDisplacement(),
    webgl: supportsWebGL(),
    safariFamily:
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
      isSafariFamily(navigator.userAgent, navigator.vendor),
    reducedMotion: mediaMatches("(prefers-reduced-motion: reduce)"),
    reducedTransparency: mediaMatches(
      "(prefers-reduced-transparency: reduce)",
    ),
    forcedColors: mediaMatches("(forced-colors: active)"),
    dpr: Math.max(1, Math.min(window.devicePixelRatio || 1, 3)),
  };
}
