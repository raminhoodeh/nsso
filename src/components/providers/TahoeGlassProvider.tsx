"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { detectTahoeGlassCapabilities } from "@/lib/tahoe-glass/capabilities";
import { TAHOE_DISPLACEMENT_SCALE } from "@/lib/tahoe-glass/constants";
import {
  applyTahoeRimVariables,
  calculateTahoeRim,
  createTahoeDisplacementField,
  type TahoeDisplacementField,
} from "@/lib/tahoe-glass/optics";
import type {
  TahoeGlassBackend,
  TahoeGlassDiagnostics,
  TahoeGlassFallback,
  TahoeGlassPreferredBackend,
  TahoeGlassStatus,
  TahoeGlassWebGLSource,
} from "@/lib/tahoe-glass/types";
import { TahoeWebGLRenderer } from "@/lib/tahoe-glass/webgl";

interface SurfaceRuntime {
  id: string;
  element: HTMLElement;
  visible: boolean;
  measured: boolean;
  field: TahoeDisplacementField | null;
  fieldKey: string;
  continuous: boolean;
  drawn: boolean;
}

interface TahoeGlassEngineContextValue {
  diagnostics: TahoeGlassDiagnostics;
  registerSurface: (
    id: string,
    element: HTMLElement,
    options?: { continuous?: boolean },
  ) => void;
  unregisterSurface: (id: string) => void;
  requestRender: (reason?: string) => void;
  renderNow: () => void;
  retryBackend: () => void;
}

const MISSING_PROVIDER_DIAGNOSTICS: TahoeGlassDiagnostics = {
  status: "failed",
  backend: "solid",
  source: "none",
  reason: "missing-tahoe-glass-provider",
  reducedMotion: false,
  reducedTransparency: false,
  surfaceCount: 0,
  visibleSurfaceCount: 0,
  dpr: 1,
};

const INITIAL_DIAGNOSTICS: TahoeGlassDiagnostics = {
  status: "initializing",
  backend: "solid",
  source: "dom-scene",
  reason: "engine-initializing",
  reducedMotion: false,
  reducedTransparency: false,
  surfaceCount: 0,
  visibleSurfaceCount: 0,
  dpr: 1,
};

const MAX_SURFACE_FIELD_PIXELS = 512 * 512;
const MAX_VIEWPORT_MAP_PIXELS = 4096 * 4096;

export const TahoeGlassEngineContext =
  React.createContext<TahoeGlassEngineContextValue | null>(null);

export interface TahoeGlassProviderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** The single visual scene refracted by every registered surface. */
  scene: React.ReactNode;
  children?: React.ReactNode;
  sceneClassName?: string;
  sceneStyle?: React.CSSProperties;
  preferredBackend?: TahoeGlassPreferredBackend;
  fallback?: TahoeGlassFallback;
  /** Required for an honest WebGL path; arbitrary DOM cannot be sampled. */
  webglSource?: TahoeGlassWebGLSource;
  respectReducedMotion?: boolean;
  respectReducedTransparency?: boolean;
  maxDpr?: number;
  viewportMode?: "fixed" | "contained";
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  onDiagnosticsChange?: (diagnostics: TahoeGlassDiagnostics) => void;
}

function sourceLabel(source?: TahoeGlassWebGLSource): string {
  if (!source) return "dom-scene";
  return source.label || (source.kind === "image" ? source.src : source.kind);
}

function fallbackBackend(fallback: TahoeGlassFallback): TahoeGlassBackend {
  return fallback === "blur" ? "css-blur" : fallback;
}

