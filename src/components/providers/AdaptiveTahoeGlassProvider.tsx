"use client";

import * as React from "react";

import {
  TahoeGlassProvider as LegacyTahoeGlassProvider,
  type TahoeGlassProviderProps as LegacyTahoeGlassProviderProps,
} from "@/components/providers/TahoeGlassProvider";
import { TahoeGlassV4Provider } from "@/components/providers/TahoeGlassV4Provider";
import { useTahoeV4Rollout } from "@/components/providers/TahoeV4RolloutGate";
import type { TahoeGlassDiagnostics } from "@/lib/tahoe-glass/types";
import type {
  TahoeV4Diagnostics,
  TahoeV4SceneSource,
} from "@/lib/tahoe-glass/v4";

export interface AdaptiveTahoeGlassProviderProps
  extends LegacyTahoeGlassProviderProps {
  /**
   * Explicit V4 source. Use this whenever the legacy source was a canvas or
   * DOM scene: V4 never guesses that arbitrary pixels are readable.
   */
  v4Scene?: TahoeV4SceneSource;
  v4SourceTimeoutMs?: number;
}

function legacySourceToV4(
  props: Pick<
    AdaptiveTahoeGlassProviderProps,
    "webglSource" | "sourceLabel"
  >,
): TahoeV4SceneSource {
  const source = props.webglSource;
  const label = source?.label || props.sourceLabel || "legacy-route-scene";

  if (!source) {
    return {
      kind: "material-only",
      label,
      reason: "route-has-no-readable-v4-source",
    };
  }
  if (source.kind === "image") {
    return {
      kind: "image",
      label,
      src: source.src,
      crossOrigin: source.crossOrigin,
      fit: source.fit,
      position: source.position,
    };
  }
  if (source.kind === "video") {
    return {
      kind: "video",
      label,
      getElement: () => {
        const element = source.getElement();
        return element instanceof HTMLVideoElement ? element : null;
      },
      fit: source.fit,
      position: source.position,
    };
  }

  return {
    kind: "material-only",
    label,
    reason: "legacy-cross-context-canvas-is-not-a-v4-scene-source",
  };
}

function legacyDiagnosticsFromV4(
  diagnostics: TahoeV4Diagnostics,
): TahoeGlassDiagnostics {
  const status =
    diagnostics.lifecycle === "refraction-presented"
      ? "active"
      : diagnostics.lifecycle === "fallback"
        ? "fallback"
        : "initializing";
  return {
    status,
    backend: diagnostics.backend === "webgl" ? "webgl" : "css-blur",
    source: diagnostics.sourceLabel,
    reason: diagnostics.reason,
    reducedMotion: diagnostics.reducedMotion,
    reducedTransparency: diagnostics.reducedTransparency,
    surfaceCount: diagnostics.surfaceCount,
    visibleSurfaceCount: diagnostics.refractiveSurfaceCount,
    dpr: diagnostics.dpr,
  };
}

/**
 * Compatibility bridge for the three route-owned legacy providers. V4 is
 * selected only by the explicit rollout gate; otherwise this is byte-for-byte
 * the existing provider path.
 */
export function AdaptiveTahoeGlassProvider({
  v4Scene,
  v4SourceTimeoutMs,
  scene,
  children,
  sceneClassName,
  sceneStyle,
  sourceLabel,
  sceneInteractive,
  preferredBackend,
  fallback,
  webglSource,
  respectReducedMotion,
  respectReducedTransparency,
  maxDpr,
  viewportMode,
  contentClassName,
  contentStyle,
  debug,
  onDiagnosticsChange,
  ...props
}: AdaptiveTahoeGlassProviderProps) {
  const rollout = useTahoeV4Rollout();
  const resolvedScene = React.useMemo<TahoeV4SceneSource>(
    () =>
      rollout.forceMaterialOnly
        ? {
            kind: "material-only",
            label: sourceLabel || "route-material-only",
            reason: "global-material-only-kill-switch",
          }
        : v4Scene ?? legacySourceToV4({ webglSource, sourceLabel }),
    [rollout.forceMaterialOnly, sourceLabel, v4Scene, webglSource],
  );

  if (!rollout.enabled) {
    return (
      <LegacyTahoeGlassProvider
        {...props}
        scene={scene}
        sceneClassName={sceneClassName}
        sceneStyle={sceneStyle}
        sourceLabel={sourceLabel}
        sceneInteractive={sceneInteractive}
        preferredBackend={preferredBackend}
        fallback={fallback}
        webglSource={webglSource}
        respectReducedMotion={respectReducedMotion}
        respectReducedTransparency={respectReducedTransparency}
        maxDpr={maxDpr}
        viewportMode={viewportMode}
        contentClassName={contentClassName}
        contentStyle={contentStyle}
        debug={debug}
        onDiagnosticsChange={onDiagnosticsChange}
      >
        {children}
      </LegacyTahoeGlassProvider>
    );
  }

  return (
    <TahoeGlassV4Provider
      {...props}
      scene={resolvedScene}
      enabled
      killSwitch={rollout.forceMaterialOnly}
      debug={debug || rollout.debug}
      maxDpr={maxDpr}
      sourceTimeoutMs={v4SourceTimeoutMs}
      viewportMode={viewportMode === "contained" ? "absolute" : "fixed"}
      sceneFallback={scene}
      sceneClassName={sceneClassName}
      sceneStyle={sceneStyle}
      sceneInteractive={sceneInteractive}
      contentClassName={contentClassName}
      contentStyle={contentStyle}
      onDiagnosticsChange={
        onDiagnosticsChange
          ? (diagnostics) =>
              onDiagnosticsChange(legacyDiagnosticsFromV4(diagnostics))
          : undefined
      }
    >
      {children}
    </TahoeGlassV4Provider>
  );
}
