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
  "/dreamsea/privacy",
] as const;

const SIRI_IMAGE_SOURCE = {
  kind: "image",
  src: "/siri-gradient.png",
  fit: "cover",
  label: "siri-gradient",
} as const satisfies TahoeGlassWebGLSource;

const SIRI_SCENE = (
  <div
    className="h-full w-full bg-[#43628c] bg-cover bg-center bg-no-repeat"
    style={{ backgroundImage: "url('/siri-gradient.png')" }}
  />
);

function routeOwnsScene(pathname: string): boolean {
  return ROUTE_OWNED_SCENES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function routeUsesSiriScene(pathname: string): boolean {
  return (
    pathname === "/earnings" ||
    pathname.startsWith("/products/") ||
    (/^\/dashboard\/products\/[^/]+\/creator\/?$/.test(pathname))
  );
}

export default function NSSOTahoeGlassEnvironment({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const vantaCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const usesSiriScene = routeUsesSiriScene(pathname);

  const exposeVantaCanvas = React.useCallback(
    (canvas: HTMLCanvasElement | null) => {
      vantaCanvasRef.current = canvas;
    },
    [],
  );

  const vantaWebglSource = React.useMemo<TahoeGlassWebGLSource>(
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

  const scene = usesSiriScene
    ? SIRI_SCENE
    : <VantaBackground onCanvasChange={exposeVantaCanvas} />;
  const webglSource = usesSiriScene ? SIRI_IMAGE_SOURCE : vantaWebglSource;
  const sourceLabel = usesSiriScene ? "siri-gradient" : "vanta-clouds";

  return (
    <TahoeGlassProvider
      className="min-h-screen"
      contentClassName="min-h-screen"
      scene={scene}
      sourceLabel={sourceLabel}
      preferredBackend="auto"
      fallback="webgl"
      webglSource={webglSource}
    >
      <DimmingOverlay />
      <div className="relative z-[1] min-h-screen">{children}</div>
    </TahoeGlassProvider>
  );
}
