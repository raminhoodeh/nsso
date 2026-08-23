export type TahoeV4RouteScenePolicy =
  | "clouds"
  | "siri-image"
  | "razinflix-image"
  | "dreamsea-image"
  | "places-map-material-only"
  | "fixture-owned";

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * Source truth for every route family. A policy names the pixels the renderer
 * is allowed to refract; it never infers arbitrary DOM or third-party frames.
 */
export function tahoeV4RouteScenePolicy(
  pathname: string,
): TahoeV4RouteScenePolicy {
  const route = normalize(pathname);
  if (route === "/film/razinflix") return "razinflix-image";
  if (route === "/dreamsea/privacy") return "dreamsea-image";
  if (route === "/places/dubai") return "places-map-material-only";
  if (route === "/glass-reference" || route === "/glass-lab-v4") {
    return "fixture-owned";
  }
  if (
    route === "/earnings" ||
    route.startsWith("/products/") ||
    /^\/dashboard\/products\/[^/]+\/creator$/.test(route)
  ) {
    return "siri-image";
  }
  return "clouds";
}
