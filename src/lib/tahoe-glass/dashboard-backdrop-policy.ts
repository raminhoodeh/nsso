import {
  resolveTahoeNavPlatformRoute,
  type TahoeNavPlatformCapabilities,
  type TahoeNavPlatformRoute,
} from "./nav-platform";

export interface DashboardBackdropEnvironment
  extends TahoeNavPlatformCapabilities {
  viewportWidth: number;
}

export interface DashboardBackdropPolicy {
  appleMobile: boolean;
  directBackdropEnabled: boolean;
  desktopLayout: boolean;
  platformRoute: TahoeNavPlatformRoute;
}

const DASHBOARD_DESKTOP_MIN_WIDTH = 1024;

/**
 * Keeps layout decisions separate from optical capability. A wide iPad may
 * use the desktop sidebar layout, but WebKit still cannot apply the live-DOM
 * SVG backdrop filter and must not allocate a local pane/sidebar WebGL lens.
 */
export function resolveDashboardBackdropPolicy(
  environment: DashboardBackdropEnvironment,
): DashboardBackdropPolicy {
  const appleMobile =
    /iPad|iPhone|iPod/i.test(environment.userAgent) ||
    (environment.platform === "MacIntel" && environment.maxTouchPoints > 1);
  const platformRoute = resolveTahoeNavPlatformRoute(environment);

  return {
    appleMobile,
    directBackdropEnabled: platformRoute === "svg-live-dom",
    desktopLayout: environment.viewportWidth >= DASHBOARD_DESKTOP_MIN_WIDTH,
    platformRoute,
  };
}

function serverPolicy(): DashboardBackdropPolicy {
  return {
    appleMobile: false,
    directBackdropEnabled: false,
    desktopLayout: false,
    platformRoute: "css-material",
  };
}

export function readDashboardBackdropPolicy(): DashboardBackdropPolicy {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    typeof CSS === "undefined"
  ) {
    return serverPolicy();
  }

  return resolveDashboardBackdropPolicy({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    supportsReferenceSyntax:
      CSS.supports("backdrop-filter", "url(#tahoe-dashboard-probe)") ||
      CSS.supports("-webkit-backdrop-filter", "url(#tahoe-dashboard-probe)"),
    supportsPrimitives:
      "SVGFEImageElement" in window &&
      "SVGFEDisplacementMapElement" in window,
    reducedTransparency: window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    ).matches,
    forcedColors: window.matchMedia("(forced-colors: active)").matches,
    viewportWidth: window.innerWidth,
  });
}

export function subscribeDashboardBackdropPolicy(
  callback: () => void,
): () => void {
  const desktop = window.matchMedia(
    `(min-width: ${DASHBOARD_DESKTOP_MIN_WIDTH}px)`,
  );
  const transparency = window.matchMedia(
    "(prefers-reduced-transparency: reduce)",
  );
  const forcedColors = window.matchMedia("(forced-colors: active)");
  const listeners = [desktop, transparency, forcedColors];

  for (const listener of listeners) {
    listener.addEventListener("change", callback);
  }
  window.addEventListener("resize", callback);

  return () => {
    for (const listener of listeners) {
      listener.removeEventListener("change", callback);
    }
    window.removeEventListener("resize", callback);
  };
}

export function getDashboardDirectBackdropSnapshot(): boolean {
  return readDashboardBackdropPolicy().directBackdropEnabled;
}

export function getDashboardDesktopLayoutSnapshot(): boolean {
  return readDashboardBackdropPolicy().desktopLayout;
}

export function getDashboardAppleMobileSnapshot(): boolean {
  return readDashboardBackdropPolicy().appleMobile;
}

export function getDashboardServerSnapshot(): boolean {
  return false;
}
