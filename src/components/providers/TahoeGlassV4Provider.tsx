"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  calculateTahoeV4Rim,
  createTahoeV4CanonicalControlField,
  createTahoeV4RoundedEdgeLensField,
  detectTahoeV4EnvironmentCapabilities,
  tahoeV4RimCssVariables,
  TAHOE_V4_MAX_SURFACE_FIELD_PIXELS,
  TahoeV4Renderer,
  TahoeV4SurfaceRegistry,
  type TahoeV4Diagnostics,
  type TahoeV4CornerRadii,
  type TahoeV4DisplacementField,
  type TahoeV4Profile,
  type TahoeV4RimCssVariables,
  type TahoeV4SceneSource,
  type TahoeV4SurfaceSnapshot,
} from "@/lib/tahoe-glass/v4";
import {
  TahoeGlassV4Diagnostics as TahoeGlassV4DiagnosticsOverlay,
  type TahoeGlassV4DebugSurface,
} from "@/components/ui/tahoe-glass-v4/TahoeGlassV4Diagnostics";

export interface TahoeGlassV4SurfaceRegistration {
  id: string;
  element: HTMLElement;
  profile: TahoeV4Profile;
  radius: string;
  priority: number;
  continuous: boolean;
  variant: string;
}

interface TahoeGlassV4EngineContextValue {
  diagnostics: TahoeV4Diagnostics;
  registerSurface: (registration: TahoeGlassV4SurfaceRegistration) => void;
  unregisterSurface: (id: string) => void;
  requestRender: (reason?: string) => void;
  retry: () => void;
}

const MISSING_PROVIDER_DIAGNOSTICS: TahoeV4Diagnostics = {
  lifecycle: "material-ready",
  backend: "material-only",
  sourceKind: "material-only",
  sourceLabel: "missing-provider",
  reason: "missing-tahoe-glass-v4-provider",
  framePresented: false,
  sourceFrame: 0,
  presentedFrame: 0,
  mapRevision: 0,
  surfaceCount: 0,
  refractiveSurfaceCount: 0,
  dpr: 1,
  reducedMotion: false,
  reducedTransparency: false,
  forcedColors: false,
  enabled: false,
  contextLost: false,
  lastFrameMs: null,
  maxTextureSize: null,
};

export const TahoeGlassV4EngineContext =
  React.createContext<TahoeGlassV4EngineContextValue | null>(null);

export interface TahoeGlassV4ProviderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  scene: TahoeV4SceneSource;
  children?: React.ReactNode;
  /** Feature flag. Provider presence remains an explicit route opt-in. */
  enabled?: boolean;
  /** Emergency switch: immediately disposes optics but preserves material. */
  killSwitch?: boolean;
  debug?: boolean;
  maxDpr?: number;
  /** Caps dynamic scene and continuous-surface rendering. Defaults to 30. */
  maxFps?: number;
  sourceTimeoutMs?: number;
  viewportMode?: "fixed" | "absolute";
  sceneFallback?: React.ReactNode;
  /** Allows a material-only scene such as Google Maps to remain interactive. */
  sceneInteractive?: boolean;
  sceneClassName?: string;
  sceneStyle?: React.CSSProperties;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  onDiagnosticsChange?: (diagnostics: TahoeV4Diagnostics) => void;
}

export interface TahoeGlassV4Controls {
  requestRender: (reason?: string) => void;
  retry: () => void;
}

function sourceLabel(scene: TahoeV4SceneSource): string {
  return scene.label || scene.kind;
}

function materialOnlyDiagnostics(
  scene: TahoeV4SceneSource,
  reason: string | null,
  lifecycle: TahoeV4Diagnostics["lifecycle"],
  environment = detectTahoeV4EnvironmentCapabilities(),
): TahoeV4Diagnostics {
  return {
    ...MISSING_PROVIDER_DIAGNOSTICS,
    lifecycle,
    sourceKind: scene.kind,
    sourceLabel: sourceLabel(scene),
    reason,
    reducedMotion: environment.reducedMotion,
    reducedTransparency: environment.reducedTransparency,
    forcedColors: environment.forcedColors,
    dpr: environment.devicePixelRatio,
  };
}

