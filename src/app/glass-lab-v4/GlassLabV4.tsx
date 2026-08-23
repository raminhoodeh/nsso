"use client";

import * as React from "react";

import { TahoeGlassV4Provider } from "@/components/providers/TahoeGlassV4Provider";
import {
  TahoeGlassV4Button,
  TahoeGlassV4Surface,
  useTahoeGlassV4Controls,
  useTahoeGlassV4Diagnostics,
  type TahoeGlassV4SurfaceVariant,
} from "@/components/ui/tahoe-glass-v4";
import type {
  TahoeV4Diagnostics,
  TahoeV4SceneSource,
} from "@/lib/tahoe-glass/v4";
import {
  createSurfaceInteriorMask,
  DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS,
  evaluateRuntimeOpticalProof,
  evaluateRuntimeRefraction,
  GLASS_LAB_SCENES,
  GLASS_LAB_SURFACES,
  getGlassLabScene,
  getGlassLabSurface,
  inspectRuntimeMaterial,
  inspectRuntimeSourceParity,
  rasterizeGlassLabSource,
  readTahoeV4WebGlFrame,
  type GlassLabLifecycleMode,
  type GlassLabRenderMode,
  type GlassLabSceneId,
  type GlassLabSurfaceFixture,
  type GlassLabSurfaceId,
  type RuntimeMaterialInspection,
  type RuntimeOpticalProofInspection,
  type RuntimeRefractionMeasurement,
  type RuntimeSourceParityInspection,
} from "@/lib/tahoe-glass/v4-testing";

type AcceptanceStatus = "pending" | "pass" | "fail";
type AcceptanceQualification =
  | "strict-checker"
  | "stress-proof"
  | "material-contract";
type PixelEvaluatorStatus =
  | "pending"
  | "complete"
  | "failed"
  | "unavailable"
  | "not-applicable";

interface GlassLabAcceptanceResult {
  key: string;
  status: AcceptanceStatus;
  label: string;
  qualification: AcceptanceQualification;
  pixelEvaluatorStatus: PixelEvaluatorStatus;
  pixelEvaluatorReason: string | null;
  diagnostics: TahoeV4Diagnostics;
  proof: RuntimeOpticalProofInspection | null;
  measurement: RuntimeRefractionMeasurement | null;
  material: RuntimeMaterialInspection | null;
  sourceParity: RuntimeSourceParityInspection | null;
  failures: readonly string[];
}

const LIFECYCLE_OPTIONS: readonly {
  id: GlassLabLifecycleMode;
  label: string;
  description: string;
}[] = [
  {
    id: "active",
    label: "Active refraction",
    description: "Normal production renderer and selected deterministic source.",
  },
  {
    id: "loading",
    label: "Source loading",
    description: "A deterministic unresolved source verifies the material-first state.",
  },
  {
    id: "failure",
    label: "Kill-switch fallback",
    description: "Immediate renderer fallback; the material body must remain visible.",
  },
  {
    id: "material-only",
    label: "Material only",
    description: "No refractive renderer; the canonical material remains present.",
  },
] as const;

const NULL_VIDEO_SOURCE = () => null;

