"use client";

import { usePathname } from "next/navigation";

import ConditionalNSSOAgent from "@/components/agent/ConditionalNSSOAgent";
import GlobalNavigation from "@/components/layout/GlobalNavigation";
import { ToastViewport } from "@/components/ui/Toast";
import { routeSuppressesGlobalTahoeSurfaces } from "@/lib/tahoe-glass/route-boundaries";

export default function GlobalTahoeSurfaceBoundary({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const usesRouteOwnedProvider = routeSuppressesGlobalTahoeSurfaces(pathname);

  return (
    <>
      {!usesRouteOwnedProvider && <GlobalNavigation />}
      {children}
      {!usesRouteOwnedProvider && <ConditionalNSSOAgent />}
      {!usesRouteOwnedProvider && <ToastViewport />}
    </>
  );
}
