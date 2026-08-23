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
import {
  TahoeGlassDebugOverlay,
  type TahoeGlassDebugSurface,
} from "@/components/ui/tahoe-glass/TahoeGlassDebugOverlay";

interface SurfaceRuntime {
  id: string;
  element: HTMLElement;
  visible: boolean;
  measured: boolean;
  field: TahoeDisplacementField | null;
  fieldKey: string;
  continuous: boolean;
  drawn: boolean;
  priority: number | null;
  rect: DOMRectReadOnly | null;
  clipRect: DOMRectReadOnly | null;
  opacity: number;
}

interface TahoeGlassEngineContextValue {
  diagnostics: TahoeGlassDiagnostics;
  registerSurface: (
    id: string,
    element: HTMLElement,
    options?: { continuous?: boolean; priority?: number },
  ) => void;
  unregisterSurface: (id: string) => void;
  requestRender: (reason?: string) => void;
  renderNow: () => void;
  consumeSceneFrameRequest: () => boolean;
  subscribeSceneFrameRequests: (listener: () => void) => () => void;
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
const MAX_VIEWPORT_TEXTURE_DIMENSION = 4096;

interface SurfacePaintEntry {
  runtime: SurfaceRuntime;
  priority: number;
  stackingChain: Array<{ element: HTMLElement; zIndex: number }>;
}

function createsStackingContext(
  element: HTMLElement,
  computed: CSSStyleDeclaration,
): boolean {
  const positionedWithZ =
    computed.zIndex !== "auto" &&
    ["absolute", "fixed", "relative", "sticky"].includes(computed.position);
  return (
    element === document.documentElement ||
    computed.position === "fixed" ||
    computed.position === "sticky" ||
    positionedWithZ ||
    Number.parseFloat(computed.opacity) < 1 ||
    computed.transform !== "none" ||
    computed.filter !== "none" ||
    computed.perspective !== "none" ||
    computed.mixBlendMode !== "normal" ||
    computed.isolation === "isolate" ||
    computed.contain.includes("paint") ||
    computed.willChange.split(",").some((property) =>
      ["filter", "opacity", "transform"].includes(property.trim()),
    )
  );
}

function surfaceStackingChain(
  element: HTMLElement,
): SurfacePaintEntry["stackingChain"] {
  const chain: SurfacePaintEntry["stackingChain"] = [];
  let current: HTMLElement | null = element;
  while (current) {
    const computed = window.getComputedStyle(current);
    if (createsStackingContext(current, computed)) {
      const parsed = Number.parseInt(computed.zIndex, 10);
      chain.push({
        element: current,
        zIndex: Number.isFinite(parsed) ? parsed : 0,
      });
    }
    current = current.parentElement;
  }
  return chain.reverse();
}

function compareSurfacePaintOrder(
  firstEntry: SurfacePaintEntry,
  secondEntry: SurfacePaintEntry,
): number {
  const first = firstEntry.runtime;
  const second = secondEntry.runtime;
  if (first.element === second.element) return 0;

  // A nested control is painted after its containing card so that its more
  // specific lens field is not overwritten by the parent's field.
  if (first.element.contains(second.element)) return -1;
  if (second.element.contains(first.element)) return 1;

  if (firstEntry.priority !== secondEntry.priority) {
    return firstEntry.priority - secondEntry.priority;
  }

  const sharedLength = Math.min(
    firstEntry.stackingChain.length,
    secondEntry.stackingChain.length,
  );
  for (let index = 0; index < sharedLength; index += 1) {
    const firstContext = firstEntry.stackingChain[index];
    const secondContext = secondEntry.stackingChain[index];
    if (firstContext.element === secondContext.element) continue;
    if (firstContext.zIndex !== secondContext.zIndex) {
      return firstContext.zIndex - secondContext.zIndex;
    }
    const contextPosition = firstContext.element.compareDocumentPosition(
      secondContext.element,
    );
    if (contextPosition & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (contextPosition & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  }

  if (firstEntry.stackingChain.length !== secondEntry.stackingChain.length) {
    const firstRemainder = firstEntry.stackingChain[sharedLength];
    const secondRemainder = secondEntry.stackingChain[sharedLength];
    const firstZ = firstRemainder?.zIndex ?? 0;
    const secondZ = secondRemainder?.zIndex ?? 0;
    if (firstZ !== secondZ) return firstZ - secondZ;
  }

  const position = first.element.compareDocumentPosition(second.element);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return first.id.localeCompare(second.id);
}

function surfaceRectChanged(
  previous: DOMRectReadOnly | null,
  next: DOMRectReadOnly,
): boolean {
  if (!previous) return true;
  const epsilon = 0.2;
  return (
    Math.abs(previous.left - next.left) > epsilon ||
    Math.abs(previous.top - next.top) > epsilon ||
    Math.abs(previous.width - next.width) > epsilon ||
    Math.abs(previous.height - next.height) > epsilon
  );
}

function optionalSurfaceRectChanged(
  previous: DOMRectReadOnly | null,
  next: DOMRectReadOnly | null,
): boolean {
  if (!previous && !next) return false;
  if (!previous || !next) return true;
  return surfaceRectChanged(previous, next);
}

function intersectSurfaceRects(
  first: DOMRectReadOnly,
  second: DOMRectReadOnly,
): DOMRectReadOnly | null {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  if (right <= left || bottom <= top) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

function measureSurfacePresentation(
  element: HTMLElement,
  rect: DOMRectReadOnly,
  viewportRect: DOMRectReadOnly,
): { clipRect: DOMRectReadOnly | null; opacity: number } {
  let clipRect: DOMRectReadOnly | null = intersectSurfaceRects(
    rect,
    viewportRect,
  );
  let opacity = 1;
  let current: HTMLElement | null = element;

  while (current && clipRect) {
    const computed = window.getComputedStyle(current);
    if (
      computed.display === "none" ||
      computed.visibility === "hidden" ||
      computed.visibility === "collapse" ||
      computed.contentVisibility === "hidden"
    ) {
      return { clipRect: null, opacity: 0 };
    }
    const ownOpacity = Number.parseFloat(computed.opacity);
    if (Number.isFinite(ownOpacity)) opacity *= ownOpacity;
    if (opacity <= 0.01) return { clipRect: null, opacity: 0 };

    if (current !== element) {
      const clipsX = ["auto", "hidden", "clip", "scroll"].includes(
        computed.overflowX,
      );
      const clipsY = ["auto", "hidden", "clip", "scroll"].includes(
        computed.overflowY,
      );
      if (clipsX || clipsY || computed.contain.includes("paint")) {
        const ancestorRect = current.getBoundingClientRect();
        const contentLeft = ancestorRect.left + current.clientLeft;
        const contentTop = ancestorRect.top + current.clientTop;
        const contentRect = new DOMRect(
          clipsX ? contentLeft : clipRect.left,
          clipsY ? contentTop : clipRect.top,
          clipsX ? current.clientWidth : clipRect.width,
          clipsY ? current.clientHeight : clipRect.height,
        );
        clipRect = intersectSurfaceRects(clipRect, contentRect);
      }
    }
    current = current.parentElement;
  }

  return { clipRect, opacity: Math.max(0, Math.min(1, opacity)) };
}

export const TahoeGlassEngineContext =
  React.createContext<TahoeGlassEngineContextValue | null>(null);

export interface TahoeGlassProviderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** The single visual scene refracted by every registered surface. */
  scene: React.ReactNode;
  children?: React.ReactNode;
  sceneClassName?: string;
  sceneStyle?: React.CSSProperties;
  /** Diagnostic name for the owned DOM/SVG scene (for example vanta-clouds). */
  sourceLabel?: string;
  /** Allows pointer and accessibility interaction with an owned map scene. */
  sceneInteractive?: boolean;
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
  /** Query string `?glassDebug=1` also enables this overlay. */
  debug?: boolean;
  onDiagnosticsChange?: (diagnostics: TahoeGlassDiagnostics) => void;
}

function webglSourceLabel(
  source: TahoeGlassWebGLSource | undefined,
  domSourceLabel: string,
): string {
  if (!source) return domSourceLabel;
  return source.label || domSourceLabel;
}

function subscribeGlassDebug(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener("hashchange", onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener("hashchange", onStoreChange);
  };
}

function glassDebugQueryEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("glassDebug") === "1";
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
  consumeSceneFrameRequest: () => boolean;
  subscribeSceneFrameRequests: (listener: () => void) => () => void;
  retryBackend: () => void;
} {
  const context = React.useContext(TahoeGlassEngineContext);
  return React.useMemo(
    () => ({
      requestRender: context?.requestRender ?? (() => undefined),
      renderNow: context?.renderNow ?? (() => undefined),
      consumeSceneFrameRequest:
        context?.consumeSceneFrameRequest ?? (() => false),
      subscribeSceneFrameRequests:
        context?.subscribeSceneFrameRequests ?? (() => () => undefined),
      retryBackend: context?.retryBackend ?? (() => undefined),
    }),
    [
      context?.consumeSceneFrameRequest,
      context?.renderNow,
      context?.requestRender,
      context?.retryBackend,
      context?.subscribeSceneFrameRequests,
    ],
  );
}

export function TahoeGlassProvider({
  scene,
  children,
  className,
  sceneClassName,
  sceneStyle,
  sourceLabel: domSourceLabel = "dom-scene",
  sceneInteractive = false,
  preferredBackend = "auto",
  fallback = "webgl",
  webglSource,
  respectReducedMotion = true,
  respectReducedTransparency = true,
  maxDpr = 1,
  viewportMode = "fixed",
  contentClassName,
  contentStyle,
  debug = false,
  onDiagnosticsChange,
  style,
  ...props
}: TahoeGlassProviderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
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
  const lastDebugFrameRef = React.useRef(0);
  const activeFilterRef = React.useRef<0 | 1>(0);
  const frameRef = React.useRef<number | null>(null);
  const motionUntilRef = React.useRef(0);
  const stableGeometryFramesRef = React.useRef(0);
  const geometryDirtyRef = React.useRef(true);
  const mapRevisionRef = React.useRef(0);
  const mapHasSurfaceRef = React.useRef(false);
  const paintSignatureRef = React.useRef("");
  const svgAppliedRevisionRef = React.useRef(-1);
  const webglUploadedRevisionRef = React.useRef(-1);
  const synchronousSceneFrameRequestedRef = React.useRef(true);
  const sceneFrameListenersRef = React.useRef(new Set<() => void>());
  const renderFrameRef = React.useRef<(refreshSource?: boolean) => void>(
    () => undefined,
  );
  const mountedRef = React.useRef(false);
  const [environmentRevision, setEnvironmentRevision] = React.useState(0);
  const [debugSurfaces, setDebugSurfaces] = React.useState<
    TahoeGlassDebugSurface[]
  >([]);
  const queryDebugEnabled = React.useSyncExternalStore(
    subscribeGlassDebug,
    glassDebugQueryEnabled,
    () => false,
  );
  const debugEnabled = debug || queryDebugEnabled;

  const filterId0 = `${React.useId().replace(/:/g, "-")}-tahoe-0`;
  const filterId1 = `${React.useId().replace(/:/g, "-")}-tahoe-1`;

  const [diagnostics, setDiagnostics] = React.useState<TahoeGlassDiagnostics>(
    () => ({ ...INITIAL_DIAGNOSTICS, source: domSourceLabel }),
  );
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

  const scheduleRender = React.useCallback(() => {
    synchronousSceneFrameRequestedRef.current = true;
    for (const listener of sceneFrameListenersRef.current) listener();
    if (frameRef.current !== null || typeof window === "undefined") return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      renderFrameRef.current();
    });
  }, []);