function setDataAttribute(
  element: HTMLElement,
  name: string,
  value: string | null,
): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function writeSurfaceDiagnostics(
  runtime: SurfaceRuntime,
  diagnostics: TahoeGlassDiagnostics,
): void {
  let status: TahoeGlassStatus = diagnostics.status;
  let reason = diagnostics.reason;
  if (diagnostics.status === "active" && (!runtime.measured || !runtime.drawn)) {
    status = "initializing";
    reason = runtime.measured
      ? "surface-awaiting-first-frame"
      : "surface-awaiting-measurement";
  }
  if (runtime.measured) {
    const rect = runtime.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      status = "failed";
      reason = "surface-zero-size";
    }
  }

  setDataAttribute(runtime.element, "data-tahoe-glass-state", status);
  setDataAttribute(
    runtime.element,
    "data-tahoe-glass-backend",
    diagnostics.backend,
  );
  setDataAttribute(
    runtime.element,
    "data-tahoe-glass-source",
    diagnostics.source,
  );
  setDataAttribute(
    runtime.element,
    "data-tahoe-glass-fallback-reason",
    reason,
  );
  setDataAttribute(
    runtime.element,
    "data-tahoe-glass-visible",
    String(runtime.visible),
  );
  setDataAttribute(
    runtime.element,
    "data-tahoe-glass-measured",
    String(runtime.measured),
  );
  setDataAttribute(
    runtime.element,
    "data-tahoe-glass-displacement",
    String(TAHOE_DISPLACEMENT_SCALE),
  );
}

export function useTahoeGlassDiagnostics(): TahoeGlassDiagnostics {
  return (
    React.useContext(TahoeGlassEngineContext)?.diagnostics ??
    MISSING_PROVIDER_DIAGNOSTICS
  );
}

export function useTahoeGlassControls(): {
  requestRender: (reason?: string) => void;
  renderNow: () => void;
  retryBackend: () => void;
} {
  const context = React.useContext(TahoeGlassEngineContext);
  return React.useMemo(
    () => ({
      requestRender: context?.requestRender ?? (() => undefined),
      renderNow: context?.renderNow ?? (() => undefined),
      retryBackend: context?.retryBackend ?? (() => undefined),
    }),
    [context?.renderNow, context?.requestRender, context?.retryBackend],
  );
}

