"use client";

import * as React from "react";

import { TahoeGlassEngineContext } from "@/components/providers/TahoeGlassProvider";
import { cn } from "@/lib/utils";
import {
  TAHOE_DISPLACEMENT_SCALE,
  TAHOE_SPECULAR_SHADOW,
} from "@/lib/tahoe-glass/constants";
import {
  applyTahoeRimVariables,
  calculateTahoeRim,
  createTahoeDisplacementField,
  type TahoeDisplacementField,
} from "@/lib/tahoe-glass/optics";
import { TahoeNavOwnedSceneWebGLRenderer } from "@/lib/tahoe-glass/nav-owned-scene-webgl";
import {
  resolveTahoeNavPlatformRoute,
  type TahoeNavPlatformRoute,
} from "@/lib/tahoe-glass/nav-platform";
import type {
  TahoeGlassContentTone,
  TahoeGlassSemanticTint,
  TahoeGlassSurfaceVariant,
} from "./TahoeGlassSurface";

type TahoeBackdropMode = "svg" | "css-blur" | "solid";
type TahoeOwnedSceneState = "idle" | "initializing" | "active" | "failed";
export type TahoeBackdropSurfaceElement =
  | "div"
  | "section"
  | "article"
  | "nav"
  | "aside"
  | "header"
  | "footer";

export interface TahoeBackdropSurfaceProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {
  as?: TahoeBackdropSurfaceElement;
  variant?: TahoeGlassSurfaceVariant;
  children?: React.ReactNode;
  contentClassName?: string;
  radius?: number | string;
  tone?: TahoeGlassContentTone;
  semanticTint?: TahoeGlassSemanticTint;
  semanticTintOpacity?: number;
}

export type TahoeBackdropHeaderProps = Omit<
  TahoeBackdropSurfaceProps,
  "as" | "variant"
>;

const VARIANT_RADIUS: Record<TahoeGlassSurfaceVariant, string> = {
  card: "28px",
  menu: "24px",
  panel: "32px",
  button: "9999px",
  pill: "9999px",
  recessed: "12px",
  dialog: "32px",
  popover: "22px",
  mediaFrame: "20px",
};

const TONE_CLASS: Record<TahoeGlassContentTone, string | undefined> = {
  inherit: undefined,
  light: "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]",
  dark: "text-black/90 [text-shadow:0_1px_1px_rgba(255,255,255,0.35)]",
};

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function resolvePlatformRoute(): TahoeNavPlatformRoute {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    typeof CSS === "undefined"
  ) {
    return "css-material";
  }

  return resolveTahoeNavPlatformRoute({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    supportsReferenceSyntax:
      CSS.supports("backdrop-filter", "url(#tahoe-nav-probe)") ||
      CSS.supports("-webkit-backdrop-filter", "url(#tahoe-nav-probe)"),
    supportsPrimitives:
      "SVGFEImageElement" in window && "SVGFEDisplacementMapElement" in window,
    reducedTransparency: window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    ).matches,
    forcedColors: window.matchMedia("(forced-colors: active)").matches,
  });
}

function backdropModeForRoute(route: TahoeNavPlatformRoute): TahoeBackdropMode {
  if (route === "solid") return "solid";
  if (route === "svg-live-dom") return "svg";
  return "css-blur";
}

export const TahoeBackdropSurface = React.forwardRef<
  HTMLElement,
  TahoeBackdropSurfaceProps
