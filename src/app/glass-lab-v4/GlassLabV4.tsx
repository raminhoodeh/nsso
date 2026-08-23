"use client";

import * as React from "react";

import { TahoeGlassV4Provider } from "@/components/providers/TahoeGlassV4Provider";
import {
  TahoeGlassV4Button,
  TahoeGlassV4Surface,
  useTahoeGlassV4Diagnostics,
  type TahoeGlassV4SurfaceVariant,
} from "@/components/ui/tahoe-glass-v4";
import type { TahoeV4SceneSource } from "@/lib/tahoe-glass/v4";
import {
  DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS,
  GLASS_LAB_SCENES,
  GLASS_LAB_SURFACES,
  getGlassLabScene,
  getGlassLabSurface,
  type GlassLabLifecycleMode,
  type GlassLabRenderMode,
  type GlassLabSceneId,
  type GlassLabSurfaceFixture,
  type GlassLabSurfaceId,
} from "@/lib/tahoe-glass/v4-testing";

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
    >
      {diagnostics.lifecycle} · {diagnostics.backend} · {diagnostics.sourceKind}
      {" · "}
      {diagnostics.framePresented ? "frame presented" : "no presented frame"}
      {diagnostics.reason ? ` · ${diagnostics.reason}` : ""}
    </output>
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
}: {
  mode: GlassLabRenderMode;
  fixture: GlassLabSurfaceFixture;
  scene: ReturnType<typeof getGlassLabScene>;
  lifecycle: GlassLabLifecycleMode;
  hideContent: boolean;
  hideDiagnostics: boolean;
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
}: {
  mode: GlassLabRenderMode;
  fixture: GlassLabSurfaceFixture;
  scene: ReturnType<typeof getGlassLabScene>;
  lifecycle: GlassLabLifecycleMode;
  hideContent: boolean;
  hideDiagnostics: boolean;
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

export default function GlassLabV4() {
  const [sceneId, setSceneId] = React.useState<GlassLabSceneId>("checker");
  const [surfaceId, setSurfaceId] =
    React.useState<GlassLabSurfaceId>("mobile-card");
  const [lifecycle, setLifecycle] =
    React.useState<GlassLabLifecycleMode>("active");
  const [measurementMode, setMeasurementMode] = React.useState(false);
  const scene = getGlassLabScene(sceneId);
  const fixture = getGlassLabSurface(surfaceId);
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
                Diagnostics are visible, but only final composited pixels qualify
                the visual result.
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