  const requestRender = React.useCallback((_reason?: string) => {
    void _reason;
    geometryDirtyRef.current = true;
    paintSignatureRef.current = "";
    scheduleRender();
  }, [scheduleRender]);

  /**
   * Synchronous bridge for WebGL scenes with preserveDrawingBuffer=false.
   * Call from the scene's afterRender hook while its framebuffer is valid.
   */
  const renderNow = React.useCallback(() => {
    if (typeof window === "undefined") return;
    synchronousSceneFrameRequestedRef.current = false;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    renderFrameRef.current(true);
  }, []);

  const consumeSceneFrameRequest = React.useCallback(() => {
    const requested = synchronousSceneFrameRequestedRef.current;
    synchronousSceneFrameRequestedRef.current = false;
    return requested;
  }, []);

  const subscribeSceneFrameRequests = React.useCallback(
    (listener: () => void) => {
      sceneFrameListenersRef.current.add(listener);
      return () => sceneFrameListenersRef.current.delete(listener);
    },
    [],
  );

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
      options?: { continuous?: boolean; priority?: number },
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
        priority:
          typeof options?.priority === "number" &&
          Number.isFinite(options.priority)
            ? options.priority
            : null,
        rect: null,
        clipRect: null,
        opacity: 0,
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
    const content = contentRef.current;
    if (!viewport || !content) return;
    let stopped = false;

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

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
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
      },
      {
        root:
          viewportMode === "contained" ? containerRef.current : null,
      },
    );
    intersectionObserverRef.current = intersectionObserver;

    for (const runtime of registryRef.current.values()) {
      surfaceObserver.observe(runtime.element);
      intersectionObserver.observe(runtime.element);
    }

    const moved = () => requestRender("viewport-move");
    const trackLayoutMotion = (durationMs = 850) => {
      motionUntilRef.current = Math.max(
        motionUntilRef.current,
        performance.now() + durationMs,
      );
      stableGeometryFramesRef.current = 0;
      scheduleRender();
    };
    let pointerActive = false;
    const eventBelongsToProvider = (event: Event) => {
      if (!(event.target instanceof Node)) return false;
      if (containerRef.current?.contains(event.target)) return true;
      for (const runtime of registryRef.current.values()) {
        if (runtime.element.contains(event.target)) return true;
      }
      return false;
    };
    const motionStarted = (event: Event) => {
      if (eventBelongsToProvider(event)) trackLayoutMotion();
    };
    const motionSettled = (event: Event) => {
      if (eventBelongsToProvider(event)) trackLayoutMotion(120);
    };
    const pointerDown = (event: PointerEvent) => {
      if (!eventBelongsToProvider(event)) return;
      pointerActive = true;
      trackLayoutMotion();
    };
    const pointerBoundaryChanged = (event: PointerEvent) => {
      if (eventBelongsToProvider(event)) trackLayoutMotion(220);
    };
    const focusChanged = (event: FocusEvent) => {
      if (eventBelongsToProvider(event)) trackLayoutMotion(220);
    };
    const pointerMove = () => {
      if (pointerActive) trackLayoutMotion(180);
    };
    const pointerUp = () => {
      if (!pointerActive) return;
      pointerActive = false;
      trackLayoutMotion(120);
    };
    const mediaLoaded = (event: Event) => {
      if (eventBelongsToProvider(event)) trackLayoutMotion(180);
    };

    const contentMutations = new MutationObserver((records) => {
      const affectsLayout = records.some((record) => {
        if (
          record.type === "attributes" &&
          record.attributeName === "style" &&
          record.target instanceof HTMLElement &&
          record.target.hasAttribute("data-tahoe-glass-surface")
        ) {
          // Rim variables are written to the surface style on every optical
          // frame; ignoring those writes prevents a self-sustaining loop.
          return false;
        }
        return true;
      });
      if (affectsLayout) trackLayoutMotion(220);
    });
    contentMutations.observe(content, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "open"],
    });

    window.addEventListener("resize", moved, { passive: true });
    window.addEventListener("scroll", moved, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", moved, { passive: true });
    window.visualViewport?.addEventListener("scroll", moved, { passive: true });
    window.addEventListener("pointermove", pointerMove, { passive: true });
    window.addEventListener("pointerup", pointerUp, { passive: true });
    window.addEventListener("pointercancel", pointerUp, { passive: true });
    document.addEventListener("pointerdown", pointerDown, { passive: true });
    document.addEventListener("pointerover", pointerBoundaryChanged, {
      passive: true,
    });
    document.addEventListener("pointerout", pointerBoundaryChanged, {
      passive: true,
    });
    document.addEventListener("focusin", focusChanged);
    document.addEventListener("focusout", focusChanged);
    document.addEventListener("transitionrun", motionStarted, true);
    document.addEventListener("transitionend", motionSettled, true);
    document.addEventListener("transitioncancel", motionSettled, true);
    document.addEventListener("animationstart", motionStarted, true);
    document.addEventListener("animationend", motionSettled, true);
    document.addEventListener("animationcancel", motionSettled, true);
    document.addEventListener("load", mediaLoaded, true);
    document.addEventListener("visibilitychange", moved);
    void document.fonts?.ready.then(() => {
      if (!stopped) trackLayoutMotion(180);
    });

    return () => {
      stopped = true;
      containerObserver.disconnect();
      surfaceObserver.disconnect();
      intersectionObserver.disconnect();
      contentMutations.disconnect();
      surfaceResizeObserverRef.current = null;
      intersectionObserverRef.current = null;
      window.removeEventListener("resize", moved);
      window.removeEventListener("scroll", moved, true);
      window.visualViewport?.removeEventListener("resize", moved);
      window.visualViewport?.removeEventListener("scroll", moved);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("pointerover", pointerBoundaryChanged);
      document.removeEventListener("pointerout", pointerBoundaryChanged);
      document.removeEventListener("focusin", focusChanged);
      document.removeEventListener("focusout", focusChanged);
      document.removeEventListener("transitionrun", motionStarted, true);
      document.removeEventListener("transitionend", motionSettled, true);
      document.removeEventListener("transitioncancel", motionSettled, true);
      document.removeEventListener("animationstart", motionStarted, true);
      document.removeEventListener("animationend", motionSettled, true);
      document.removeEventListener("animationcancel", motionSettled, true);
      document.removeEventListener("load", mediaLoaded, true);
      document.removeEventListener("visibilitychange", moved);
    };
  }, [refreshCounts, requestRender, scheduleRender, viewportMode]);

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
    const dimensionDprCap = Math.min(
      MAX_VIEWPORT_TEXTURE_DIMENSION / Math.max(1, window.innerWidth),
      MAX_VIEWPORT_TEXTURE_DIMENSION / Math.max(1, window.innerHeight),
    );
    const dpr = Math.max(
      0.25,
      Math.min(
        capabilities.dpr,
        maxDpr,
        viewportDprCap,
        dimensionDprCap,
      ),
    );
    const reducedMotion = respectReducedMotion && capabilities.reducedMotion;
    const reducedTransparency =
      respectReducedTransparency &&
      (capabilities.reducedTransparency || capabilities.forcedColors);

    rendererRef.current?.dispose();
    rendererRef.current = null;
    sceneRef.current?.style.removeProperty("--tahoe-scene-filter");
    geometryDirtyRef.current = true;
    svgAppliedRevisionRef.current = -1;
    webglUploadedRevisionRef.current = -1;

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
        source: domSourceLabel,
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
        source: domSourceLabel,
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
        source: webglSourceLabel(webglSource, domSourceLabel),
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
            source: webglSourceLabel(webglSource, domSourceLabel),
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
            source: domSourceLabel,
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
      source: domSourceLabel,
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
    domSourceLabel,
    webglSource,
  ]);

  const renderFrame = React.useCallback((refreshSource = false) => {
    const viewport = viewportRef.current;
    const sceneElement = sceneRef.current;
    const current = diagnosticsRef.current;
    if (!viewport || !sceneElement) return;

    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return;
    const dpr = Math.max(0.25, current.dpr);
    const pixelWidth = Math.max(1, Math.round(viewportRect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(viewportRect.height * dpr));
    const now = performance.now();
    const hasContinuousSurface = [...registryRef.current.values()].some(
      (surface) => surface.visible && surface.continuous,
    );
    const trackingMotion =
      !current.reducedMotion && motionUntilRef.current > now;
    const shouldMeasureGeometry =
      geometryDirtyRef.current ||
      trackingMotion ||
      hasContinuousSurface ||
      debugEnabled;

    let composite = compositeCanvasRef.current;
    const canvasSizeChanged =
      !composite ||
      composite.width !== pixelWidth ||
      composite.height !== pixelHeight;
    if (!composite) {
      composite = document.createElement("canvas");
      compositeCanvasRef.current = composite;
    }

    let geometryChanged = false;
    let presentationChanged = false;
    let visibleSurfaceCount = current.visibleSurfaceCount;
    let mapRebuilt = false;
    const paintEntries = shouldMeasureGeometry
      ? [...registryRef.current.values()]
          .map((runtime) => ({
            runtime,
            priority: runtime.priority ?? 0,
            stackingChain: surfaceStackingChain(runtime.element),
          }))
          .sort(compareSurfacePaintOrder)
      : [];

    if (shouldMeasureGeometry) {
      visibleSurfaceCount = 0;
      for (const { runtime } of paintEntries) {
        const rect = runtime.element.getBoundingClientRect();
        const presentation = measureSurfacePresentation(
          runtime.element,
          rect,
          viewportRect,
        );
        geometryChanged ||= surfaceRectChanged(runtime.rect, rect);
        presentationChanged ||=
          optionalSurfaceRectChanged(runtime.clipRect, presentation.clipRect) ||
          Math.abs(runtime.opacity - presentation.opacity) > 0.01;
        runtime.rect = rect;
        runtime.clipRect = presentation.clipRect;
        runtime.opacity = presentation.opacity;
        runtime.measured = true;
        if (
          runtime.visible &&
          runtime.clipRect &&
          runtime.opacity > 0.01
        ) {
          visibleSurfaceCount += 1;
        }
      }

      const nextPaintSignature = paintEntries
        .map(({ runtime, priority, stackingChain }) =>
          [
            runtime.id,
            priority,
            stackingChain.map(({ zIndex }) => zIndex).join("/"),
            runtime.opacity.toFixed(3),
            runtime.clipRect?.left.toFixed(1) ?? "x",
            runtime.clipRect?.top.toFixed(1) ?? "x",
            runtime.clipRect?.width.toFixed(1) ?? "x",
            runtime.clipRect?.height.toFixed(1) ?? "x",
          ].join(":"),
        )
        .join("|");
      const paintOrderChanged =
        nextPaintSignature !== paintSignatureRef.current;

      if (trackingMotion && !hasContinuousSurface) {
        stableGeometryFramesRef.current =
          geometryChanged || presentationChanged || paintOrderChanged
          ? 0
          : stableGeometryFramesRef.current + 1;
        if (stableGeometryFramesRef.current >= 2) {
          motionUntilRef.current = 0;
        }
      } else if (geometryChanged || presentationChanged || paintOrderChanged) {
        stableGeometryFramesRef.current = 0;
      }

      const shouldRebuildMap =
        geometryDirtyRef.current ||
        geometryChanged ||
        presentationChanged ||
        paintOrderChanged ||
        canvasSizeChanged;
      if (shouldRebuildMap) {
        if (composite.width !== pixelWidth) composite.width = pixelWidth;
        if (composite.height !== pixelHeight) composite.height = pixelHeight;
        const context = composite.getContext("2d");
        if (!context) {
          commitDiagnostics({
            ...current,
            status: "failed",
            backend: "solid",
            source: domSourceLabel,
            reason: "displacement-map-context-unavailable",
          });
          return;
        }

        context.clearRect(0, 0, pixelWidth, pixelHeight);
        // An opaque neutral base makes opacity fades attenuate the bend vector
        // identically in SVG and WebGL without premultiplied-alpha artifacts.
        context.fillStyle = "rgb(128, 128, 128)";
        context.fillRect(0, 0, pixelWidth, pixelHeight);

        let mapHasSurface = false;
        for (const { runtime } of paintEntries) {
          const rect = runtime.rect;
          const clipRect = runtime.clipRect;
          if (
            !rect ||
            !clipRect ||
            !runtime.visible ||
            runtime.opacity <= 0.01
          ) {
            runtime.field = null;
            runtime.fieldKey = "";
            runtime.drawn = false;
            writeSurfaceDiagnostics(runtime, current);
            continue;
          }

          const memoryBoundDpr = Math.sqrt(
            MAX_SURFACE_FIELD_PIXELS /
              Math.max(1, rect.width * rect.height),
          );
          const fieldDpr = Math.max(0.25, Math.min(dpr, memoryBoundDpr));
          const fieldKey = `${rect.width.toFixed(2)}:${rect.height.toFixed(2)}:${fieldDpr.toFixed(3)}`;
          if (!runtime.field || runtime.fieldKey !== fieldKey) {
            runtime.drawn = false;
            runtime.field = createTahoeDisplacementField(
              rect.width,
              rect.height,
              fieldDpr,
              0,
            );
            runtime.fieldKey = fieldKey;
          }
          if (!runtime.field) {
            rendererRef.current?.dispose();
            rendererRef.current = null;
            sceneElement.style.removeProperty("--tahoe-scene-filter");
            commitDiagnostics({
              ...current,
              status: "fallback",
              backend: fallback === "solid" ? "solid" : "css-blur",
              source: domSourceLabel,
              reason: "surface-map-generation-failed",
            });
            return;
          }

          const sourceScaleX = runtime.field.pixelWidth / rect.width;
          const sourceScaleY = runtime.field.pixelHeight / rect.height;
          context.save();
          context.globalAlpha = runtime.opacity;
          context.drawImage(
            runtime.field.canvas,
            (clipRect.left - rect.left) * sourceScaleX,
            (clipRect.top - rect.top) * sourceScaleY,
            clipRect.width * sourceScaleX,
            clipRect.height * sourceScaleY,
            (clipRect.left - viewportRect.left) * dpr,
            (clipRect.top - viewportRect.top) * dpr,
            clipRect.width * dpr,
            clipRect.height * dpr,
          );
          context.restore();
          runtime.drawn = true;
          mapHasSurface = true;

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

        mapHasSurfaceRef.current = mapHasSurface;
        paintSignatureRef.current = nextPaintSignature;
        mapRevisionRef.current += 1;
        geometryDirtyRef.current = false;
        mapRebuilt = true;
      } else {
        geometryDirtyRef.current = false;
      }
    }

    if (debugEnabled && now - lastDebugFrameRef.current >= 80) {
      lastDebugFrameRef.current = now;
      setDebugSurfaces(
        [...registryRef.current.values()].map((runtime) => {
          const rect = runtime.rect ?? runtime.element.getBoundingClientRect();
          const status =
            (runtime.element.getAttribute(
              "data-tahoe-glass-state",
            ) as TahoeGlassStatus | null) || current.status;
          const backend =
            (runtime.element.getAttribute(
              "data-tahoe-glass-backend",
            ) as TahoeGlassBackend | null) || current.backend;
          return {
            id: runtime.id,
            variant:
              runtime.element.getAttribute("data-tahoe-glass-surface") ||
              "surface",
            status,
            backend,
            source:
              runtime.element.getAttribute("data-tahoe-glass-source") ||
              current.source,
            reason: runtime.element.getAttribute(
              "data-tahoe-glass-fallback-reason",
            ),
            visible: runtime.visible,
            measured: runtime.measured,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          };
        }),
      );
    }

    const frameDiagnostics = { ...current, visibleSurfaceCount };
    const backendCanDraw =
      mapHasSurfaceRef.current || current.status === "active";

    if (
      (current.status === "initializing" || current.status === "active") &&
      current.backend === "svg" &&
      backendCanDraw &&
      mapRebuilt &&
      svgAppliedRevisionRef.current !== mapRevisionRef.current
    ) {
      const inactive = activeFilterRef.current === 0 ? 1 : 0;
      const feImage = inactive === 0 ? feImage0Ref.current : feImage1Ref.current;
      const nextFilter = inactive === 0 ? filterId0 : filterId1;
      if (feImage) {
        try {
          const mapUrl = composite.toDataURL("image/png");
          if (
            !mapUrl.startsWith("data:image/png;base64,") ||
            mapUrl.length <= "data:image/png;base64,".length
          ) {
            throw new Error("svg-displacement-map-serialization-empty");
          }
          const revision = mapRevisionRef.current;
          // Match the supplied working Tahoe engine: reference the filter as
          // soon as its displacement image is assigned. Chromium does not
          // reliably dispatch `load` on SVGFEImageElement, so waiting for that
          // event creates a circular gate and silently falls back to frost.
          feImage.setAttribute("x", "0");
          feImage.setAttribute("y", "0");
          feImage.setAttribute("width", viewportRect.width.toString());
          feImage.setAttribute("height", viewportRect.height.toString());
          feImage.setAttribute("href", mapUrl);
          sceneElement.style.setProperty(
            "--tahoe-scene-filter",
            `url(#${nextFilter})`,
          );
          sceneElement.style.filter = `url(#${nextFilter})`;
          sceneElement.style.webkitFilter = `url(#${nextFilter})`;
          activeFilterRef.current = inactive;
          svgAppliedRevisionRef.current = revision;
          if (current.status === "initializing" && mapHasSurfaceRef.current) {
            commitDiagnostics({
              ...frameDiagnostics,
              status: "active",
              reason: null,
            });
          }
        } catch (error: unknown) {
          commitDiagnostics({
            ...frameDiagnostics,
            status: "fallback",
            backend: fallback === "solid" ? "solid" : "css-blur",
            source: domSourceLabel,
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
      backendCanDraw
    ) {
      const renderer = rendererRef.current;
      if (renderer) {
        try {
          renderer.resize(viewportRect.width, viewportRect.height, dpr);
          if (webglUploadedRevisionRef.current !== mapRevisionRef.current) {
            renderer.uploadDisplacement(composite);
            webglUploadedRevisionRef.current = mapRevisionRef.current;
          }
          if (
            current.status === "initializing" &&
            renderer.requiresSynchronousRefresh &&
            !refreshSource
          ) {
            return;
          }
          renderer.draw(dpr, refreshSource);
          if (current.status === "initializing" && mapHasSurfaceRef.current) {
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
            scheduleRender();
          }
        } catch (error: unknown) {
          renderer.dispose();
          if (rendererRef.current === renderer) rendererRef.current = null;
          webglUploadedRevisionRef.current = -1;
          commitDiagnostics({
            ...frameDiagnostics,
            status: "fallback",
            backend: fallback === "solid" ? "solid" : "css-blur",
            source: domSourceLabel,
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
      (motionUntilRef.current > performance.now() || hasContinuousSurface)
    ) {
      scheduleRender();
    }
  }, [
    commitDiagnostics,
    debugEnabled,
    domSourceLabel,
    fallback,
    filterId0,
    filterId1,
    scheduleRender,
  ]);

  React.useLayoutEffect(() => {
    renderFrameRef.current = renderFrame;
    requestRender("react-commit");
  }, [renderFrame, requestRender]);

  React.useEffect(() => {
    if (debugEnabled) requestRender("debug-diagnostics-change");
  }, [debugEnabled, diagnostics, requestRender]);

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
      consumeSceneFrameRequest,
      subscribeSceneFrameRequests,
      retryBackend,
    }),
    [
      diagnostics,
      consumeSceneFrameRequest,
      registerSurface,
      renderNow,
      requestRender,
      retryBackend,
      subscribeSceneFrameRequests,
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
        {...props}
        data-tahoe-glass-provider="true"
        data-tahoe-glass-state={diagnostics.status}
        data-tahoe-glass-backend={diagnostics.backend}
        data-tahoe-glass-source={diagnostics.source}
        data-tahoe-glass-fallback-reason={diagnostics.reason || undefined}
        data-tahoe-glass-displacement={TAHOE_DISPLACEMENT_SCALE}
      >
        <div
          ref={viewportRef}
          aria-hidden={sceneInteractive ? undefined : true}
          className={cn(
            "pointer-events-none inset-0 z-0 h-full w-full overflow-hidden",
            viewportMode === "fixed" ? "fixed" : "absolute",
          )}
          data-tahoe-glass-viewport={viewportMode}
        >
          <div
            ref={sceneRef}
            className={cn(
              "absolute inset-0 z-0 h-full w-full [transform:translateZ(0)] will-change-[filter]",
              sceneInteractive ? "pointer-events-auto" : "pointer-events-none",
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
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
            style={{ opacity: webglActive ? 1 : 0 }}
          />

          <svg
            aria-hidden="true"
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
          ref={contentRef}
          className={cn(
            "relative z-[1]",
            sceneInteractive && "pointer-events-none",
            contentClassName,
          )}
          style={{
            ...contentStyle,
            pointerEvents: sceneInteractive ? "none" : contentStyle?.pointerEvents,
          }}
          data-tahoe-glass-content="true"
        >
          {children}
        </div>
        {debugEnabled && (
          <TahoeGlassDebugOverlay
            diagnostics={diagnostics}
            surfaces={debugSurfaces}
          />
        )}
      </div>
    </TahoeGlassEngineContext.Provider>
  );
}
