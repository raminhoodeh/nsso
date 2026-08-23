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
} from "@/lib/tahoe-glass/optics";

type TahoeBackdropMode = "svg" | "css-blur" | "solid";

export interface TahoeBackdropHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  children?: React.ReactNode;
  contentClassName?: string;
  radius?: number | string;
}

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * SVG reference filters in backdrop-filter currently render in Chromium, but
 * WebKit silently drops them. Syntax detection alone is therefore not enough.
 */
function supportsLiveSvgBackdrop(): boolean {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    typeof CSS === "undefined"
  ) {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isAppleMobile =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isChromium =
    /(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|SamsungBrowser)/i.test(userAgent);
  const supportsReferenceSyntax =
    CSS.supports("backdrop-filter", "url(#tahoe-nav-probe)") ||
    CSS.supports("-webkit-backdrop-filter", "url(#tahoe-nav-probe)");
  const supportsPrimitives =
    "SVGFEImageElement" in window &&
    "SVGFEDisplacementMapElement" in window;

  return (
    isChromium &&
    !isAppleMobile &&
    supportsReferenceSyntax &&
    supportsPrimitives
  );
}

function resolveBackdropMode(): TahoeBackdropMode {
  if (typeof window === "undefined") return "css-blur";
  if (
    window.matchMedia("(forced-colors: active)").matches ||
    window.matchMedia("(prefers-reduced-transparency: reduce)").matches
  ) {
    return "solid";
  }
  return supportsLiveSvgBackdrop() ? "svg" : "css-blur";
}

export const TahoeBackdropHeader = React.forwardRef<
  HTMLElement,
  TahoeBackdropHeaderProps
