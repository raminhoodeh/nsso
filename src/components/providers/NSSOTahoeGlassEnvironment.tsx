"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import VantaBackground from "@/components/VantaBackground";
import { TahoeGlassProvider } from "@/components/providers/TahoeGlassProvider";
import DimmingOverlay from "@/components/ui/DimmingOverlay";
import type { TahoeGlassWebGLSource } from "@/lib/tahoe-glass/types";
import {
  routeOwnsTahoeScene,
  routeUsesDeckBackground,
} from "@/lib/tahoe-glass/route-boundaries";
import {
  DECK_BACKGROUND_ASSET,
  DECK_BACKGROUND_COLOR,
  DECK_BACKGROUND_IMAGE_SOURCE,
  DECK_BACKGROUND_LABEL,
} from "@/lib/deck-background";

const DECK_SCENE = (
  <div
    data-nsso-deck-background="true"
    className="h-full w-full bg-cover bg-center bg-no-repeat"
    style={{
      backgroundColor: DECK_BACKGROUND_COLOR,
      backgroundImage: `url('${DECK_BACKGROUND_ASSET}')`,
    }}
  />
);

export default function NSSOTahoeGlassEnvironment({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const vantaCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const usesDeckBackground = routeUsesDeckBackground(pathname);

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

  if (routeOwnsTahoeScene(pathname)) {
    return <>{children}</>;
  }

  const scene = usesDeckBackground
    ? DECK_SCENE
    : <VantaBackground onCanvasChange={exposeVantaCanvas} />;
  const webglSource = usesDeckBackground
    ? DECK_BACKGROUND_IMAGE_SOURCE
    : vantaWebglSource;
  const sourceLabel = usesDeckBackground
    ? DECK_BACKGROUND_LABEL
    : "vanta-clouds";

  return (
    <TahoeGlassProvider
      className="min-h-screen"
      contentClassName="min-h-screen"
      scene={scene}
      // Keep the same blue base during source startup, WebGL recovery and
      // profile-to-product navigation; transparent frames must not reveal black.
      sceneStyle={{
        backgroundColor: usesDeckBackground ? DECK_BACKGROUND_COLOR : "#586E91",
      }}
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
