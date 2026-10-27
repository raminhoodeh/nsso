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

function normalizedPathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
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

// The profile editor owns a mobile header menu. Its nested tools do not all
// render that header, so retain their existing bottom navigation for now.
export function routeUsesMobileProfileMenu(pathname: string): boolean {
  return normalizedPathname(pathname) === "/dashboard";
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