function acceptanceKey(
  sceneId: GlassLabSceneId,
  surfaceId: GlassLabSurfaceId,
  lifecycle: GlassLabLifecycleMode,
): string {
  return `${sceneId}:${surfaceId}:${lifecycle}`;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function cssBackgroundSize(
  fit: ReturnType<typeof getGlassLabScene>["fit"],
): string {
  return fit === "stretch" ? "100% 100%" : fit;
}

function lifecycleScene(
  lifecycle: GlassLabLifecycleMode,
  selectedScene: ReturnType<typeof getGlassLabScene>,
): TahoeV4SceneSource {
  if (lifecycle === "loading") {
    return {
      kind: "video",
      label: "glass-lab-v4-unresolved-source",
      getElement: NULL_VIDEO_SOURCE,
      fit: "cover",
      position: [0.5, 0.5],
    };
  }
  if (lifecycle === "material-only") {
    return {
      kind: "material-only",
      label: "glass-lab-v4-material-only",
      reason: "visual-material-contract",
    };
  }
  return {
    kind: "image",
    label: `glass-lab-v4-${selectedScene.id}`,
    src: selectedScene.src,
    crossOrigin: "anonymous",
    fit: selectedScene.fit,
    position: selectedScene.position,
  };
}

function surfaceVariant(
  fixture: GlassLabSurfaceFixture,
): TahoeGlassV4SurfaceVariant {
  if (fixture.id === "control") return "button";
  if (fixture.id === "menu") return "menu";
  if (fixture.id === "nav") return "panel";
  return "card";
}

function DiagnosticsReadout({ hidden }: { hidden: boolean }) {
  const diagnostics = useTahoeGlassV4Diagnostics();
  if (hidden) return null;
  return (
    <output
      className="pointer-events-none absolute bottom-3 left-3 right-3 z-50 rounded-xl border border-white/20 bg-black/80 px-3 py-2 font-mono text-[10px] leading-4 text-white shadow-xl"
      data-testid="glass-lab-v4-diagnostics-refraction"
      data-lifecycle={diagnostics.lifecycle}
      data-backend={diagnostics.backend}
      data-source={diagnostics.sourceKind}
      data-frame-presented={diagnostics.framePresented}
      data-proof-samples={diagnostics.sampleCount}
      data-proof-changed={diagnostics.changedCount}
      data-proof-mean-delta={diagnostics.meanDelta}
      data-proof-max-delta={diagnostics.maxDelta}
    >
      {diagnostics.lifecycle} · {diagnostics.backend} · {diagnostics.sourceKind}
      {" · "}
      {diagnostics.framePresented ? "frame presented" : "no presented frame"}
      {" · proof "}
      {diagnostics.changedCount}/{diagnostics.sampleCount}
      {` · mean ${diagnostics.meanDelta.toFixed(2)} · max ${diagnostics.maxDelta.toFixed(2)}`}
      {diagnostics.reason ? ` · ${diagnostics.reason}` : ""}
    </output>
  );
}

function RuntimeAcceptanceProbe({
  fixture,
  scene,
  lifecycle,
  onResult,
}: {
  fixture: GlassLabSurfaceFixture;
  scene: ReturnType<typeof getGlassLabScene>;
  lifecycle: GlassLabLifecycleMode;
  onResult: (result: GlassLabAcceptanceResult) => void;
}) {
  const markerRef = React.useRef<HTMLSpanElement | null>(null);
  const diagnostics = useTahoeGlassV4Diagnostics();
  const { requestRender } = useTahoeGlassV4Controls();
  const resultKey = acceptanceKey(scene.id, fixture.id, lifecycle);

  React.useEffect(() => {
    let cancelled = false;
    let timeout: number | null = null;
    const qualification: AcceptanceQualification =
      lifecycle !== "active"
        ? "material-contract"
        : scene.id === "checker"
          ? "strict-checker"
          : "stress-proof";

    const publish = (result: Omit<GlassLabAcceptanceResult, "key">) => {
      if (!cancelled) onResult({ key: resultKey, ...result });
    };
    const inspectPresentation = () => {
      const root = document.querySelector<HTMLElement>(
        '[data-testid="glass-lab-v4"]',
      );
      const materialOnly = inspectRuntimeMaterial(
        root?.querySelector('[data-testid="glass-lab-v4-material-surface"]') ??
          null,
      );
      const refractiveMaterial = inspectRuntimeMaterial(
        root?.querySelector(
          '[data-testid="glass-lab-v4-refraction-surface"]',
        ) ?? null,
      );
      const material: RuntimeMaterialInspection = {
        pass: materialOnly.pass && refractiveMaterial.pass,
        backgroundColor: `M ${materialOnly.backgroundColor}; R ${refractiveMaterial.backgroundColor}`,
        backdropFilter: `M ${materialOnly.backdropFilter}; R ${refractiveMaterial.backdropFilter}`,
        failures: [
          ...materialOnly.failures.map((failure) => `M: ${failure}`),
          ...refractiveMaterial.failures.map((failure) => `R: ${failure}`),
        ],
      };
      const sourceParity = root
        ? inspectRuntimeSourceParity(root, scene)
        : {
            pass: false,
            failures: ["Glass lab root is missing."],
          };
      return { material, sourceParity };
    };

    const pending = () => {
      const { material, sourceParity } = inspectPresentation();
      publish({
        status: "pending",
        label: "Measuring live renderer",
        qualification,
        pixelEvaluatorStatus:
          qualification === "strict-checker" ? "pending" : "not-applicable",
        pixelEvaluatorReason: null,
        diagnostics,
        proof: null,
        measurement: null,
        material,
        sourceParity,
        failures: [],
      });
    };

    const finishNonActiveLifecycle = () => {
      const { material, sourceParity } = inspectPresentation();
      const failures = [...material.failures, ...sourceParity.failures];
      if (diagnostics.framePresented) {
        failures.push("Fallback lifecycle unexpectedly presented a refractive frame.");
      }
      if (lifecycle === "loading") {
        if (diagnostics.lifecycle !== "source-loading") {
          failures.push(
            `Expected source-loading, received ${diagnostics.lifecycle}.`,
          );
        }
      } else if (
        diagnostics.lifecycle !== "fallback" ||
        diagnostics.backend !== "material-only"
      ) {
        failures.push(
          `Expected material-only fallback, received ${diagnostics.lifecycle}/${diagnostics.backend}.`,
        );
      }
      publish({
        status: failures.length === 0 ? "pass" : "fail",
        label:
          failures.length === 0
            ? "Fallback material contract passed"
            : "Fallback material contract failed",
        qualification,
        pixelEvaluatorStatus: "not-applicable",
        pixelEvaluatorReason: null,
        diagnostics,
        proof: null,
        measurement: null,
        material,
        sourceParity,
        failures,
      });
    };

    const runActiveGate = async () => {
      const { material, sourceParity } = inspectPresentation();
      const proof = evaluateRuntimeOpticalProof(diagnostics);
      const failures = [
        ...material.failures,
        ...sourceParity.failures,
        ...proof.failures,
      ];
      if (failures.length > 0) {
        publish({
          status: "fail",
          label:
            qualification === "strict-checker"
              ? "Checker optical proof failed"
              : "Stress optical proof failed · NOT GEOMETRY-GATED",
          qualification,
          pixelEvaluatorStatus:
            qualification === "strict-checker" ? "unavailable" : "not-applicable",
          pixelEvaluatorReason:
            qualification === "strict-checker"
              ? "Renderer proof did not qualify, so optional checker geometry was not run."
              : null,
          diagnostics,
          proof,
          measurement: null,
          material,
          sourceParity,
          failures,
        });
        return;
      }

      if (qualification === "stress-proof") {
        publish({
          status: "pass",
          label: "Stress optical proof passed · NOT GEOMETRY-GATED",
          qualification,
          pixelEvaluatorStatus: "not-applicable",
          pixelEvaluatorReason:
            "Photo and frozen-cloud fixtures use renderer optical-delta proof; strict target-color geometry belongs to the Calibration grid.",
          diagnostics,
          proof,
          measurement: null,
          material,
          sourceParity,
          failures,
        });
        return;
      }

      const provider = markerRef.current?.closest<HTMLElement>(
        '[data-tahoe-glass-v4-provider="true"]',
      );
      const canvas = provider?.querySelector<HTMLCanvasElement>(
        'canvas[data-tahoe-glass-v4-refraction-layer="true"]',
      );
      if (!canvas) {
        publish({
          status: "pending",
          label: "Checker UNQUALIFIED · readback unavailable",
          qualification,
          pixelEvaluatorStatus: "unavailable",
          pixelEvaluatorReason: "glass-lab-live-refraction-canvas-missing",
          diagnostics,
          proof,
          measurement: null,
          material,
          sourceParity,
          failures,
        });
        return;
      }

      let liveFrame: ReturnType<typeof readTahoeV4WebGlFrame> | null = null;
      let captureFailure: unknown = null;
      for (let attempt = 0; attempt < 3 && !liveFrame; attempt += 1) {
        try {
          requestRender(`glass-lab-runtime-capture-${attempt + 1}`);
          // Provider scheduling occupies the first RAF; its callback schedules
          // the renderer RAF. Read synchronously after that second callback,
          // before the browser composites/discards the non-preserved buffer.
          await nextAnimationFrame();
          await nextAnimationFrame();
          liveFrame = readTahoeV4WebGlFrame(canvas);
        } catch (error: unknown) {
          captureFailure = error;
        }
      }
      if (!liveFrame) {
        const reason =
          captureFailure instanceof Error
            ? captureFailure.message
            : "glass-lab-live-frame-capture-unavailable";
        publish({
          status: "pending",
          label: "Checker UNQUALIFIED · readback unavailable",
          qualification,
          pixelEvaluatorStatus: "unavailable",
          pixelEvaluatorReason: reason,
          diagnostics,
          proof,
          measurement: null,
          material,
          sourceParity,
          failures,
        });
        return;
      }

      try {
        const bareFrame = await rasterizeGlassLabSource({
          scene,
          width: liveFrame.width,
          height: liveFrame.height,
        });
        const dpr = liveFrame.width / Math.max(1, fixture.width);
        const measurement = evaluateRuntimeRefraction({
          bare: bareFrame,
          refraction: liveFrame,
          mask: createSurfaceInteriorMask({
            cssWidth: fixture.width,
            cssHeight: fixture.height,
            radiusCssPx: fixture.radius,
            devicePixelRatio: dpr,
            insetCssPx: 4,
          }),
          probes: fixture.probes,
          devicePixelRatio: dpr,
        });
        failures.push(...measurement.failures);
        publish({
          status: measurement.pass ? "pass" : "fail",
          label:
            measurement.pass
              ? "Strict checker geometry passed"
              : "Strict checker geometry failed",
          qualification,
          pixelEvaluatorStatus: measurement.pass ? "complete" : "failed",
          pixelEvaluatorReason: null,
          diagnostics,
          proof,
          measurement,
          material,
          sourceParity,
          failures,
        });
      } catch (error: unknown) {
        publish({
          status: "pending",
          label: "Checker UNQUALIFIED · evaluator unavailable",
          qualification,
          pixelEvaluatorStatus: "unavailable",
          pixelEvaluatorReason:
            error instanceof Error
              ? error.message
              : "glass-lab-checker-evaluator-unavailable",
          diagnostics,
          proof,
          measurement: null,
          material,
          sourceParity,
          failures,
        });
      }
    };
    const runActiveGateSafely = () => {
      void runActiveGate().catch((error: unknown) => {
        const { material, sourceParity } = inspectPresentation();
        const proof = evaluateRuntimeOpticalProof(diagnostics);
        const failures = [
          ...material.failures,
          ...sourceParity.failures,
          ...proof.failures,
          error instanceof Error ? error.message : "Unknown live gate failure.",
        ];
        publish({
          status: "fail",
          label: "Live acceptance gate failed",
          qualification,
          pixelEvaluatorStatus:
            qualification === "strict-checker" ? "unavailable" : "not-applicable",
          pixelEvaluatorReason:
            error instanceof Error ? error.message : "Unknown live gate failure.",
          diagnostics,
          proof,
          measurement: null,
          material,
          sourceParity,
          failures,
        });
      });
    };

    pending();
    if (lifecycle !== "active") {
      const expectedStateReached =
        lifecycle === "loading"
          ? diagnostics.lifecycle === "source-loading"
          : diagnostics.lifecycle === "fallback";
      if (expectedStateReached) finishNonActiveLifecycle();
      else timeout = window.setTimeout(finishNonActiveLifecycle, 2_000);
    } else if (diagnostics.lifecycle === "fallback") {
      runActiveGateSafely();
    } else if (
      diagnostics.lifecycle === "refraction-presented" &&
      diagnostics.framePresented
    ) {
      runActiveGateSafely();
    } else {
      timeout = window.setTimeout(runActiveGateSafely, 6_000);
    }

    return () => {
      cancelled = true;
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [diagnostics, fixture, lifecycle, onResult, requestRender, resultKey, scene]);

  return (
    <span
      ref={markerRef}
      hidden
      data-testid="glass-lab-v4-runtime-acceptance-probe"
    />
  );
}

function SurfaceContents({
  fixture,
  mode,
  hidden,
}: {
  fixture: GlassLabSurfaceFixture;
  mode: GlassLabRenderMode;
  hidden: boolean;
}) {
  if (fixture.id === "nested") {
    const inner = (
      <span className="flex h-[60px] w-[180px] items-center justify-between gap-8 px-5 text-sm font-bold">
        {hidden ? <span className="sr-only">Nested lens</span> : "Nested action"}
        {!hidden && <span aria-hidden="true">→</span>}
      </span>
    );
    return (
      <div className="flex h-full flex-col items-center justify-end gap-8 p-9">
        {!hidden && (
          <div className="self-stretch">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
              Nested optics
            </p>
            <h2 className="mt-4 max-w-sm text-4xl font-bold tracking-tight">
              Both lenses must remain individually observable.
            </h2>
          </div>
        )}
        {mode === "bare" ? (
          <div className="relative h-[60px] w-[180px] rounded-full">{inner}</div>
        ) : (
          <TahoeGlassV4Button
            profile={mode === "material" ? "material-only" : "control"}
            className="h-[60px] w-[180px]"
            data-testid={`glass-lab-v4-${mode}-nested-control`}
          >
            {inner}
          </TahoeGlassV4Button>
        )}
      </div>
    );
  }

  if (hidden) return null;

  if (fixture.id === "control") {
    return (
      <span className="flex items-center gap-2 font-semibold">
        Generate
        <span aria-hidden="true">⚡</span>
      </span>
    );
  }

  if (fixture.id === "nav") {
    return (
      <div className="flex h-full items-center justify-between px-8">
        <span className="text-2xl font-black tracking-[-0.08em]">NSSO</span>
        <span className="flex gap-7 text-sm font-semibold">
          <span>Network</span>
          <span>Places</span>
          <span>Razinflix</span>
        </span>
        <span className="rounded-full border border-white/45 px-5 py-2 text-xs font-bold">
          Sign in
        </span>
      </div>
    );
  }

  if (fixture.id === "menu") {
    return (
      <div className="flex h-full flex-col gap-3 p-7">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
          NSSO Menu
        </p>
        {["My network", "Saved places", "Razinflix", "Settings"].map(
          (item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold"
            >
              {item}
            </div>
          ),
        )}
        <p className="mt-auto text-xs leading-5 text-white/75">
          The straight calibration features behind this menu must visibly bend.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between p-8 sm:p-10">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
          {fixture.label}
        </p>
        <h2 className="mt-5 max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
          The glass must bend the world behind it.
        </h2>
        <p className="mt-5 max-w-lg text-base leading-7 text-white/85">
          Tint and blur are material. Visible edge translation is refraction. This
          fixture requires both.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/25 bg-black/15 p-4 text-sm">
          25% canonical material
        </div>
        <div className="rounded-2xl border border-white/25 bg-black/15 p-4 text-sm">
          Size-specific lens profile
        </div>
      </div>
    </div>
  );
}

function BareSurface({
  fixture,
  hideContent,
}: {
  fixture: GlassLabSurfaceFixture;
  hideContent: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-10 text-white"
      style={{ borderRadius: fixture.radius }}
      data-testid="glass-lab-v4-bare-surface"
      data-lab-mode="bare"
    >
      <SurfaceContents fixture={fixture} mode="bare" hidden={hideContent} />
    </div>
  );
}

function MaterialSurface({
  fixture,
  hideContent,
}: {
  fixture: GlassLabSurfaceFixture;
  hideContent: boolean;
}) {
  return (
    <TahoeGlassV4Surface
      variant={surfaceVariant(fixture)}
      profile="material-only"
      radius={fixture.radius}
      className="absolute inset-0 h-full w-full text-white"
      data-testid="glass-lab-v4-material-surface"
      data-lab-mode="material"
    >
      <SurfaceContents fixture={fixture} mode="material" hidden={hideContent} />
    </TahoeGlassV4Surface>
  );
}

function RefractiveSurface({
  fixture,
  hideContent,
}: {
  fixture: GlassLabSurfaceFixture;
  hideContent: boolean;
}) {
  return (
    <TahoeGlassV4Surface
      variant={surfaceVariant(fixture)}
      profile={fixture.profile}
      radius={fixture.radius}
      className="absolute inset-0 h-full w-full text-white"
      data-testid="glass-lab-v4-refraction-surface"
      data-lab-mode="refraction"
    >
      <SurfaceContents fixture={fixture} mode="refraction" hidden={hideContent} />
    </TahoeGlassV4Surface>
  );
}

function SceneStage({
  mode,
  fixture,
  scene,
  lifecycle,
  hideContent,
  hideDiagnostics,
  onAcceptance,
}: {
  mode: GlassLabRenderMode;
  fixture: GlassLabSurfaceFixture;
  scene: ReturnType<typeof getGlassLabScene>;
  lifecycle: GlassLabLifecycleMode;
  hideContent: boolean;
  hideDiagnostics: boolean;
  onAcceptance: (result: GlassLabAcceptanceResult) => void;
}) {
  const source = React.useMemo(
    () => lifecycleScene(lifecycle, scene),
    [lifecycle, scene],
  );
  const stageStyle: React.CSSProperties = {
    width: fixture.width,
    height: fixture.height,
    backgroundImage:
      mode === "refraction" ? undefined : `url(${JSON.stringify(scene.src)})`,
    backgroundColor: mode === "refraction" ? "transparent" : "#65728b",
    backgroundPosition: `${scene.position[0] * 100}% ${scene.position[1] * 100}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: cssBackgroundSize(scene.fit),
  };
  const stage = (
    <div
      className="relative isolate overflow-hidden bg-[#65728b]"
      style={stageStyle}
      data-testid={`glass-lab-v4-capture-${mode}`}
      data-lab-scene={scene.id}
      data-lab-source={scene.src}
      data-lab-fit={scene.fit}
      data-lab-position={scene.position.join(",")}
      data-lab-surface={fixture.id}
      data-lab-width={fixture.width}
      data-lab-height={fixture.height}
      data-lab-lifecycle={mode === "refraction" ? lifecycle : "not-applicable"}
    >
      {mode === "bare" && (
        <BareSurface fixture={fixture} hideContent={hideContent} />
      )}
      {mode === "material" && (
        <MaterialSurface fixture={fixture} hideContent={hideContent} />
      )}
      {mode === "refraction" && (
        <>
          <RefractiveSurface fixture={fixture} hideContent={hideContent} />
          <DiagnosticsReadout hidden={hideDiagnostics} />
        </>
      )}
    </div>
  );

  if (mode === "bare") return stage;

  if (mode === "material") {
    return (
      <TahoeGlassV4Provider
        key={`${scene.id}-${fixture.id}-material`}
        scene={source}
        enabled={false}
        viewportMode="absolute"
        maxDpr={1}
        className="relative overflow-hidden"
        style={{ width: fixture.width, height: fixture.height }}
        contentClassName="h-full w-full"
        data-testid="glass-lab-v4-provider-material"
      >
        {stage}
      </TahoeGlassV4Provider>
    );
  }

  const enabled = lifecycle === "active" || lifecycle === "loading";
  return (
    <TahoeGlassV4Provider
      key={`${scene.id}-${fixture.id}-${lifecycle}`}
      scene={source}
      enabled={enabled}
      killSwitch={lifecycle === "failure"}
      viewportMode="absolute"
      maxDpr={1}
      sourceTimeoutMs={86_400_000}
      className="relative overflow-hidden"
      style={{ width: fixture.width, height: fixture.height }}
      sceneStyle={{
        backgroundImage: `url(${JSON.stringify(scene.src)})`,
        backgroundPosition: `${scene.position[0] * 100}% ${scene.position[1] * 100}%`,
        backgroundRepeat: "no-repeat",
        backgroundSize: cssBackgroundSize(scene.fit),
      }}
      contentClassName="h-full w-full"
      data-testid="glass-lab-v4-provider-refraction"
    >
      {stage}
      <RuntimeAcceptanceProbe
        fixture={fixture}
        scene={scene}
        lifecycle={lifecycle}
        onResult={onAcceptance}
      />
    </TahoeGlassV4Provider>
  );
}

function TriptychTile({
  mode,
  fixture,
  scene,
  lifecycle,
  hideContent,
  hideDiagnostics,
  onAcceptance,
}: {
  mode: GlassLabRenderMode;
  fixture: GlassLabSurfaceFixture;
  scene: ReturnType<typeof getGlassLabScene>;
  lifecycle: GlassLabLifecycleMode;
  hideContent: boolean;
  hideDiagnostics: boolean;
  onAcceptance: (result: GlassLabAcceptanceResult) => void;
}) {
  const labels: Record<GlassLabRenderMode, readonly [string, string]> = {
    bare: ["B · Bare", "Owned scene pixels only"],
    material: ["M · Material", "25% body, lighting, blur and rim; no displacement"],
    refraction: ["R · Refraction", "Identical material plus the V4 lens renderer"],
  };
  return (
    <article
      className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.035] p-3"
      data-testid={`glass-lab-v4-tile-${mode}`}
    >
      <header className="mb-3 flex min-h-12 items-start justify-between gap-4 px-2">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.18em]">
            {labels[mode][0]}
          </h2>
          <p className="mt-1 text-xs leading-4 text-white/55">{labels[mode][1]}</p>
        </div>
        <span className="rounded-full border border-white/15 bg-black/30 px-2 py-1 font-mono text-[10px] text-white/70">
          {fixture.width}×{fixture.height}
        </span>
      </header>
      <div className="max-h-[680px] overflow-auto rounded-2xl border border-white/15 bg-black/30">
        <SceneStage
          mode={mode}
          fixture={fixture}
          scene={scene}
          lifecycle={lifecycle}
          hideContent={hideContent}
          hideDiagnostics={hideDiagnostics}
          onAcceptance={onAcceptance}
        />
      </div>
    </article>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  testIdPrefix,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
  testIdPrefix: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={
              option.id === value
                ? "rounded-full border border-cyan-200 bg-cyan-200 px-3 py-2 text-xs font-bold text-slate-950"
                : "rounded-full border border-white/15 bg-white/[0.045] px-3 py-2 text-xs font-bold text-white/75 hover:bg-white/10"
            }
            aria-pressed={option.id === value}
            data-testid={`${testIdPrefix}-${option.id}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AcceptanceGate({
  result,
  currentKey,
}: {
  result: GlassLabAcceptanceResult | null;
  currentKey: string;
}) {
  const current = result?.key === currentKey ? result : null;
  const status = current?.status ?? "pending";
  const passing = status === "pass";
  const failing = status === "fail";
  const label = current?.label ?? "Waiting for live renderer";
  const measurement = current?.measurement;
  const proof = current?.proof;
  const pixelEvaluatorStatus = current?.pixelEvaluatorStatus ?? "pending";
  const verdict =
    status === "pending" && pixelEvaluatorStatus === "unavailable"
      ? "UNQUALIFIED"
      : status.toUpperCase();
  const statusClass = passing
    ? "border-emerald-300 bg-emerald-300 text-emerald-950"
    : failing
      ? "border-rose-300 bg-rose-300 text-rose-950"
      : "border-amber-200 bg-amber-200 text-amber-950";

  return (
    <section
      className="border-b border-white/10 bg-[#080b12] px-5 py-6 sm:px-8"
      data-testid="glass-lab-v4-acceptance-gate"
      data-acceptance-status={status}
      data-acceptance-qualification={current?.qualification ?? "pending"}
      data-runtime-pixel-evaluator={pixelEvaluatorStatus}
    >
      <div className="mx-auto max-w-[1680px] rounded-3xl border border-white/15 bg-white/[0.04] p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">
              Live acceptance gate
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-4xl">
              {label}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              The required gate consumes the renderer&apos;s displaced-versus-control
              GPU proof, inspects the computed DOM material, and verifies B/M/R
              source parity. The Calibration grid additionally runs strict
              full-frame geometry when the non-preserved drawing buffer is readable.
            </p>
          </div>
          <output
            className={`min-w-40 rounded-2xl border px-6 py-4 text-center text-3xl font-black tracking-[0.12em] ${statusClass}`}
            data-testid="glass-lab-v4-acceptance-verdict"
            aria-live="polite"
          >
            {verdict}
          </output>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Runtime</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {current
                ? `${current.diagnostics.lifecycle} / ${current.diagnostics.backend}`
                : "pending"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">GPU proof</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {proof
                ? `${proof.pass ? "PASS" : "FAIL"} · ${proof.changedCount}/${proof.sampleCount}`
                : current?.qualification === "material-contract"
                  ? "N/A"
                  : "pending"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Proof mean Δ</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {proof ? proof.meanDelta.toFixed(2) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Proof max Δ</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {proof ? proof.maxDelta.toFixed(2) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Pixel evaluator</p>
            <p className="mt-1 font-mono text-xs uppercase text-white/90">
              {pixelEvaluatorStatus}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Checker JND</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {measurement
                ? `${(measurement.refraction.jndRatio * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Checker shift</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {measurement
                ? `${measurement.maximumProbeShiftCssPx.toFixed(2)}px · ${measurement.visibleLensProbeCount}/${DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS.minimumLensProbeCount} probes`
                : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Material</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {current?.material
                ? current.material.pass
                  ? "PASS"
                  : "FAIL"
                : "pending"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Source parity</p>
            <p className="mt-1 font-mono text-xs text-white/90">
              {current?.sourceParity
                ? current.sourceParity.pass
                  ? "PASS"
                  : "FAIL"
                : "pending"}
            </p>
          </div>
        </div>

        {current?.pixelEvaluatorReason && (
          <p
            className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-200/10 p-4 font-mono text-xs leading-5 text-amber-50"
            data-testid="glass-lab-v4-pixel-evaluator-note"
          >
            {current.pixelEvaluatorReason}
          </p>
        )}

        {current && current.failures.length > 0 && (
          <ul
            className="mt-5 space-y-2 rounded-2xl border border-rose-300/35 bg-rose-400/10 p-4 text-sm text-rose-100"
            data-testid="glass-lab-v4-acceptance-failures"
          >
            {current.failures.map((failure) => (
              <li key={failure}>• {failure}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function GlassLabV4() {
  const [sceneId, setSceneId] = React.useState<GlassLabSceneId>("checker");
  const [surfaceId, setSurfaceId] =
    React.useState<GlassLabSurfaceId>("mobile-card");
  const [lifecycle, setLifecycle] =
    React.useState<GlassLabLifecycleMode>("active");
  const [measurementMode, setMeasurementMode] = React.useState(false);
  const [acceptanceResult, setAcceptanceResult] =
    React.useState<GlassLabAcceptanceResult | null>(null);
  const scene = getGlassLabScene(sceneId);
  const fixture = getGlassLabSurface(surfaceId);
  const currentAcceptanceKey = acceptanceKey(sceneId, surfaceId, lifecycle);
  const receiveAcceptance = React.useCallback(
    (result: GlassLabAcceptanceResult) => setAcceptanceResult(result),
    [],
  );
  const lifecycleDescription = LIFECYCLE_OPTIONS.find(
    (option) => option.id === lifecycle,
  )?.description;

  return (
    <main
      className="min-h-[100dvh] bg-[#080b12] text-white"
      data-testid="glass-lab-v4"
      data-glass-lab-v4-ready="true"
      data-scene={sceneId}
      data-surface={surfaceId}
      data-lifecycle={lifecycle}
      data-measurement-mode={measurementMode}
    >
      <header className="border-b border-white/10 bg-[#0c111c] px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-[1680px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
            Preview-only deterministic fixture
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                Tahoe Glass V4 visual truth gate
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 sm:text-base">
                B/M/R isolates the material body from displacement. The owned
                scene is refracted; DOM content is foreground and must stay crisp.
                Renderer optical-delta diagnostics are the runtime proof; the
                Calibration grid adds strict geometric pixel qualification.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMeasurementMode((current) => !current)}
              className={
                measurementMode
                  ? "rounded-full border border-amber-200 bg-amber-200 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-950"
                  : "rounded-full border border-white/20 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white"
              }
              aria-pressed={measurementMode}
              data-testid="glass-lab-v4-measurement-mode"
            >
              {measurementMode ? "Measurement mode on" : "Hide content for measurement"}
            </button>
          </div>
        </div>
      </header>

      <AcceptanceGate
        result={acceptanceResult}
        currentKey={currentAcceptanceKey}
      />

      <section className="border-b border-white/10 bg-black/20 px-5 py-5 sm:px-8">
        <div className="mx-auto grid max-w-[1680px] gap-5 xl:grid-cols-[1.1fr_1.4fr_1.4fr]">
          <ChoiceGroup
            label="Scene"
            value={sceneId}
            options={GLASS_LAB_SCENES}
            onChange={setSceneId}
            testIdPrefix="glass-lab-v4-scene"
          />
          <ChoiceGroup
            label="Surface"
            value={surfaceId}
            options={GLASS_LAB_SURFACES}
            onChange={setSurfaceId}
            testIdPrefix="glass-lab-v4-surface"
          />
          <ChoiceGroup
            label="Refraction lifecycle"
            value={lifecycle}
            options={LIFECYCLE_OPTIONS}
            onChange={setLifecycle}
            testIdPrefix="glass-lab-v4-lifecycle"
          />
        </div>
      </section>

      <section className="px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-[1680px]">
          <div className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-xs leading-5 text-white/65 md:grid-cols-3">
            <p>
              <strong className="text-white">Scene:</strong> {scene.description}
            </p>
            <p>
              <strong className="text-white">Surface:</strong> {fixture.description}
            </p>
            <p>
              <strong className="text-white">Lifecycle:</strong>{" "}
              {lifecycleDescription}
            </p>
          </div>

          <div
            className="grid gap-5 xl:grid-cols-3"
            data-testid="glass-lab-v4-triptych"
          >
            {(["bare", "material", "refraction"] as const).map((mode) => (
              <TriptychTile
                key={mode}
                mode={mode}
                fixture={fixture}
                scene={scene}
                lifecycle={lifecycle}
                hideContent={measurementMode}
                hideDiagnostics={measurementMode}
                onAcceptance={receiveAcceptance}
              />
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-6 text-xs text-white/55 sm:px-8">
        <div className="mx-auto grid max-w-[1680px] gap-3 md:grid-cols-2 xl:grid-cols-4">
          <p>
            Material JND floor: {DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS.minimumMaterialJndRatio * 100}%
          </p>
          <p>
            Refraction JND floor: {DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS.minimumRefractionJndRatio * 100}%
          </p>
          <p>
            Lens probes: {DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS.minimumLensProbeCount} at ≥{DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS.minimumLensProbeShiftCssPx}px
          </p>
          <p>
            Maximum edge movement: ≥{DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS.minimumMaximumProbeShiftCssPx}px
          </p>
        </div>
      </footer>
    </main>
  );
}