>(function TahoeBackdropSurface(
  {
    as = "div",
    variant = "card",
    children,
    className,
    contentClassName,
    radius,
    tone = "inherit",
    semanticTint = "none",
    semanticTintOpacity = 0.07,
    style,
    ...props
  },
  forwardedRef,
) {
  const context = React.useContext(TahoeGlassEngineContext);
  const providerDiagnostics = context?.diagnostics;
  const registerSurface = context?.registerSurface;
  const unregisterSurface = context?.unregisterSurface;
  const requestRender = context?.requestRender;
  const subscribeOwnedSceneAfterRender =
    context?.subscribeOwnedSceneAfterRender;
  const internalRef = React.useRef<HTMLElement | null>(null);
  const filterRef = React.useRef<SVGFilterElement | null>(null);
  const feImageRef = React.useRef<SVGFEImageElement | null>(null);
  const ownedSceneCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const ownedSceneRendererRef =
    React.useRef<TahoeNavOwnedSceneWebGLRenderer | null>(null);
  const ownedSceneFieldRef = React.useRef<TahoeDisplacementField | null>(null);
  const ownedSceneUploadedFieldRef =
    React.useRef<TahoeDisplacementField | null>(null);
  const ownedSceneSourceRef = React.useRef<HTMLCanvasElement | null>(null);
  const ownedSceneGeometryKeyRef = React.useRef("");
  const ownedSceneFrameAttemptsRef = React.useRef(0);
  const ownedSceneStateRef = React.useRef<TahoeOwnedSceneState>("idle");
  const ownedSceneReasonRef = React.useRef<string | undefined>(undefined);
  const resizeFrameRef = React.useRef<number | null>(null);
  const lastSizeKeyRef = React.useRef("");
  const surfaceId = React.useId();
  const filterId = `${React.useId().replace(/:/g, "-")}-backdrop`;
  const [platformRoute, setPlatformRoute] =
    React.useState<TahoeNavPlatformRoute>("css-material");
  const [capabilityResolved, setCapabilityResolved] = React.useState(false);
  const [mapReady, setMapReady] = React.useState(false);
  const [ownedSceneState, setOwnedSceneState] =
    React.useState<TahoeOwnedSceneState>("idle");
  const [ownedSceneLifecycleRevision, setOwnedSceneLifecycleRevision] =
    React.useState(0);
  const [ownedSceneReason, setOwnedSceneReason] = React.useState<
    string | undefined
  >(undefined);
  const mode = backdropModeForRoute(platformRoute);
  const ownedSceneEligible = platformRoute === "webgl-owned-scene";

  const commitOwnedSceneState = React.useCallback(
    (nextState: TahoeOwnedSceneState, nextReason?: string) => {
      // Reduced-motion can make the proven source frame the final RAF. Apply
      // visibility synchronously instead of waiting for React to commit.
      if (ownedSceneCanvasRef.current) {
        ownedSceneCanvasRef.current.style.opacity =
          nextState === "active" ? "1" : "0";
      }
      if (ownedSceneStateRef.current !== nextState) {
        ownedSceneStateRef.current = nextState;
        setOwnedSceneState(nextState);
      }
      if (ownedSceneReasonRef.current !== nextReason) {
        ownedSceneReasonRef.current = nextReason;
        setOwnedSceneReason(nextReason);
      }
    },
    [],
  );

  const setRef = React.useCallback(
    (element: HTMLElement | null) => {
      internalRef.current = element;
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  React.useEffect(() => {
    const transparency = window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    );
    const forcedColors = window.matchMedia("(forced-colors: active)");
    const updateMode = () => {
      setPlatformRoute(resolvePlatformRoute());
      setCapabilityResolved(true);
    };

    updateMode();
    transparency.addEventListener("change", updateMode);
    forcedColors.addEventListener("change", updateMode);
    return () => {
      transparency.removeEventListener("change", updateMode);
      forcedColors.removeEventListener("change", updateMode);
    };
  }, []);

  React.useEffect(() => {
    if (ownedSceneEligible && mode === "css-blur") {
      commitOwnedSceneState(
        "initializing",
        "nav-owned-scene-awaiting-visible-frame",
      );
    } else {
      commitOwnedSceneState("idle");
    }
  }, [commitOwnedSceneState, mode, ownedSceneEligible]);

  const updateOptics = React.useCallback(() => {
    const element = internalRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const sizeKey = `${width}x${height}:${platformRoute}`;
    if (sizeKey === lastSizeKeyRef.current) return;

    const field = createTahoeDisplacementField(
      width,
      height,
      1,
      ownedSceneEligible ? 0 : 255,
    );
    if (!field) {
      ownedSceneFieldRef.current = null;
      setMapReady(false);
      if (ownedSceneEligible) {
        commitOwnedSceneState(
          "failed",
          "nav-owned-scene-displacement-unavailable",
        );
      }
      return;
    }
    ownedSceneFieldRef.current = ownedSceneEligible ? field : null;
    ownedSceneUploadedFieldRef.current = null;
    ownedSceneGeometryKeyRef.current = "";

    const viewport = window.visualViewport;
    const viewportWidth = Math.max(1, viewport?.width || window.innerWidth);
    const viewportHeight = Math.max(1, viewport?.height || window.innerHeight);
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const centerX = (rect.left - viewportLeft + rect.width / 2) / viewportWidth;
    const centerY = (rect.top - viewportTop + rect.height / 2) / viewportHeight;
    applyTahoeRimVariables(element, calculateTahoeRim(field, centerX, centerY));

    if (mode === "svg" && filterRef.current && feImageRef.current) {
      const outset = TAHOE_DISPLACEMENT_SCALE;
      filterRef.current.setAttribute("x", String(-outset));
      filterRef.current.setAttribute("y", String(-outset));
      filterRef.current.setAttribute("width", String(width + outset * 2));
      filterRef.current.setAttribute("height", String(height + outset * 2));
      feImageRef.current.setAttribute("x", "0");
      feImageRef.current.setAttribute("y", "0");
      feImageRef.current.setAttribute("width", String(width));
      feImageRef.current.setAttribute("height", String(height));
      const mapUrl = field.canvas.toDataURL("image/png");
      if (!mapUrl.startsWith("data:image/png")) {
        setMapReady(false);
        return;
      }
      feImageRef.current.setAttribute("href", mapUrl);
      setMapReady(true);
    } else {
      setMapReady(false);
    }

    lastSizeKeyRef.current = sizeKey;
    if (ownedSceneEligible) {
      requestRender?.("nav-owned-scene-optics-update");
    }
  }, [
    commitOwnedSceneState,
    mode,
    ownedSceneEligible,
    platformRoute,
    requestRender,
  ]);

  React.useLayoutEffect(() => {
    lastSizeKeyRef.current = "";
    updateOptics();
  }, [mode, updateOptics]);

  React.useEffect(() => {
    const element = internalRef.current;
    if (!element) return;

    const scheduleUpdate = () => {
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        lastSizeKeyRef.current = "";
        ownedSceneGeometryKeyRef.current = "";
        updateOptics();
        if (ownedSceneEligible) {
          requestRender?.("nav-owned-scene-viewport-resize");
        }
      });
    };
    const scheduleAlignmentFrame = () => {
      ownedSceneGeometryKeyRef.current = "";
      requestRender?.("nav-owned-scene-viewport-move");
    };
    const restoreOwnedScene = () => {
      if (ownedSceneEligible && ownedSceneStateRef.current !== "idle") {
        commitOwnedSceneState(
          "initializing",
          "nav-owned-scene-retry-requested",
        );
        setOwnedSceneLifecycleRevision((revision) => revision + 1);
      }
      scheduleUpdate();
      requestRender?.("nav-owned-scene-page-restore");
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") restoreOwnedScene();
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.addEventListener("pageshow", restoreOwnedScene);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleAlignmentFrame);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.removeEventListener("pageshow", restoreOwnedScene);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener(
        "scroll",
        scheduleAlignmentFrame,
      );
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [commitOwnedSceneState, ownedSceneEligible, requestRender, updateOptics]);

  React.useEffect(() => {
    if (!ownedSceneEligible || mode !== "css-blur") return;

    const targetCanvas = ownedSceneCanvasRef.current;
    if (!targetCanvas || !subscribeOwnedSceneAfterRender || !requestRender) {
      commitOwnedSceneState(
        "failed",
        "nav-owned-scene-provider-bridge-unavailable",
      );
      return;
    }

    // Keep the local buffer hidden until the same synchronous Vanta frame has
    // both drawn and passed the output proof.
    targetCanvas.style.opacity = "0";
    if (ownedSceneStateRef.current === "active") {
      commitOwnedSceneState(
        "initializing",
        "nav-owned-scene-renderer-reinitializing",
      );
    }

    let effectActive = true;
    let observedSourceCanvas: HTMLCanvasElement | null = null;
    let visibilityTimeoutId: number | null = null;
    let proofRetryTimeoutId: number | null = null;

    const clearVisibilityTimeout = () => {
      if (visibilityTimeoutId === null) return;
      window.clearTimeout(visibilityTimeoutId);
      visibilityTimeoutId = null;
    };
    const clearProofRetry = () => {
      if (proofRetryTimeoutId === null) return;
      window.clearTimeout(proofRetryTimeoutId);
      proofRetryTimeoutId = null;
    };
    const scheduleProofRetry = (reason: string) => {
      clearProofRetry();
      proofRetryTimeoutId = window.setTimeout(() => {
        proofRetryTimeoutId = null;
        if (effectActive && ownedSceneStateRef.current === "initializing") {
          requestRender(reason);
        }
      }, 0);
    };

    const releaseRenderer = (resetCanvas: boolean) => {
      targetCanvas.style.opacity = "0";
      clearProofRetry();
      ownedSceneRendererRef.current?.dispose();
      ownedSceneRendererRef.current = null;
      ownedSceneUploadedFieldRef.current = null;
      ownedSceneSourceRef.current = null;
      ownedSceneGeometryKeyRef.current = "";
      ownedSceneFrameAttemptsRef.current = 0;
      if (resetCanvas) {
        targetCanvas.width = 1;
        targetCanvas.height = 1;
      }
    };

    const failOwnedScene = (reason: string, resetCanvas = true) => {
      clearVisibilityTimeout();
      releaseRenderer(resetCanvas);
      if (effectActive) commitOwnedSceneState("failed", reason);
    };

    const armVisibilityTimeout = () => {
      clearVisibilityTimeout();
      visibilityTimeoutId = window.setTimeout(() => {
        if (effectActive && ownedSceneStateRef.current === "initializing") {
          failOwnedScene("nav-owned-scene-visible-frame-timeout");
        }
      }, 5000);
    };

    const handleSourceContextLost = (event: Event) => {
      event.preventDefault();
      failOwnedScene("nav-owned-scene-source-webgl-context-lost", true);
    };
    const handleSourceContextRestored = () => {
      if (!effectActive) return;
      commitOwnedSceneState(
        "initializing",
        "nav-owned-scene-source-context-restored",
      );
      armVisibilityTimeout();
      requestRender("nav-owned-scene-source-context-restored");
    };
    const observeSourceCanvas = (sourceCanvas: HTMLCanvasElement) => {
      if (observedSourceCanvas === sourceCanvas) return false;
      observedSourceCanvas?.removeEventListener(
        "webglcontextlost",
        handleSourceContextLost,
      );
      observedSourceCanvas?.removeEventListener(
        "webglcontextrestored",
        handleSourceContextRestored,
      );
      observedSourceCanvas = sourceCanvas;
      sourceCanvas.addEventListener(
        "webglcontextlost",
        handleSourceContextLost,
      );
      sourceCanvas.addEventListener(
        "webglcontextrestored",
        handleSourceContextRestored,
      );
      return true;
    };

    const drawOwnedScene = (sourceCanvas: HTMLCanvasElement) => {
      if (!effectActive) return;

      const hadObservedSource = observedSourceCanvas !== null;
      const observedNewSource = observeSourceCanvas(sourceCanvas);
      if (observedNewSource && hadObservedSource) {
        // A remounted Vanta canvas can have identical geometry but an empty
        // first buffer. Hide and re-prove it instead of trusting the previous
        // source's successful frame.
        releaseRenderer(false);
        commitOwnedSceneState(
          "initializing",
          "nav-owned-scene-source-replaced",
        );
        armVisibilityTimeout();
      } else if (observedNewSource && ownedSceneStateRef.current === "failed") {
        commitOwnedSceneState(
          "initializing",
          "nav-owned-scene-source-replaced",
        );
        armVisibilityTimeout();
      }
      if (
        ownedSceneStateRef.current === "failed" ||
        ownedSceneStateRef.current === "idle"
      )
        return;

      const header = internalRef.current;
      const displacement = ownedSceneFieldRef.current;
      if (!header || !displacement) {
        scheduleProofRetry("nav-owned-scene-awaiting-geometry");
        return;
      }

      const headerRect = header.getBoundingClientRect();
      const sourceRect = sourceCanvas.getBoundingClientRect();
      if (
        headerRect.width <= 0 ||
        headerRect.height <= 0 ||
        sourceRect.width <= 0 ||
        sourceRect.height <= 0 ||
        sourceCanvas.width <= 0 ||
        sourceCanvas.height <= 0
      ) {
        scheduleProofRetry("nav-owned-scene-awaiting-visible-source");
        return;
      }

      try {
        // Vanta does not preserve its drawing buffer. Creating the renderer,
        // uploading the source and drawing here keeps the copy in the same
        // synchronous afterRender turn while that framebuffer is valid.
        let renderer = ownedSceneRendererRef.current;
        if (!renderer) {
          renderer = new TahoeNavOwnedSceneWebGLRenderer(
            targetCanvas,
            sourceCanvas,
          );
          ownedSceneRendererRef.current = renderer;
        }

        const geometryKey = [
          headerRect.left,
          headerRect.top,
          headerRect.width,
          headerRect.height,
          sourceRect.left,
          sourceRect.top,
          sourceRect.width,
          sourceRect.height,
          sourceCanvas.width,
          sourceCanvas.height,
        ]
          .map((value) => value.toFixed(2))
          .join(":");
        const geometryChanged =
          geometryKey !== ownedSceneGeometryKeyRef.current;
        const fieldChanged =
          displacement !== ownedSceneUploadedFieldRef.current;
        const sourceChanged = sourceCanvas !== ownedSceneSourceRef.current;

        if (geometryChanged || fieldChanged || sourceChanged) {
          renderer.resize(headerRect.width, headerRect.height, 1);
          renderer.update({
            scene: sourceCanvas,
            displacement,
            viewport: {
              left: sourceRect.left,
              top: sourceRect.top,
              width: sourceRect.width,
              height: sourceRect.height,
            },
            headerRect: {
              left: headerRect.left,
              top: headerRect.top,
              width: headerRect.width,
              height: headerRect.height,
            },
            displacementScale: TAHOE_DISPLACEMENT_SCALE,
            maxOpacity: 0.78,
            causticStrength: 0.1,
          });
          ownedSceneGeometryKeyRef.current = geometryKey;
          ownedSceneUploadedFieldRef.current = displacement;
          ownedSceneSourceRef.current = sourceCanvas;
        }

        renderer.draw();

        if (ownedSceneStateRef.current !== "active") {
          ownedSceneFrameAttemptsRef.current += 1;
          if (renderer.hasVisibleOutput()) {
            clearProofRetry();
            clearVisibilityTimeout();
            // Reveal this proven buffer before Vanta's reduced-motion
            // microtask can stop the source RAF. React state mirrors this in
            // the following commit, but is not the first-paint gate.
            unregisterSurface?.(surfaceId);
            targetCanvas.style.opacity = "1";
            commitOwnedSceneState("active");
          } else if (ownedSceneFrameAttemptsRef.current >= 120) {
            failOwnedScene("nav-owned-scene-visible-output-proof-failed");
          } else {
            scheduleProofRetry("nav-owned-scene-visibility-proof-retry");
          }
        }
      } catch (error) {
        failOwnedScene(
          error instanceof Error
            ? error.message
            : "nav-owned-scene-render-failed",
        );
      }
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      clearVisibilityTimeout();
      releaseRenderer(false);
      if (effectActive) {
        commitOwnedSceneState("failed", "nav-owned-scene-webgl-context-lost");
      }
    };
    const handleContextRestored = () => {
      if (!effectActive) return;
      releaseRenderer(false);
      commitOwnedSceneState("initializing", "nav-owned-scene-context-restored");
      armVisibilityTimeout();
      requestRender("nav-owned-scene-context-restored");
    };

    targetCanvas.addEventListener("webglcontextlost", handleContextLost);
    targetCanvas.addEventListener(
      "webglcontextrestored",
      handleContextRestored,
    );
    const unsubscribe = subscribeOwnedSceneAfterRender(drawOwnedScene);
    armVisibilityTimeout();
    requestRender("nav-owned-scene-init");

    return () => {
      effectActive = false;
      clearProofRetry();
      clearVisibilityTimeout();
      unsubscribe();
      observedSourceCanvas?.removeEventListener(
        "webglcontextlost",
        handleSourceContextLost,
      );
      observedSourceCanvas?.removeEventListener(
        "webglcontextrestored",
        handleSourceContextRestored,
      );
      observedSourceCanvas = null;
      targetCanvas.removeEventListener("webglcontextlost", handleContextLost);
      targetCanvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );
      releaseRenderer(true);
    };
  }, [
    commitOwnedSceneState,
    mode,
    ownedSceneEligible,
    ownedSceneLifecycleRevision,
    requestRender,
    subscribeOwnedSceneAfterRender,
    surfaceId,
    unregisterSurface,
  ]);

  // Chromium's live backdrop already includes the owned scene. Apple-mobile
  // keeps the provider surface registered while its nav-local renderer proves
  // a visible frame, then unregisters it to prevent double refraction.
  React.useLayoutEffect(() => {
    const element = internalRef.current;
    if (
      mode !== "css-blur" ||
      (ownedSceneEligible && ownedSceneState === "active") ||
      !capabilityResolved ||
      !element ||
      !registerSurface ||
      !unregisterSurface
    ) {
      return;
    }
    registerSurface(surfaceId, element);
    return () => unregisterSurface(surfaceId);
  }, [
    capabilityResolved,
    mode,
    ownedSceneEligible,
    ownedSceneState,
    registerSurface,
    surfaceId,
    unregisterSurface,
  ]);

  const resolvedRadius =
    typeof radius === "number"
      ? `${radius}px`
      : radius || VARIANT_RADIUS[variant];
  const Component = as as React.ElementType;
  const liveBackdropSelected = mode === "svg" && mapReady;
  const localOwnedSceneActive =
    ownedSceneEligible && ownedSceneState === "active";
  const localOwnedSceneInitializing =
    ownedSceneEligible &&
    (ownedSceneState === "idle" || ownedSceneState === "initializing");
  const providerWebglActive =
    !ownedSceneEligible &&
    mode === "css-blur" &&
    providerDiagnostics?.status === "active" &&
    providerDiagnostics.backend === "webgl";
  const providerWebglInitializing =
    !ownedSceneEligible &&
    mode === "css-blur" &&
    providerDiagnostics?.status === "initializing" &&
    providerDiagnostics.backend === "webgl";
  const webglMaterialActive = localOwnedSceneActive || providerWebglActive;
  const activeOptics = liveBackdropSelected || webglMaterialActive;
  const fallbackFrost =
    mode !== "solid" && !liveBackdropSelected && !webglMaterialActive;
  const activeWebglMaterial = "blur(0.75px) saturate(160%) brightness(1.03)";
  const backdropFilter =
    mode === "solid"
      ? "none"
      : liveBackdropSelected
        ? `url(#${filterId}) blur(2px) saturate(180%) brightness(1.05)`
        : webglMaterialActive
          ? activeWebglMaterial
          : fallbackFrost
            ? "blur(2px) saturate(180%) brightness(1.05)"
            : "none";
  const webkitBackdropFilter =
    mode === "solid"
      ? "none"
      : liveBackdropSelected
        ? `url(#${filterId}) blur(1px) saturate(180%) brightness(1.05)`
        : webglMaterialActive
          ? activeWebglMaterial
          : fallbackFrost
            ? "blur(1px) saturate(180%) brightness(1.05)"
            : "none";

  return (
    <>
      <Component
        ref={setRef}
        className={cn(
          "pointer-events-auto relative z-[1] border-0 bg-transparent",
          className,
        )}
        style={
          {
            ...style,
            "--cos": "0",
            "--sin": "0",
            "--light-angle": "0deg",
            "--rim-intensity": "0.6",
            "--rim-gradient": "none",
            borderRadius: resolvedRadius,
            background: "transparent",
            backgroundColor: "transparent",
            backdropFilter,
            WebkitBackdropFilter: webkitBackdropFilter,
          } as React.CSSProperties
        }
        {...props}
        data-tahoe-glass-surface={variant}
        data-tahoe-glass-tone={tone}
        data-tahoe-glass-tint={semanticTint}
        data-tahoe-backdrop-backend={
          liveBackdropSelected
            ? "svg"
            : localOwnedSceneActive || localOwnedSceneInitializing
              ? "webgl"
              : mode === "solid"
                ? "solid"
                : providerWebglActive || providerWebglInitializing
                  ? "webgl"
                  : "css-blur"
        }
        data-tahoe-backdrop-state={
          activeOptics
            ? "selected"
            : localOwnedSceneInitializing || providerWebglInitializing
              ? "initializing"
              : mode === "solid"
                ? "solid"
                : "fallback"
        }
        data-tahoe-backdrop-source={
          liveBackdropSelected
            ? "live-dom"
            : localOwnedSceneActive || localOwnedSceneInitializing
              ? "owned-scene-webgl"
              : mode === "solid"
                ? "reduced-transparency-solid"
                : providerWebglActive || providerWebglInitializing
                  ? providerDiagnostics?.source || "owned-scene-webgl"
                  : "live-dom-css-backdrop"
        }
        data-tahoe-refraction-backend={
          liveBackdropSelected
            ? "svg-live-dom"
            : localOwnedSceneActive || providerWebglActive
              ? "webgl-owned-scene"
              : mode === "solid"
                ? "solid"
                : "css-material"
        }
        data-tahoe-refraction-scope={
          liveBackdropSelected
            ? "live-backdrop"
            : localOwnedSceneActive || providerWebglActive
              ? "owned-scene-only"
              : "none"
        }
        data-tahoe-refraction-reason={
          ownedSceneEligible
            ? localOwnedSceneActive
              ? undefined
              : ownedSceneReason
            : mode === "css-blur"
              ? providerDiagnostics?.reason || undefined
              : undefined
        }
        data-tahoe-owned-scene-state={
          ownedSceneEligible ? ownedSceneState : undefined
        }
        data-tahoe-glass-displacement={TAHOE_DISPLACEMENT_SCALE}
      >
        {ownedSceneEligible ? (
          <canvas
            ref={ownedSceneCanvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1] h-full w-full rounded-[inherit]"
            data-tahoe-nav-owned-scene-canvas="true"
            data-tahoe-owned-scene-canvas="true"
            style={{
              opacity: localOwnedSceneActive ? 1 : 0,
            }}
          />
        ) : null}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5] rounded-[inherit]"
          style={{
            background: webglMaterialActive
              ? "rgba(255,255,255,0.10)"
              : mode === "solid"
                ? "Canvas"
                : "color-mix(in srgb, white 25%, transparent)",
            backgroundImage:
              mode === "solid" || webglMaterialActive
                ? "none"
                : "radial-gradient(circle at calc(50% - var(--cos) * 50%) calc(50% - var(--sin) * 50%), rgba(255,255,255,0.2) 0%, transparent 60%)",
            boxShadow: TAHOE_SPECULAR_SHADOW,
          }}
        />

        {semanticTint !== "none" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[6] rounded-[inherit]"
            style={{
              backgroundColor:
                semanticTint === "light" ? "white" : "rgb(8, 12, 20)",
              opacity: Math.max(0, Math.min(0.42, semanticTintOpacity)),
            }}
          />
        )}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] p-px"
          style={{
            background: "var(--rim-gradient)",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            maskComposite: "exclude",
            opacity: "calc(0.62 + var(--rim-intensity) * 0.24)",
          }}
        />

        <div
          className={cn("relative z-20", TONE_CLASS[tone], contentClassName)}
        >
          {children}
        </div>
      </Component>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 overflow-hidden"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter
            ref={filterRef}
            id={filterId}
            x="-35"
            y="-35"
            width="70"
            height="70"
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              ref={feImageRef}
              href=""
              x="0"
              y="0"
              width="1"
              height="1"
              result="lens"
              preserveAspectRatio="none"
            />
            <feFlood floodColor="rgb(128,128,128)" result="neutral" />
            <feComposite
              in="lens"
              in2="neutral"
              operator="over"
              result="dispMap"
            />
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
    </>
  );
});

TahoeBackdropSurface.displayName = "TahoeBackdropSurface";

export const TahoeBackdropHeader = React.forwardRef<
  HTMLElement,
  TahoeBackdropHeaderProps
>(function TahoeBackdropHeader(
  { radius = "0 0 24px 24px", ...props },
  forwardedRef,
) {
  return (
    <TahoeBackdropSurface
      {...props}
      ref={forwardedRef}
      as="header"
      variant="menu"
      radius={radius}
    />
  );
});

TahoeBackdropHeader.displayName = "TahoeBackdropHeader";