function equivalentPresentationDiagnostics(
  current: TahoeV4Diagnostics,
  next: TahoeV4Diagnostics,
): boolean {
  return (
    current.lifecycle === next.lifecycle &&
    current.backend === next.backend &&
    current.sourceKind === next.sourceKind &&
    current.sourceLabel === next.sourceLabel &&
    current.reason === next.reason &&
    current.framePresented === next.framePresented &&
    current.surfaceCount === next.surfaceCount &&
    current.refractiveSurfaceCount === next.refractiveSurfaceCount &&
    current.dpr === next.dpr &&
    current.reducedMotion === next.reducedMotion &&
    current.reducedTransparency === next.reducedTransparency &&
    current.forcedColors === next.forcedColors &&
    current.enabled === next.enabled &&
    current.contextLost === next.contextLost &&
    current.maxTextureSize === next.maxTextureSize
  );
}

function resolvedCornerRadius(
  value: string,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
): number {
  const [horizontal = "0", vertical = horizontal] = value.split(/\s+/);
  const resolve = (token: string, axis: number) => {
    const parsed = Number.parseFloat(token);
    if (!Number.isFinite(parsed)) return 0;
    return token.endsWith("%") ? (parsed / 100) * axis : parsed;
  };
  return Math.max(
    0,
    Math.min(
      resolve(horizontal, width) * scaleX,
      resolve(vertical, height) * scaleY,
    ),
  );
}

function numericCornerRadii(element: HTMLElement): TahoeV4CornerRadii {
  const computed = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const layoutWidth = Math.max(1, element.offsetWidth || element.clientWidth);
  const layoutHeight = Math.max(1, element.offsetHeight || element.clientHeight);
  const scaleX = rect.width / layoutWidth;
  const scaleY = rect.height / layoutHeight;
  const radii: TahoeV4CornerRadii = {
    topLeft: resolvedCornerRadius(
      computed.borderTopLeftRadius,
      layoutWidth,
      layoutHeight,
      scaleX,
      scaleY,
    ),
    topRight: resolvedCornerRadius(
      computed.borderTopRightRadius,
      layoutWidth,
      layoutHeight,
      scaleX,
      scaleY,
    ),
    bottomRight: resolvedCornerRadius(
      computed.borderBottomRightRadius,
      layoutWidth,
      layoutHeight,
      scaleX,
      scaleY,
    ),
    bottomLeft: resolvedCornerRadius(
      computed.borderBottomLeftRadius,
      layoutWidth,
      layoutHeight,
      scaleX,
      scaleY,
    ),
  };
  const scale = Math.min(
    1,
    rect.width / Math.max(1, radii.topLeft + radii.topRight),
    rect.width / Math.max(1, radii.bottomLeft + radii.bottomRight),
    rect.height / Math.max(1, radii.topLeft + radii.bottomLeft),
    rect.height / Math.max(1, radii.topRight + radii.bottomRight),
  );
  return {
    topLeft: radii.topLeft * scale,
    topRight: radii.topRight * scale,
    bottomRight: radii.bottomRight * scale,
    bottomLeft: radii.bottomLeft * scale,
  };
}

function fallbackRimProfile(
  snapshot: TahoeV4SurfaceSnapshot,
  variant: string | undefined,
): Exclude<TahoeV4Profile, "material-only"> {
  if (snapshot.profile !== "material-only") return snapshot.profile;
  return variant === "button" ||
    variant === "pill" ||
    variant === "recessed"
    ? "control"
    : "edge-lens";
}

