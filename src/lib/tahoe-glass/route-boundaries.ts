const ROUTE_OWNED_TAHOE_SCENES = [
  "/film/razinflix",
  "/places/dubai",
  "/dreamsea/privacy",
] as const;

const ROUTES_WITHOUT_GLOBAL_TAHOE_SURFACES = [
  ...ROUTE_OWNED_TAHOE_SCENES,
  "/glass-reference",
  "/glass-lab-v4",
] as const;

function normalizedPathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
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