>(function TahoeBackdropHeader(
  {
    children,
    className,
    contentClassName,
    radius = "0 0 24px 24px",
    style,
    ...props
  },
  forwardedRef,
) {
  const context = React.useContext(TahoeGlassEngineContext);
  const providerDiagnostics = context?.diagnostics;
  const registerSurface = context?.registerSurface;
  const unregisterSurface = context?.unregisterSurface;
  const internalRef = React.useRef<HTMLElement | null>(null);
  const filterRef = React.useRef<SVGFilterElement | null>(null);
  const feImageRef = React.useRef<SVGFEImageElement | null>(null);
  const resizeFrameRef = React.useRef<number | null>(null);
  const lastSizeKeyRef = React.useRef("");
  const surfaceId = React.useId();
  const filterId = `${React.useId().replace(/:/g, "-")}-backdrop`;
  const [mode, setMode] = React.useState<TahoeBackdropMode>("css-blur");
  const [capabilityResolved, setCapabilityResolved] = React.useState(false);
  const [mapReady, setMapReady] = React.useState(false);

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
      setMode(resolveBackdropMode());
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

  const updateOptics = React.useCallback(() => {
    const element = internalRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const sizeKey = `${width}x${height}:${mode}`;
    if (sizeKey === lastSizeKeyRef.current) return;

    const field = createTahoeDisplacementField(width, height, 1, 255);
    if (!field) {
      setMapReady(false);
      return;
    }

    const viewport = window.visualViewport;
    const viewportWidth = Math.max(1, viewport?.width || window.innerWidth);
    const viewportHeight = Math.max(1, viewport?.height || window.innerHeight);
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const centerX =
      (rect.left - viewportLeft + rect.width / 2) / viewportWidth;
    const centerY =
      (rect.top - viewportTop + rect.height / 2) / viewportHeight;
    applyTahoeRimVariables(
      element,
      calculateTahoeRim(field, centerX, centerY),
    );

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
  }, [mode]);

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
        updateOptics();
      });
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);
    window.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [updateOptics]);

  // Chromium's live backdrop already includes the owned scene. Registering the
  // header there as well would bend that scene twice. Fallback engines retain
  // the provider's scene refraction while this surface supplies ordinary blur.
  React.useLayoutEffect(() => {
    const element = internalRef.current;
    if (
      mode !== "css-blur" ||
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
    registerSurface,
    surfaceId,
    unregisterSurface,
  ]);

  const resolvedRadius =
    typeof radius === "number" ? `${radius}px` : radius;
  const liveBackdropSelected = mode === "svg" && mapReady;
  const providerWebglActive =
    mode === "css-blur" &&
    providerDiagnostics?.status === "active" &&
    providerDiagnostics.backend === "webgl";
  const providerWebglInitializing =
    mode === "css-blur" &&
    providerDiagnostics?.status === "initializing" &&
    providerDiagnostics.backend === "webgl";
  const activeOptics = liveBackdropSelected || providerWebglActive;
  const fallbackFrost =
    mode !== "solid" && !liveBackdropSelected && !providerWebglActive;
  const activeWebglMaterial =
    "blur(0.75px) saturate(160%) brightness(1.03)";
  const backdropFilter =
    mode === "solid"
      ? "none"
      : liveBackdropSelected
        ? `url(#${filterId}) blur(2px) saturate(180%) brightness(1.05)`
        : providerWebglActive
          ? activeWebglMaterial
          : fallbackFrost
            ? "blur(2px) saturate(180%) brightness(1.05)"
            : "none";
  const webkitBackdropFilter =
    mode === "solid"
      ? "none"
      : liveBackdropSelected
        ? `url(#${filterId}) blur(1px) saturate(180%) brightness(1.05)`
        : providerWebglActive
          ? activeWebglMaterial
          : fallbackFrost
            ? "blur(1px) saturate(180%) brightness(1.05)"
            : "none";

  return (
    <>
      <header
        ref={setRef}
        className={cn(
          "pointer-events-auto relative z-[1] border-0 bg-transparent",
          className,
        )}
        style={{
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
        } as React.CSSProperties}
        {...props}
        data-tahoe-glass-surface="menu"
        data-tahoe-backdrop-backend={
          liveBackdropSelected
            ? "svg"
            : providerWebglActive || providerWebglInitializing
              ? "webgl"
            : mode === "solid"
              ? "solid"
              : "css-blur"
        }
        data-tahoe-backdrop-state={
          activeOptics
            ? "selected"
            : providerWebglInitializing
              ? "initializing"
            : mode === "solid"
              ? "solid"
              : "fallback"
        }
        data-tahoe-backdrop-source={
          liveBackdropSelected
            ? "live-dom"
            : providerWebglActive || providerWebglInitializing
              ? providerDiagnostics?.source || "owned-scene-webgl"
            : mode === "solid"
              ? "reduced-transparency-solid"
              : "live-dom-css-backdrop"
        }
        data-tahoe-refraction-backend={
          liveBackdropSelected
            ? "svg-live-dom"
            : providerWebglActive
              ? "webgl-owned-scene"
              : mode === "solid"
                ? "solid"
                : "css-material"
        }
        data-tahoe-refraction-scope={
          liveBackdropSelected
            ? "live-backdrop"
            : providerWebglActive || providerWebglInitializing
              ? "owned-scene-only"
              : "none"
        }
        data-tahoe-refraction-reason={
          mode === "css-blur"
            ? providerDiagnostics?.reason || undefined
            : undefined
        }
        data-tahoe-glass-displacement={TAHOE_DISPLACEMENT_SCALE}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
          style={{
            background: providerWebglActive
              ? "rgba(255,255,255,0.10)"
              : mode === "solid"
                ? "Canvas"
                : "color-mix(in srgb, white 25%, transparent)",
            backgroundImage:
              mode === "solid" || providerWebglActive
                ? "none"
                : "radial-gradient(circle at calc(50% - var(--cos) * 50%) calc(50% - var(--sin) * 50%), rgba(255,255,255,0.2) 0%, transparent 60%)",
            boxShadow: TAHOE_SPECULAR_SHADOW,
          }}
        />

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

        <div className={cn("relative z-20", contentClassName)}>{children}</div>
      </header>

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

TahoeBackdropHeader.displayName = "TahoeBackdropHeader";