function applyFallbackRim(
  snapshot: TahoeV4SurfaceSnapshot,
  element: HTMLElement,
  variant: string | undefined,
  viewportWidth: number,
  viewportHeight: number,
  fieldCache: Map<string, TahoeV4DisplacementField>,
  rimCache: Map<string, TahoeV4RimCssVariables>,
): void {
  if (
    !snapshot.visible ||
    snapshot.rect.width <= 0 ||
    snapshot.rect.height <= 0
  ) {
    return;
  }
  const dpr = Math.max(
    0.25,
    Math.min(
      1,
      Math.sqrt(
        TAHOE_V4_MAX_SURFACE_FIELD_PIXELS /
          Math.max(1, snapshot.rect.width * snapshot.rect.height),
      ),
    ),
  );
  const profile = fallbackRimProfile(snapshot, variant);
  const fieldKey = [
    profile,
    snapshot.rect.width.toFixed(2),
    snapshot.rect.height.toFixed(2),
    dpr.toFixed(3),
    snapshot.cornerRadiiPx.topLeft.toFixed(2),
    snapshot.cornerRadiiPx.topRight.toFixed(2),
    snapshot.cornerRadiiPx.bottomRight.toFixed(2),
    snapshot.cornerRadiiPx.bottomLeft.toFixed(2),
    snapshot.edgeBandPx?.toFixed(2) ?? "auto",
  ].join(":");
  let field = fieldCache.get(fieldKey);
  if (!field) {
    field =
      profile === "control"
        ? createTahoeV4CanonicalControlField({
            width: snapshot.rect.width,
            height: snapshot.rect.height,
            dpr,
          })
        : createTahoeV4RoundedEdgeLensField({
            width: snapshot.rect.width,
            height: snapshot.rect.height,
            dpr,
            cornerRadiiPx: snapshot.cornerRadiiPx,
            edgeBandPx: snapshot.edgeBandPx,
          });
    fieldCache.set(fieldKey, field);
    while (fieldCache.size > 64) {
      const oldest = fieldCache.keys().next().value;
      if (typeof oldest !== "string") break;
      fieldCache.delete(oldest);
    }
  }
  const centerX =
    (snapshot.rect.x + snapshot.rect.width / 2) /
    Math.max(1, viewportWidth);
  const centerY =
    (snapshot.rect.y + snapshot.rect.height / 2) /
    Math.max(1, viewportHeight);
  const rimKey = `${fieldKey}:${centerX.toFixed(2)}:${centerY.toFixed(2)}`;
  let rim = rimCache.get(rimKey);
  if (!rim) {
    rim = tahoeV4RimCssVariables(
      calculateTahoeV4Rim(field, centerX, centerY),
    );
    rimCache.set(rimKey, rim);
    while (rimCache.size > 256) {
      const oldest = rimCache.keys().next().value;
      if (typeof oldest !== "string") break;
      rimCache.delete(oldest);
    }
  }
  for (const [property, value] of Object.entries(rim)) {
    element.style.setProperty(property, value);
  }
}

