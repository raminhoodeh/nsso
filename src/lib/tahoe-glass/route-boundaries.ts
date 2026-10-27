const ROUTE_OWNED_TAHOE_SCENES = [
  "/film/razinflix",
  "/places/dubai",
  "/dreamsea/privacy",
] as const;

const ROUTES_WITHOUT_GLOBAL_TAHOE_SURFACES = [
  ...ROUTE_OWNED_TAHOE_SCENES,
  "/glass-reference",
  "/glass-candidate",
] as const;

const ROUTES_KEEPING_PROFILE_SCENE = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/preview",
  "/glass-reference",
  "/glass-candidate",
]);

// The remaining one-segment paths belong to app/[username]. Keep application
// route roots explicit so /admin or /deity cannot be mistaken for a profile.
const APPLICATION_ROUTE_ROOTS = new Set([
  "admin", "api", "app", "assets", "auth", "dashboard", "deity", "docs",
  "dreamsea", "earnings", "film", "glass-candidate", "glass-reference",
  "news", "places", "preview", "products", "profile", "reset-password",
  "set-password", "settings", "sign-in", "sign-up", "www",
]);

function normalizedPathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Static tools and profile editor; identity, auth, public/preview profiles keep their scene. */
export function routeUsesDeckBackground(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  if (ROUTES_KEEPING_PROFILE_SCENE.has(normalized)) return false;
  // Dreamsea is a separate product, with its own authored visual identity.
  if (normalized === "/dreamsea" || normalized.startsWith("/dreamsea/")) {
    return false;
  }
  const segments = normalized.split("/").filter(Boolean);
  const isPublicProfile = segments.length === 1 &&
    !APPLICATION_ROUTE_ROOTS.has(segments[0]);
  return !isPublicProfile;
}

export function routeSuppressesAuthenticatedNavigation(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  return (
    normalized === "/film/razinflix" ||
    normalized === "/places" ||
    normalized.startsWith("/places/")
  );
}

export function routeUsesDashboardSidebar(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  return normalized === "/dashboard" || normalized.startsWith("/dashboard/");
}

// Core editing and preview routes use the same account menu, never a second
// bottom bar. Nested tools receive the shared header from GlobalNavigation.
export function routeUsesMobileProfileMenu(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  return normalized === "/preview" || routeUsesDashboardSidebar(normalized);
}

export function routeNeedsGlobalAccountHeader(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  return normalized === "/" || normalized === "/admin" || normalized.startsWith("/dashboard/");
}

export function routeOwnsTahoeScene(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  return ROUTE_OWNED_TAHOE_SCENES.some((route) => normalized === route);
}

export function routeSuppressesGlobalTahoeSurfaces(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  return ROUTES_WITHOUT_GLOBAL_TAHOE_SURFACES.some(
    (route) => normalized === route,
  );
}
