"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import VantaBackground from "@/components/VantaBackground";
import { TahoeGlassProvider } from "@/components/providers/TahoeGlassProvider";
import DimmingOverlay from "@/components/ui/DimmingOverlay";
import type { TahoeGlassWebGLSource } from "@/lib/tahoe-glass/types";

const ROUTE_OWNED_SCENES = [
  "/film/razinflix",
  "/places",
  "/glass-reference",
] as const;

function routeOwnsScene(pathname: string): boolean {
  return ROUTE_OWNED_SCENES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default function NSSOTahoeGlassEnvironment({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const vantaCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const exposeVantaCanvas = React.useCallback(
    (canvas: HTMLCanvasElement | null) => {
      vantaCanvasRef.current = canvas;
    },
    [],
  );

  const webglSource = React.useMemo<TahoeGlassWebGLSource>(
    () => ({
      kind: "canvas",
      getElement: () => vantaCanvasRef.current,
      dynamic: false,
      fit: "stretch",
      label: "vanta-clouds-canvas",
    }),
    [],
  );

  if (routeOwnsScene(pathname)) {
    return <>{children}</>;
  }

  return (
    <TahoeGlassProvider
      className="min-h-screen"
      contentClassName="min-h-screen"
      scene={<VantaBackground onCanvasChange={exposeVantaCanvas} />}
      sourceLabel="vanta-clouds"
      preferredBackend="auto"
      fallback="webgl"
      webglSource={webglSource}
    >
      <DimmingOverlay />
      <div className="relative z-[1] min-h-screen">{children}</div>
    </TahoeGlassProvider>
  );
}
