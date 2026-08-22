"use client";

import { usePathname } from "next/navigation";

import ConditionalNSSOAgent from "@/components/agent/ConditionalNSSOAgent";
import GlobalNavigation from "@/components/layout/GlobalNavigation";
import { ToastViewport } from "@/components/ui/Toast";
import { routeOwnsTahoeScene } from "@/lib/tahoe-glass/route-boundaries";

export default function GlobalTahoeSurfaceBoundary({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const usesRouteOwnedProvider = routeOwnsTahoeScene(pathname);

  return (
    <>
      {!usesRouteOwnedProvider && <GlobalNavigation />}
      {children}
      {!usesRouteOwnedProvider && <ConditionalNSSOAgent />}
      {!usesRouteOwnedProvider && <ToastViewport />}
    </>
  );
}
