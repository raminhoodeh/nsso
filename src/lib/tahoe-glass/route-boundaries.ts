const ROUTE_OWNED_TAHOE_SCENES = [
  "/film/razinflix",
  "/places",
  "/glass-reference",
  "/dreamsea/privacy",
] as const;

export function routeOwnsTahoeScene(pathname: string): boolean {
  return ROUTE_OWNED_TAHOE_SCENES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