export function TahoeGlassProvider({
  scene,
  children,
  className,
  sceneClassName,
  sceneStyle,
  preferredBackend = "auto",
  fallback = "webgl",
  webglSource,
  respectReducedMotion = true,
  respectReducedTransparency = true,
  maxDpr = 3,
  viewportMode = "fixed",
  contentClassName,
  contentStyle,
  onDiagnosticsChange,
  style,
  ...props
}: TahoeGlassProviderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const sceneRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const feImage0Ref = React.useRef<SVGFEImageElement>(null);
  const feImage1Ref = React.useRef<SVGFEImageElement>(null);
  const registryRef = React.useRef(new Map<string, SurfaceRuntime>());
  const surfaceResizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const intersectionObserverRef = React.useRef<IntersectionObserver | null>(null);
  const rendererRef = React.useRef<TahoeWebGLRenderer | null>(null);
  const compositeCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const activeFilterRef = React.useRef<0 | 1>(0);
  const frameRef = React.useRef<number | null>(null);
  const renderFrameRef = React.useRef<(refreshSource?: boolean) => void>(
    () => undefined,
  );
  const mountedRef = React.useRef(false);
  const [environmentRevision, setEnvironmentRevision] = React.useState(0);

  const filterId0 = `${React.useId().replace(/:/g, "-")}-tahoe-0`;
  const filterId1 = `${React.useId().replace(/:/g, "-")}-tahoe-1`;

  const [diagnostics, setDiagnostics] =
    React.useState<TahoeGlassDiagnostics>(INITIAL_DIAGNOSTICS);
  const diagnosticsRef = React.useRef(diagnostics);
  const onDiagnosticsChangeRef = React.useRef(onDiagnosticsChange);

  React.useEffect(() => {
    onDiagnosticsChangeRef.current = onDiagnosticsChange;
  }, [onDiagnosticsChange]);

  const commitDiagnostics = React.useCallback(
    (next: TahoeGlassDiagnostics) => {
      diagnosticsRef.current = next;
      if (!mountedRef.current) return;
      setDiagnostics(next);
      for (const runtime of registryRef.current.values()) {
        writeSurfaceDiagnostics(runtime, next);
      }
      onDiagnosticsChangeRef.current?.(next);
    },
    [],
  );

  const retryBackend = React.useCallback(() => {
    setEnvironmentRevision((revision) => revision + 1);
  }, []);

  const requestRender = React.useCallback((_reason?: string) => {
    void _reason;
    if (frameRef.current !== null || typeof window === "undefined") return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      renderFrameRef.current();
    });
  }, []);

  /**
   * Synchronous bridge for WebGL scenes with preserveDrawingBuffer=false.
   * Call from the scene's afterRender hook while its framebuffer is valid.
   */
  const renderNow = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    renderFrameRef.current(true);
  }, []);

  const refreshCounts = React.useCallback(() => {
    const current = diagnosticsRef.current;
    const surfaces = [...registryRef.current.values()];
    const next = {
      ...current,
      surfaceCount: surfaces.length,
      visibleSurfaceCount: surfaces.filter((surface) => surface.visible).length,
    };
    if (
      next.surfaceCount !== current.surfaceCount ||
      next.visibleSurfaceCount !== current.visibleSurfaceCount
    ) {
      commitDiagnostics(next);
    }
  }, [commitDiagnostics]);

  const registerSurface = React.useCallback(
    (
      id: string,
      element: HTMLElement,
      options?: { continuous?: boolean },
    ) => {
      const existing = registryRef.current.get(id);
      if (existing?.element === element) return;
      if (existing) {
        surfaceResizeObserverRef.current?.unobserve(existing.element);
        intersectionObserverRef.current?.unobserve(existing.element);
      }

      const runtime: SurfaceRuntime = {
        id,
        element,
        visible: true,
        measured: false,
        field: null,
        fieldKey: "",
        continuous: options?.continuous ?? false,
        drawn: false,
      };
      registryRef.current.set(id, runtime);
      surfaceResizeObserverRef.current?.observe(element);
      intersectionObserverRef.current?.observe(element);
      writeSurfaceDiagnostics(runtime, diagnosticsRef.current);
      refreshCounts();
      requestRender("surface-register");
    },
    [refreshCounts, requestRender],
  );

  const unregisterSurface = React.useCallback(
    (id: string) => {
      const runtime = registryRef.current.get(id);
      if (!runtime) return;
      surfaceResizeObserverRef.current?.unobserve(runtime.element);
      intersectionObserverRef.current?.unobserve(runtime.element);
      registryRef.current.delete(id);
      refreshCounts();
      requestRender("surface-unregister");
    },
    [refreshCounts, requestRender],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const queries = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const changed = () => setEnvironmentRevision((revision) => revision + 1);
    for (const query of queries) query.addEventListener("change", changed);
    return () => {
      for (const query of queries) query.removeEventListener("change", changed);
    };
  }, []);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const containerObserver = new ResizeObserver(() => {
      for (const runtime of registryRef.current.values()) {
        runtime.fieldKey = "";
        runtime.drawn = false;
      }
      requestRender("container-resize");
    });
    containerObserver.observe(viewport);

    const surfaceObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        for (const runtime of registryRef.current.values()) {
          if (runtime.element === entry.target) {
            runtime.fieldKey = "";
            runtime.drawn = false;
            break;
          }
        }
      }
      requestRender("surface-resize");
    });
    surfaceResizeObserverRef.current = surfaceObserver;

    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        for (const runtime of registryRef.current.values()) {
          if (runtime.element === entry.target) {
            runtime.visible = entry.isIntersecting;
            runtime.fieldKey = "";
            if (!entry.isIntersecting) {
              runtime.field = null;
              runtime.drawn = false;
            }
            writeSurfaceDiagnostics(runtime, diagnosticsRef.current);
            break;
          }
        }
      }
      refreshCounts();
      requestRender("surface-visibility");
    }, { root: viewportMode === "contained" ? viewport : null });
    intersectionObserverRef.current = intersectionObserver;

    for (const runtime of registryRef.current.values()) {
      surfaceObserver.observe(runtime.element);
      intersectionObserver.observe(runtime.element);
    }

    const moved = () => requestRender("viewport-move");
    window.addEventListener("resize", moved, { passive: true });
    window.addEventListener("scroll", moved, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", moved, { passive: true });
    window.visualViewport?.addEventListener("scroll", moved, { passive: true });
    document.addEventListener("visibilitychange", moved);

    return () => {
      containerObserver.disconnect();
      surfaceObserver.disconnect();
      intersectionObserver.disconnect();
      surfaceResizeObserverRef.current = null;
      intersectionObserverRef.current = null;
      window.removeEventListener("resize", moved);
      window.removeEventListener("scroll", moved, true);
      window.visualViewport?.removeEventListener("resize", moved);
      window.visualViewport?.removeEventListener("scroll", moved);
      document.removeEventListener("visibilitychange", moved);
    };
  }, [refreshCounts, requestRender, viewportMode]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lost = (event: Event) => {
      event.preventDefault();
      rendererRef.current = null;
      const current = diagnosticsRef.current;
      commitDiagnostics({
        ...current,
        status: "fallback",
        backend: fallback === "solid" ? "solid" : "css-blur",
        reason: "webgl-context-lost",
      });
    };
    const restored = () =>
      setEnvironmentRevision((revision) => revision + 1);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [commitDiagnostics, fallback]);

  React.useEffect(() => {
    let cancelled = false;
    const sourceAbort = new AbortController();
    const capabilities = detectTahoeGlassCapabilities();
    const viewportDprCap = Math.sqrt(
      MAX_VIEWPORT_MAP_PIXELS /
        Math.max(1, window.innerWidth * window.innerHeight),
    );
    const dpr = Math.max(
      1,
      Math.min(capabilities.dpr, maxDpr, viewportDprCap),
    );
    const reducedMotion = respectReducedMotion && capabilities.reducedMotion;
    const reducedTransparency =
      respectReducedTransparency &&
      (capabilities.reducedTransparency || capabilities.forcedColors);

    rendererRef.current?.dispose();
    rendererRef.current = null;

    const base = {
      reducedMotion,
      reducedTransparency,
      surfaceCount: registryRef.current.size,
      visibleSurfaceCount: [...registryRef.current.values()].filter(
        (surface) => surface.visible,
      ).length,
      dpr,
    };

    if (reducedTransparency) {
      commitDiagnostics({
        ...base,
        status: "fallback",
        backend: "solid",
        source: "dom-scene",
        reason: capabilities.forcedColors
          ? "forced-colors-active"
          : "reduced-transparency-requested",
      });
      requestRender("reduced-transparency");
      return;
    }

    const svgAllowed =
      capabilities.svgDisplacement && !capabilities.safariFamily;
    const wantsSvg =
      preferredBackend === "svg" ||
      (preferredBackend === "auto" && svgAllowed);

    if (wantsSvg && svgAllowed) {
      commitDiagnostics({
        ...base,
        status: "initializing",
        backend: "svg",
        source: "dom-scene",
        reason: "awaiting-first-displaced-frame",
      });
      requestRender("svg-ready");
      return () => sourceAbort.abort();
    }

    const wantsWebGL =
      preferredBackend === "webgl" ||
      fallback === "webgl" ||
      (preferredBackend === "auto" && capabilities.safariFamily);

    if (wantsWebGL && capabilities.webgl && webglSource) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      commitDiagnostics({
        ...base,
        status: "initializing",
        backend: "webgl",
        source: sourceLabel(webglSource),
        reason: "awaiting-webgl-scene-source",
      });
      void TahoeWebGLRenderer.create(canvas, webglSource, sourceAbort.signal)
        .then((renderer) => {
          if (cancelled) {
            renderer.dispose();
            return;
          }
          rendererRef.current = renderer;
          const current = diagnosticsRef.current;
          commitDiagnostics({
            ...current,
            status: "initializing",
            backend: "webgl",
            source: sourceLabel(webglSource),
            reason: renderer.requiresSynchronousRefresh
              ? "awaiting-scene-after-render"
              : "awaiting-first-displaced-frame",
          });
          requestRender("webgl-ready");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message =
            error instanceof Error ? error.message : "webgl-initialization-failed";
          commitDiagnostics({
            ...base,
            status: "fallback",
            backend: fallback === "solid" ? "solid" : "css-blur",
            source: "dom-scene",
            reason: message,
          });
          requestRender("webgl-failed");
        });
      return () => {
        cancelled = true;
        sourceAbort.abort();
        rendererRef.current?.dispose();
        rendererRef.current = null;
      };
    }

    const requestedFallback = fallbackBackend(fallback);
    const reason = !svgAllowed && preferredBackend === "svg"
      ? "svg-displacement-unsupported"
      : wantsWebGL && !webglSource
        ? "webgl-source-not-provided"
        : wantsWebGL && !capabilities.webgl
          ? "webgl-unsupported"
          : "preferred-backend-unavailable";
    commitDiagnostics({
      ...base,
      status: "fallback",
      backend: requestedFallback === "webgl" ? "css-blur" : requestedFallback,
      source: "dom-scene",
      reason,
    });
    requestRender("backend-fallback");

    return () => {
      cancelled = true;
      sourceAbort.abort();
    };
  }, [
    commitDiagnostics,
    environmentRevision,
    fallback,
    maxDpr,
    preferredBackend,
    requestRender,
    respectReducedMotion,
    respectReducedTransparency,
    webglSource,
  ]);

  const renderFrame = React.useCallback((refreshSource = false) => {
    const viewport = viewportRef.current;
    const sceneElement = sceneRef.current;
    const current = diagnosticsRef.current;
    if (!viewport || !sceneElement) return;

    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return;
    const dpr = Math.max(1, current.dpr);
    const pixelWidth = Math.max(1, Math.round(viewportRect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(viewportRect.height * dpr));

    let composite = compositeCanvasRef.current;
    if (!composite) {
      composite = document.createElement("canvas");
      compositeCanvasRef.current = composite;
    }
    if (composite.width !== pixelWidth) composite.width = pixelWidth;
    if (composite.height !== pixelHeight) composite.height = pixelHeight;
    const context = composite.getContext("2d");
    if (!context) {
      commitDiagnostics({
        ...current,
        status: "failed",
        backend: "solid",
        source: "dom-scene",
        reason: "displacement-map-context-unavailable",
      });
      return;
    }

    context.clearRect(0, 0, pixelWidth, pixelHeight);
    if (current.backend === "svg") {
      context.fillStyle = "rgb(128, 128, 128)";
      context.fillRect(0, 0, pixelWidth, pixelHeight);
    }

    let visibleSurfaceCount = 0;
    let drewSurface = false;
    for (const runtime of registryRef.current.values()) {
      const rect = runtime.element.getBoundingClientRect();
      runtime.measured = true;
      if (rect.width <= 0 || rect.height <= 0) {
        writeSurfaceDiagnostics(runtime, current);
        continue;
      }
      const intersectsViewport =
        rect.right > viewportRect.left &&
        rect.left < viewportRect.right &&
        rect.bottom > viewportRect.top &&
        rect.top < viewportRect.bottom;
      if (!runtime.visible || !intersectsViewport) {
        runtime.field = null;
        runtime.fieldKey = "";
        runtime.drawn = false;
        writeSurfaceDiagnostics(runtime, current);
        continue;
      }
      visibleSurfaceCount += 1;

      const memoryBoundDpr = Math.sqrt(
        MAX_SURFACE_FIELD_PIXELS / Math.max(1, rect.width * rect.height),
      );
      const fieldDpr = Math.max(0.5, Math.min(dpr, memoryBoundDpr));
      // Transparent neutral corners let N maps compose without one surface's
      // bounding box erasing a neighboring surface's deformation.
      const alphaOutside = 0;
      const fieldKey = `${rect.width.toFixed(2)}:${rect.height.toFixed(2)}:${fieldDpr.toFixed(3)}`;
      if (!runtime.field || runtime.fieldKey !== fieldKey) {
        runtime.drawn = false;
        runtime.field = createTahoeDisplacementField(
          rect.width,
          rect.height,
          fieldDpr,
          alphaOutside,
        );
        runtime.fieldKey = fieldKey;
      }
      if (!runtime.field) {
        writeSurfaceDiagnostics(runtime, {
          ...current,
          status: "failed",
          backend: "solid",
          reason: "surface-map-generation-failed",
        });
        continue;
      }

      const localLeft = (rect.left - viewportRect.left) * dpr;
      const localTop = (rect.top - viewportRect.top) * dpr;
      context.drawImage(
        runtime.field.canvas,
        localLeft,
        localTop,
        rect.width * dpr,
        rect.height * dpr,
      );
      runtime.drawn = true;
      drewSurface = true;

      const centerX =
        (rect.left + rect.width / 2 - viewportRect.left) /
        viewportRect.width;
      const centerY =
        (rect.top + rect.height / 2 - viewportRect.top) /
        viewportRect.height;
      applyTahoeRimVariables(
        runtime.element,
        calculateTahoeRim(runtime.field, centerX, centerY),
      );
      writeSurfaceDiagnostics(runtime, current);
    }

    const frameDiagnostics = { ...current, visibleSurfaceCount };

    if (
      (current.status === "initializing" || current.status === "active") &&
      current.backend === "svg" &&
      drewSurface
    ) {
      const inactive = activeFilterRef.current === 0 ? 1 : 0;
      const feImage = inactive === 0 ? feImage0Ref.current : feImage1Ref.current;
      const nextFilter = inactive === 0 ? filterId0 : filterId1;
      if (feImage) {
        try {
          const mapUrl = composite.toDataURL("image/png");
          feImage.setAttribute("href", mapUrl);
          sceneElement.style.setProperty(
            "--tahoe-scene-filter",
            `url(#${nextFilter})`,
          );
          activeFilterRef.current = inactive;
          if (current.status === "initializing") {
            commitDiagnostics({
              ...frameDiagnostics,
              status: "active",
              reason: null,
            });
          }
        } catch (error: unknown) {
          commitDiagnostics({
            ...frameDiagnostics,
            status: "failed",
            backend: "solid",
            source: "dom-scene",
            reason:
              error instanceof Error
                ? error.message
                : "svg-displacement-map-serialization-failed",
          });
        }
      }
    } else if (
      (current.status === "initializing" || current.status === "active") &&
      current.backend === "webgl" &&
      drewSurface
    ) {
      const renderer = rendererRef.current;
      if (renderer) {
        try {
          renderer.resize(viewportRect.width, viewportRect.height, dpr);
          renderer.uploadDisplacement(composite);
          if (
            current.status === "initializing" &&
            renderer.requiresSynchronousRefresh &&
            !refreshSource
          ) {
            return;
          }
          renderer.draw(dpr, refreshSource);
          if (current.status === "initializing") {
            commitDiagnostics({
              ...frameDiagnostics,
              status: "active",
              reason: null,
            });
          }
          if (
            renderer.dynamic &&
            !current.reducedMotion &&
            document.visibilityState === "visible"
          ) {
            requestRender("dynamic-webgl-source");
          }
        } catch (error: unknown) {
          commitDiagnostics({
            ...frameDiagnostics,
            status: "fallback",
            backend: fallback === "solid" ? "solid" : "css-blur",
            source: "dom-scene",
            reason:
              error instanceof Error ? error.message : "webgl-render-failed",
          });
        }
      }
    }

    if (
      visibleSurfaceCount !== current.visibleSurfaceCount &&
      current.status !== "initializing"
    ) {
      commitDiagnostics(frameDiagnostics);
    }

    if (
      current.status === "active" &&
      !current.reducedMotion &&
      [...registryRef.current.values()].some(
        (surface) => surface.visible && surface.continuous,
      )
    ) {
      requestRender("continuous-surface-tracking");
    }
  }, [commitDiagnostics, fallback, filterId0, filterId1, requestRender]);

  React.useLayoutEffect(() => {
    renderFrameRef.current = renderFrame;
    requestRender("react-commit");
  }, [renderFrame, requestRender]);

  React.useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      rendererRef.current?.dispose();
    },
    [],
  );

  const contextValue = React.useMemo<TahoeGlassEngineContextValue>(
    () => ({
      diagnostics,
      registerSurface,
      unregisterSurface,
      requestRender,
      renderNow,
      retryBackend,
    }),
    [
      diagnostics,
      registerSurface,
      renderNow,
      requestRender,
      retryBackend,
      unregisterSurface,
    ],
  );

  const svgActive = diagnostics.status === "active" && diagnostics.backend === "svg";
  const webglActive =
    diagnostics.status === "active" && diagnostics.backend === "webgl";

  return (
    <TahoeGlassEngineContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={cn("relative isolate", className)}
        style={style}
        data-tahoe-glass-provider="true"
        data-tahoe-glass-state={diagnostics.status}
        data-tahoe-glass-backend={diagnostics.backend}
        data-tahoe-glass-source={diagnostics.source}
        data-tahoe-glass-fallback-reason={diagnostics.reason || undefined}
        data-tahoe-glass-displacement={TAHOE_DISPLACEMENT_SCALE}
        {...props}
      >
        <div
          ref={viewportRef}
          aria-hidden="true"
          className={cn(
            "pointer-events-none inset-0 z-0 h-full w-full overflow-hidden",
            viewportMode === "fixed" ? "fixed" : "absolute",
          )}
          data-tahoe-glass-viewport={viewportMode}
        >
          <div
            ref={sceneRef}
            className={cn(
              "pointer-events-none absolute inset-0 z-0 h-full w-full [transform:translateZ(0)] will-change-[filter]",
              sceneClassName,
            )}
            style={{
              ...sceneStyle,
              filter: svgActive ? "var(--tahoe-scene-filter, none)" : "none",
              WebkitFilter: svgActive
                ? "var(--tahoe-scene-filter, none)"
                : "none",
              opacity: webglActive ? 0 : 1,
            }}
          >
            {scene}
          </div>

          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
            style={{ opacity: webglActive ? 1 : 0 }}
          />

          <svg
            className="pointer-events-none absolute h-0 w-0 overflow-hidden"
            xmlns="http://www.w3.org/2000/svg"
          >
          <defs>
            <filter
              id={filterId0}
              x="0"
              y="0"
              width="100%"
              height="100%"
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                ref={feImage0Ref}
                href=""
                x="0"
                y="0"
                width="100%"
                height="100%"
                result="lens"
                preserveAspectRatio="none"
              />
              <feFlood floodColor="rgb(128,128,128)" result="neutral" />
              <feComposite in="lens" in2="neutral" operator="over" result="dispMap" />
              <feDisplacementMap
                in="SourceGraphic"
                in2="dispMap"
                scale={TAHOE_DISPLACEMENT_SCALE}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <filter
              id={filterId1}
              x="0"
              y="0"
              width="100%"
              height="100%"
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                ref={feImage1Ref}
                href=""
                x="0"
                y="0"
                width="100%"
                height="100%"
                result="lens"
                preserveAspectRatio="none"
              />
              <feFlood floodColor="rgb(128,128,128)" result="neutral" />
              <feComposite in="lens" in2="neutral" operator="over" result="dispMap" />
              <feDisplacementMap
                in="SourceGraphic"
                in2="dispMap"
                scale={TAHOE_DISPLACEMENT_SCALE}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
          </svg>
        </div>

        <div
          className={cn("relative z-[1]", contentClassName)}
          style={contentStyle}
          data-tahoe-glass-content="true"
        >
          {children}
        </div>
      </div>
    </TahoeGlassEngineContext.Provider>
  );
}