function imageFallbackStyle(
  scene: TahoeV4SceneSource,
): React.CSSProperties | undefined {
  if (scene.kind !== "image" || !scene.src) return undefined;
  const position = scene.position ?? [0.5, 0.5];
  return {
    backgroundImage: `url(${JSON.stringify(scene.src)})`,
    backgroundPosition: `${position[0] * 100}% ${position[1] * 100}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize:
      scene.fit === "stretch"
        ? "100% 100%"
        : scene.fit === "contain"
          ? "contain"
          : "cover",
  };
}

function debugSurface(
  snapshot: TahoeV4SurfaceSnapshot,
  variants: ReadonlyMap<string, string>,
  viewportRect: DOMRectReadOnly,
): TahoeGlassV4DebugSurface {
  return {
    id: snapshot.id,
    variant: variants.get(snapshot.id) || "surface",
    profile: snapshot.profile,
    visible: snapshot.visible,
    rect: {
      left: viewportRect.left + snapshot.rect.x,
      top: viewportRect.top + snapshot.rect.y,
      width: snapshot.rect.width,
      height: snapshot.rect.height,
    },
  };
}

function geometrySignature(
  snapshots: readonly TahoeV4SurfaceSnapshot[],
): string {
  return snapshots
    .map((snapshot) =>
      [
        snapshot.id,
        snapshot.visible ? 1 : 0,
        snapshot.opacity.toFixed(3),
        snapshot.priority,
        snapshot.rect.x.toFixed(2),
        snapshot.rect.y.toFixed(2),
        snapshot.rect.width.toFixed(2),
        snapshot.rect.height.toFixed(2),
        snapshot.clipRect?.x.toFixed(2) ?? "x",
        snapshot.clipRect?.y.toFixed(2) ?? "x",
        snapshot.clipRect?.width.toFixed(2) ?? "x",
        snapshot.clipRect?.height.toFixed(2) ?? "x",
        snapshot.cornerRadiiPx.topLeft.toFixed(2),
        snapshot.cornerRadiiPx.topRight.toFixed(2),
        snapshot.cornerRadiiPx.bottomRight.toFixed(2),
        snapshot.cornerRadiiPx.bottomLeft.toFixed(2),
      ].join("/"),
    )
    .join("|");
}

export function useTahoeGlassV4Diagnostics(): TahoeV4Diagnostics {
  return (
    React.useContext(TahoeGlassV4EngineContext)?.diagnostics ??
    MISSING_PROVIDER_DIAGNOSTICS
  );
}

export function useTahoeGlassV4Controls(): TahoeGlassV4Controls {
  const context = React.useContext(TahoeGlassV4EngineContext);
  return React.useMemo(
    () => ({
      requestRender: context?.requestRender ?? (() => undefined),
      retry: context?.retry ?? (() => undefined),
    }),
    [context],
  );
}

export function TahoeGlassV4Provider({
  scene,
  children,
  enabled = true,
  killSwitch = false,
  debug = false,
  maxDpr,
  maxFps = 30,
  sourceTimeoutMs,
  viewportMode = "fixed",
  sceneFallback,
  sceneInteractive = false,
  sceneClassName,
  sceneStyle,
  contentClassName,
  contentStyle,
  onDiagnosticsChange,
  className,
  style,
  ...props
}: TahoeGlassV4ProviderProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<TahoeV4Renderer | null>(null);
  const [registry] = React.useState(() => new TahoeV4SurfaceRegistry());
  const frameRef = React.useRef<number | null>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const variantsRef = React.useRef(new Map<string, string>());
  const elementsRef = React.useRef(new Map<string, HTMLElement>());
  const onDiagnosticsChangeRef = React.useRef(onDiagnosticsChange);
  const environmentRef = React.useRef(
    detectTahoeV4EnvironmentCapabilities(),
  );
  const geometryDirtyRef = React.useRef(true);
  const cachedSnapshotsRef = React.useRef<readonly TahoeV4SurfaceSnapshot[]>([]);
  const continuousGeometryTimerRef = React.useRef<number | null>(null);
  const motionTrackingStartedAtRef = React.useRef(0);
  const motionTrackingUntilRef = React.useRef(0);
  const stableMotionFramesRef = React.useRef(0);
  const lastGeometrySignatureRef = React.useRef("");
  const fallbackFieldCacheRef = React.useRef(
    new Map<string, TahoeV4DisplacementField>(),
  );
  const fallbackRimCacheRef = React.useRef(
    new Map<string, TahoeV4RimCssVariables>(),
  );
  const debugEnabledRef = React.useRef(debug);
  const lastDebugTelemetryAtRef = React.useRef(0);
  const renderFrameRef = React.useRef<() => void>(() => undefined);
  const [retryRevision, setRetryRevision] = React.useState(0);
  const [preferenceRevision, setPreferenceRevision] = React.useState(0);
  const [diagnostics, setDiagnostics] = React.useState<TahoeV4Diagnostics>(() =>
    materialOnlyDiagnostics(
      scene,
      enabled && !killSwitch ? null : killSwitch ? "kill-switch" : "feature-disabled",
      killSwitch ? "fallback" : "material-ready",
    ),
  );
  const [debugSurfaces, setDebugSurfaces] = React.useState<
    TahoeGlassV4DebugSurface[]
  >([]);
  const [debugDiagnostics, setDebugDiagnostics] =
    React.useState<TahoeV4Diagnostics>(diagnostics);
  const publishedDiagnosticsRef = React.useRef(diagnostics);
  const latestDiagnosticsRef = React.useRef(diagnostics);

  React.useLayoutEffect(() => {
    onDiagnosticsChangeRef.current = onDiagnosticsChange;
  }, [onDiagnosticsChange]);

  React.useLayoutEffect(() => {
    debugEnabledRef.current = debug;
    if (debug) setDebugDiagnostics(latestDiagnosticsRef.current);
  }, [debug]);

  const commitDiagnostics = React.useCallback((next: TahoeV4Diagnostics) => {
    const environment = environmentRef.current;
    const normalized = {
      ...next,
      reducedMotion: environment.reducedMotion,
      reducedTransparency: environment.reducedTransparency,
      forcedColors: environment.forcedColors,
    };
    latestDiagnosticsRef.current = normalized;
    const semanticChanged = !equivalentPresentationDiagnostics(
      publishedDiagnosticsRef.current,
      normalized,
    );
    const now = typeof performance === "undefined" ? Date.now() : performance.now();
    const debugTelemetryDue =
      debugEnabledRef.current && now - lastDebugTelemetryAtRef.current >= 250;

    if (semanticChanged) {
      publishedDiagnosticsRef.current = normalized;
      setDiagnostics(normalized);
      setDebugDiagnostics(normalized);
      onDiagnosticsChangeRef.current?.(normalized);
    } else if (debugTelemetryDue) {
      lastDebugTelemetryAtRef.current = now;
      setDebugDiagnostics(normalized);
    }
  }, []);

  const requestRender = React.useCallback((reason?: string) => {
    void reason;
    geometryDirtyRef.current = true;
    if (frameRef.current !== null || typeof window === "undefined") return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      renderFrameRef.current();
    });
  }, []);

  const retry = React.useCallback(() => {
    setRetryRevision((revision) => revision + 1);
  }, []);

  const registerSurface = React.useCallback(
    (registration: TahoeGlassV4SurfaceRegistration) => {
      variantsRef.current.set(registration.id, registration.variant);
      elementsRef.current.set(registration.id, registration.element);
      registry.register({
        id: registration.id,
        element: registration.element,
        profile: registration.profile,
        cornerRadiiPx: numericCornerRadii(registration.element),
        priority: registration.priority,
        continuous: registration.continuous,
      });
      resizeObserverRef.current?.observe(registration.element);
      requestRender("surface-register");
    },
    [registry, requestRender],
  );

  const unregisterSurface = React.useCallback(
    (id: string) => {
      const element = elementsRef.current.get(id);
      if (element) resizeObserverRef.current?.unobserve(element);
      registry?.unregister(id);
      variantsRef.current.delete(id);
      elementsRef.current.delete(id);
      requestRender("surface-unregister");
    },
    [registry, requestRender],
  );

  React.useEffect(() => {
    const refreshPreferences = () => {
      const environment = detectTahoeV4EnvironmentCapabilities();
      environmentRef.current = environment;
      commitDiagnostics({
        ...latestDiagnosticsRef.current,
        reducedMotion: environment.reducedMotion,
        reducedTransparency: environment.reducedTransparency,
        forcedColors: environment.forcedColors,
        dpr: environment.devicePixelRatio,
      });
      setPreferenceRevision((revision) => revision + 1);
      requestRender("preferences-change");
    };
    const queries = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    for (const query of queries) query.addEventListener("change", refreshPreferences);
    return () => {
      for (const query of queries)
        query.removeEventListener("change", refreshPreferences);
    };
  }, [commitDiagnostics, requestRender]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      registry.markDirty();
      requestRender("resize");
    });
    resizeObserverRef.current = observer;
    observer.observe(container);
    observer.observe(viewport);
    for (const element of elementsRef.current.values()) observer.observe(element);

    const onViewportChange = () => requestRender("viewport-change");
    const trackLayoutMotion = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const belongsToProvider = [...elementsRef.current.values()].some(
        (element) =>
          element === target ||
          element.contains(target) ||
          (target instanceof HTMLElement && target.contains(element)),
      );
      if (!belongsToProvider) return;
      const now = performance.now();
      motionTrackingStartedAtRef.current = now;
      motionTrackingUntilRef.current = now + 900;
      stableMotionFramesRef.current = 0;
      requestRender(`layout-motion-${event.type}`);
    };
    const motionEvents = [
      "transitionrun",
      "transitionstart",
      "transitionend",
      "animationstart",
      "animationiteration",
      "animationend",
      "pointerover",
      "pointerout",
      "pointerdown",
      "pointerup",
      "pointercancel",
      "keydown",
      "keyup",
      "focusin",
      "focusout",
    ] as const;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestRender("visibility-restored");
      } else if (continuousGeometryTimerRef.current !== null) {
        window.clearTimeout(continuousGeometryTimerRef.current);
        continuousGeometryTimerRef.current = null;
      }
    };
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("scroll", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    for (const eventName of motionEvents) {
      document.addEventListener(eventName, trackLayoutMotion, true);
    }
    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("scroll", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const eventName of motionEvents) {
        document.removeEventListener(eventName, trackLayoutMotion, true);
      }
    };
  }, [registry, requestRender]);

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = viewportRef.current;
    rendererRef.current?.dispose();
    rendererRef.current = null;

    const environment = detectTahoeV4EnvironmentCapabilities();
    if (
      !enabled ||
      killSwitch ||
      scene.kind === "material-only" ||
      environment.forcedColors
    ) {
      const materialReason =
        scene.kind === "material-only"
          ? scene.reason || "material-only-scene"
          : "material-only-scene";
      commitDiagnostics(
        materialOnlyDiagnostics(
          scene,
          killSwitch
            ? "kill-switch"
            : !enabled
              ? "feature-disabled"
              : environment.forcedColors
                ? "forced-colors-active"
                : materialReason,
          killSwitch || scene.kind === "material-only" || environment.forcedColors
            ? "fallback"
            : "material-ready",
          environment,
        ),
      );
      return;
    }
    if (!canvas || !container || !environment.webglApi) {
      commitDiagnostics(
        materialOnlyDiagnostics(
          scene,
          "webgl-unavailable",
          "fallback",
          environment,
        ),
      );
      return;
    }

    let renderer: TahoeV4Renderer;
    try {
      renderer = new TahoeV4Renderer({
        canvas,
        maxDpr,
        maxFps,
        sourceTimeoutMs,
        onDiagnostics: commitDiagnostics,
        onSourceReady: () => requestRender("source-ready"),
        onFallback: ({ reason }) => {
          if (reason === "tahoe-v4-webgl-context-restored-reinitialize") {
            setRetryRevision((revision) => revision + 1);
          }
        },
        onSurfaceOptics: ({ id, rim }) => {
          const element = elementsRef.current.get(id);
          if (!element) return;
          for (const [property, value] of Object.entries(rim)) {
            element.style.setProperty(property, value);
          }
        },
      });
    } catch (error: unknown) {
      commitDiagnostics(
        materialOnlyDiagnostics(
          scene,
          error instanceof Error
            ? error.message
            : "webgl-renderer-construction-failed",
          "fallback",
          environment,
        ),
      );
      return;
    }
    let disposed = false;
    rendererRef.current = renderer;
    void renderer.setScene(scene).then(
      () => {
        if (!disposed) requestRender("scene-loaded");
      },
      (error: unknown) => {
        if (disposed) return;
        commitDiagnostics(
          materialOnlyDiagnostics(
            scene,
            error instanceof Error ? error.message : "scene-load-failed",
            "fallback",
            environment,
          ),
        );
      },
    );
    requestRender("renderer-created");

    return () => {
      disposed = true;
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [
    commitDiagnostics,
    enabled,
    killSwitch,
    maxDpr,
    maxFps,
    preferenceRevision,
    requestRender,
    retryRevision,
    scene,
    sourceTimeoutMs,
  ]);

  const renderFrame = React.useCallback(() => {
    const renderer = rendererRef.current;
    const container = viewportRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const environment = detectTahoeV4EnvironmentCapabilities();
    let snapshots = cachedSnapshotsRef.current;
    if (geometryDirtyRef.current) {
      for (const [id, element] of elementsRef.current) {
        registry.update(id, {
          cornerRadiiPx: numericCornerRadii(element),
        });
      }
      snapshots = registry.snapshot(container);
      cachedSnapshotsRef.current = snapshots;
      geometryDirtyRef.current = false;
      const signature = geometrySignature(snapshots);
      if (signature === lastGeometrySignatureRef.current) {
        stableMotionFramesRef.current += 1;
      } else {
        stableMotionFramesRef.current = 0;
        lastGeometrySignatureRef.current = signature;
      }
      for (const snapshot of snapshots) {
        if (environment.forcedColors || !snapshot.visible) continue;
        if (renderer && snapshot.profile !== "material-only") continue;
        const element = elementsRef.current.get(snapshot.id);
        if (!element) continue;
        applyFallbackRim(
          snapshot,
          element,
          variantsRef.current.get(snapshot.id),
          rect.width,
          rect.height,
          fallbackFieldCacheRef.current,
          fallbackRimCacheRef.current,
        );
      }
      if (debug) {
        setDebugSurfaces(
          snapshots.map((snapshot) =>
            debugSurface(snapshot, variantsRef.current, rect),
          ),
        );
      }
    }
    const viewport = {
      width: rect.width,
      height: rect.height,
      dpr: Math.min(environment.devicePixelRatio, maxDpr ?? 1),
    };
    if (renderer) {
      renderer.requestFrame(snapshots, viewport);
    } else {
      commitDiagnostics({
        ...latestDiagnosticsRef.current,
        surfaceCount: snapshots.length,
        refractiveSurfaceCount: 0,
      });
    }

    const hasContinuousGeometry = snapshots.some(
      (snapshot) => snapshot.visible && snapshot.continuous,
    );
    const now = performance.now();
    const withinMotionWindow = now < motionTrackingUntilRef.current;
    const keepTrackingMotion =
      withinMotionWindow &&
      (now - motionTrackingStartedAtRef.current < 140 ||
        stableMotionFramesRef.current < 2);
    if (withinMotionWindow && !keepTrackingMotion) {
      motionTrackingUntilRef.current = 0;
    }
    if (
      (hasContinuousGeometry || keepTrackingMotion) &&
      !environment.reducedMotion &&
      document.visibilityState === "visible" &&
      continuousGeometryTimerRef.current === null
    ) {
      const safeMaxFps = Number.isFinite(maxFps)
        ? Math.max(1, Math.min(60, maxFps))
        : 30;
      continuousGeometryTimerRef.current = window.setTimeout(() => {
        continuousGeometryTimerRef.current = null;
        requestRender("continuous-geometry");
      }, 1000 / safeMaxFps);
    }
  }, [commitDiagnostics, debug, maxDpr, maxFps, registry, requestRender]);

  React.useLayoutEffect(() => {
    renderFrameRef.current = renderFrame;
    requestRender("react-commit");
  }, [renderFrame, requestRender]);

  React.useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (continuousGeometryTimerRef.current !== null) {
        window.clearTimeout(continuousGeometryTimerRef.current);
      }
      rendererRef.current?.dispose();
      registry.clear();
      fallbackFieldCacheRef.current.clear();
      fallbackRimCacheRef.current.clear();
    },
    [registry],
  );

  const contextValue = React.useMemo<TahoeGlassV4EngineContextValue>(
    () => ({
      diagnostics,
      registerSurface,
      unregisterSurface,
      requestRender,
      retry,
    }),
    [diagnostics, registerSurface, requestRender, retry, unregisterSurface],
  );

  const showRenderedScene =
    enabled &&
    !killSwitch &&
    diagnostics.lifecycle === "refraction-presented" &&
    diagnostics.framePresented;

  return (
    <TahoeGlassV4EngineContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={cn("relative isolate", className)}
        style={style}
        {...props}
        data-tahoe-glass-v4-provider="true"
        data-tahoe-glass-v4-state={diagnostics.lifecycle}
        data-tahoe-glass-v4-backend={diagnostics.backend}
        data-tahoe-glass-v4-source={diagnostics.sourceKind}
        data-tahoe-glass-v4-frame-presented={diagnostics.framePresented}
        data-tahoe-glass-v4-fallback-reason={diagnostics.reason || undefined}
      >
        <div
          ref={viewportRef}
          aria-hidden={sceneInteractive ? undefined : true}
          className={cn(
            "inset-0 z-0 overflow-hidden",
            sceneInteractive ? "pointer-events-auto" : "pointer-events-none",
            viewportMode === "fixed" ? "fixed" : "absolute",
            sceneClassName,
          )}
          style={{ ...imageFallbackStyle(scene), ...sceneStyle }}
          data-tahoe-glass-v4-scene-fallback="true"
        >
          {sceneFallback}
        </div>

        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={cn(
            "pointer-events-none inset-0 z-0 h-full w-full",
            viewportMode === "fixed" ? "fixed" : "absolute",
          )}
          style={{ opacity: showRenderedScene ? 1 : 0 }}
          data-tahoe-glass-v4-refraction-layer="true"
        />

        <div
          className={cn(
            "relative z-[1]",
            sceneInteractive && "pointer-events-none",
            contentClassName,
          )}
          style={{
            ...contentStyle,
            pointerEvents: sceneInteractive
              ? "none"
              : contentStyle?.pointerEvents,
          }}
          data-tahoe-glass-v4-content="true"
        >
          {children}
        </div>

        {debug && (
          <TahoeGlassV4DiagnosticsOverlay
            diagnostics={debugDiagnostics}
            surfaces={debugSurfaces}
          />
        )}
      </div>
    </TahoeGlassV4EngineContext.Provider>
  );
}
