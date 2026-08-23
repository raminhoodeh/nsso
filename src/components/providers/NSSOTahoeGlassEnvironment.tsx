"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import VantaBackground from "@/components/VantaBackground";
import { TahoeGlassProvider } from "@/components/providers/TahoeGlassProvider";
import { TahoeGlassV4Provider } from "@/components/providers/TahoeGlassV4Provider";
import { useTahoeV4Rollout } from "@/components/providers/TahoeV4RolloutGate";
import DimmingOverlay from "@/components/ui/DimmingOverlay";
import type { TahoeGlassWebGLSource } from "@/lib/tahoe-glass/types";
import {
  tahoeV4RouteScenePolicy,
  type TahoeV4SceneSource,
} from "@/lib/tahoe-glass/v4";
import { routeOwnsTahoeScene } from "@/lib/tahoe-glass/route-boundaries";

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

const V4_SIRI_SCENE = {
  kind: "image",
  src: "/siri-gradient.png",
  fit: "cover",
  label: "siri-gradient",
} as const satisfies TahoeV4SceneSource;

const V4_CLOUD_SCENE = {
  kind: "clouds",
  label: "vanta-clouds-v4",
  horizonOffset: 0.6,
  speed: 0.5,
  renderScale: 0.75,
  cameraInput: [0, 0],
  palette: {
    sky: 0x586e91,
    cloud: 0xadcdde,
    shadow: 0x183550,
    sun: 0xff9919,
    glare: 0xff6633,
    sunlight: 0xff9933,
  },
} as const satisfies TahoeV4SceneSource;

const V4_CLOUD_FALLBACK = (
  <div
    className="h-full w-full"
    style={{
      background:
        "linear-gradient(180deg, #8f98ab 0%, #8996ae 48%, #d8dfd3 66%, #b9d6d2 100%)",
    }}
  />
);

export default function NSSOTahoeGlassEnvironment({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const rollout = useTahoeV4Rollout();
  const vantaCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const scenePolicy = tahoeV4RouteScenePolicy(pathname);
  const usesSiriScene = scenePolicy === "siri-image";

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

  if (routeOwnsTahoeScene(pathname) || scenePolicy === "fixture-owned") {
    return <>{children}</>;
  }

  if (rollout.enabled) {
    const v4Scene: TahoeV4SceneSource = rollout.forceMaterialOnly
      ? {
          kind: "material-only",
          label: usesSiriScene ? "siri-gradient" : "vanta-clouds-v4",
          reason: "global-material-only-kill-switch",
        }
      : usesSiriScene
        ? V4_SIRI_SCENE
        : V4_CLOUD_SCENE;

    return (
      <TahoeGlassV4Provider
        className="min-h-screen"
        contentClassName="min-h-screen"
        scene={v4Scene}
        sceneFallback={usesSiriScene ? SIRI_SCENE : V4_CLOUD_FALLBACK}
        killSwitch={rollout.forceMaterialOnly}
        debug={rollout.debug}
        maxDpr={1}
        maxFps={30}
      >
        <DimmingOverlay />
        <div className="relative z-[1] min-h-screen">{children}</div>
      </TahoeGlassV4Provider>
    );
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
