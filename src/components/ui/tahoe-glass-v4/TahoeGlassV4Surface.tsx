"use client";

import * as React from "react";
import {
  TahoeGlassV4EngineContext,
  useTahoeGlassV4Diagnostics,
} from "@/components/providers/TahoeGlassV4Provider";
import { cn } from "@/lib/utils";
import type { TahoeV4Profile } from "@/lib/tahoe-glass/v4";

export type TahoeGlassV4SurfaceElement =
  | "div"
  | "section"
  | "article"
  | "nav"
  | "aside"
  | "header"
  | "footer"
  | "menu"
  | "button"
  | "a";

export type TahoeGlassV4SurfaceVariant =
  | "card"
  | "panel"
  | "menu"
  | "button"
  | "pill"
  | "recessed"
  | "dialog"
  | "popover"
  | "media-frame"
  | "mediaFrame";

export type TahoeGlassV4ContentTone = "inherit" | "light" | "dark";
export type TahoeGlassV4SemanticTint = "none" | "light" | "dark";

export interface TahoeGlassV4SurfaceProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  as?: TahoeGlassV4SurfaceElement;
  variant?: TahoeGlassV4SurfaceVariant;
  profile?: TahoeV4Profile;
  radius?: number | string;
  children?: React.ReactNode;
  contentClassName?: string;
  tone?: TahoeGlassV4ContentTone;
  /** Role/status wash. It is separate from and never replaces base material. */
  semanticTint?: TahoeGlassV4SemanticTint;
  semanticTintOpacity?: number;
  tracking?: "static" | "continuous";
  opticalPriority?: number;
  href?: string;
  target?: string;
  rel?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const VARIANT_RADIUS: Record<TahoeGlassV4SurfaceVariant, string> = {
  card: "28px",
  panel: "32px",
  menu: "24px",
  button: "9999px",
  pill: "9999px",
  recessed: "12px",
  dialog: "32px",
  popover: "22px",
  "media-frame": "20px",
  mediaFrame: "20px",
};

const VARIANT_PROFILE: Record<TahoeGlassV4SurfaceVariant, TahoeV4Profile> = {
  card: "edge-lens",
  panel: "edge-lens",
  menu: "edge-lens",
  button: "control",
  pill: "control",
  recessed: "control",
  dialog: "edge-lens",
  popover: "edge-lens",
  "media-frame": "edge-lens",
  mediaFrame: "edge-lens",
};

const TONE_CLASS: Record<TahoeGlassV4ContentTone, string> = {
  inherit: "text-inherit",
  light: "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.52)]",
  dark: "text-black/90 [text-shadow:0_1px_1px_rgba(255,255,255,0.38)]",
};

// This is the reference Tahoe material. It is deliberately owned by the DOM
// surface rather than the lens renderer so loading and renderer failures can
// never turn a glass surface into an empty transparent outline.
const TAHOE_V4_SPECULAR_SHADOW = `
  inset 0 0 0 1px color-mix(in srgb, white calc(var(--rim-intensity) * 20%), transparent),
  inset calc(var(--cos) * 1.8px) calc(var(--sin) * 3px) 0px -2px color-mix(in srgb, white calc(var(--rim-intensity) * 90%), transparent),
  inset calc(var(--cos) * -2px) calc(var(--sin) * -2px) 0px -2px color-mix(in srgb, white calc(var(--rim-intensity) * 80%), transparent),
  inset calc(var(--cos) * -3px) calc(var(--sin) * -8px) 1px -6px color-mix(in srgb, white calc(var(--rim-intensity) * 60%), transparent),
  inset calc(var(--cos) * -0.3px) calc(var(--sin) * -1px) 4px 0px color-mix(in srgb, black 12%, transparent),
  inset calc(var(--cos) * -1.5px) calc(var(--sin) * 2.5px) 0px -2px color-mix(in srgb, black 20%, transparent),
  inset calc(var(--cos) * 0px) calc(var(--sin) * 3px) 4px -2px color-mix(in srgb, black 20%, transparent),
  inset calc(var(--cos) * 2px) calc(var(--sin) * -6.5px) 1px -4px color-mix(in srgb, black 10%, transparent),
  calc(var(--cos) * 4px) calc(var(--sin) * 4px) 10px 0px color-mix(in srgb, black 15%, transparent),
  calc(var(--cos) * 9px) calc(var(--sin) * 9px) 18px 0px color-mix(in srgb, black 10%, transparent)
`;

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function enforceCanonicalOpticalRoot(element: HTMLElement): void {
  element.style.setProperty("background", "transparent", "important");
  element.style.setProperty("background-color", "transparent", "important");
  element.style.setProperty("background-image", "none", "important");
  element.style.setProperty("backdrop-filter", "none", "important");
  element.style.setProperty("-webkit-backdrop-filter", "none", "important");
  element.style.setProperty("border", "0", "important");
  element.style.setProperty("box-shadow", "none", "important");
}

export const TahoeGlassV4Surface = React.forwardRef<
  HTMLElement,
  TahoeGlassV4SurfaceProps
>(function TahoeGlassV4Surface(
  {
    as = "div",
    variant = "card",
    profile,
    radius,
    tracking = "static",
    opticalPriority,
    className,
    contentClassName,
    tone = "inherit",
    semanticTint = "none",
    semanticTintOpacity = 0.07,
    children,
    style,
    href,
    target,
    rel,
    type,
    disabled,
    ...props
  },
  forwardedRef,
) {
  const context = React.useContext(TahoeGlassV4EngineContext);
  const diagnostics = useTahoeGlassV4Diagnostics();
  const registerSurface = context?.registerSurface;
  const unregisterSurface = context?.unregisterSurface;
  const requestRender = context?.requestRender;
  const internalRef = React.useRef<HTMLElement | null>(null);
  const id = React.useId();
  const resolvedProfile = profile ?? VARIANT_PROFILE[variant];
  const resolvedRadius =
    typeof radius === "number"
      ? `${radius}px`
      : radius || VARIANT_RADIUS[variant];

  const setRef = React.useCallback(
    (element: HTMLElement | null) => {
      internalRef.current = element;
      if (element) enforceCanonicalOpticalRoot(element);
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  React.useLayoutEffect(() => {
    const element = internalRef.current;
    if (!registerSurface || !unregisterSurface || !element) return;
    registerSurface({
      id,
      element,
      profile: resolvedProfile,
      radius: resolvedRadius,
      continuous: tracking === "continuous",
      priority: opticalPriority ?? 0,
      variant,
    });
    return () => unregisterSurface(id);
  }, [
    id,
    opticalPriority,
    registerSurface,
    resolvedProfile,
    resolvedRadius,
    tracking,
    unregisterSurface,
    variant,
  ]);

  React.useLayoutEffect(() => {
    if (internalRef.current) enforceCanonicalOpticalRoot(internalRef.current);
    requestRender?.("surface-presentation-change");
  }, [className, requestRender, style]);

  const Component = as as React.ElementType;
  const Content = as === "button" || as === "a" ? "span" : "div";
  const nativeProps: Record<string, unknown> = {};
  if (as === "a") {
    nativeProps.href = href;
    nativeProps.target = target;
    nativeProps.rel = rel;
  }
  if (as === "button") {
    nativeProps.type = type ?? "button";
    nativeProps.disabled = disabled;
  }

  const transmission = diagnostics.reducedTransparency
    ? 72
    : 25;
  const materialBackground = `color-mix(in srgb, white ${transmission}%, transparent)`;
  const materialBlur = diagnostics.reducedTransparency
    ? "blur(5px) saturate(135%) brightness(1.03)"
    : "blur(2px) saturate(180%) brightness(1.05)";
  const webkitMaterialBlur = diagnostics.reducedTransparency
    ? "blur(4px) saturate(135%) brightness(1.03)"
    : "blur(1px) saturate(180%) brightness(1.05)";

  return (
    <Component
      ref={setRef}
      className={cn(
        "pointer-events-auto relative z-[1] isolate border-0 bg-transparent",
        (variant === "button" || variant === "pill") && "select-none",
        as === "button" &&
          "inline-flex cursor-pointer items-center justify-center outline-none transition-transform duration-[400ms] ease-[cubic-bezier(0.4,1.5,0.3,1)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-50",
        as === "a" &&
          href &&
          "cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        diagnostics.reducedMotion && "transition-none active:scale-100",
        className,
      )}
      style={
        {
          "--cos": "0",
          "--sin": "-1",
          "--light-angle": "0deg",
          "--rim-intensity": "0.6",
          "--rim-gradient":
            "linear-gradient(135deg, rgba(255,255,255,.92), rgba(255,255,255,.12) 42%, rgba(8,12,20,.22) 72%, rgba(255,255,255,.66))",
          borderRadius: resolvedRadius,
          ...style,
          background: "transparent",
          backgroundColor: "transparent",
          backgroundImage: "none",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          border: 0,
          boxShadow: "none",
        } as React.CSSProperties
      }
      {...nativeProps}
      {...props}
      data-tahoe-glass-v4-surface={variant}
      data-tahoe-glass-v4-profile={resolvedProfile}
      data-tahoe-glass-v4-tint={semanticTint}
      data-tahoe-glass-v4-state={diagnostics.lifecycle}
      data-tahoe-glass-v4-backend={diagnostics.backend}
      data-tahoe-glass-v4-source={diagnostics.sourceKind}
      data-tahoe-glass-v4-fallback-reason={diagnostics.reason || undefined}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
        data-tahoe-glass-v4-material="true"
        style={{
          backgroundColor: diagnostics.forcedColors
            ? "Canvas"
            : materialBackground,
          backgroundImage: diagnostics.forcedColors
            ? "none"
            : "radial-gradient(circle at calc(50% - var(--cos) * 50%) calc(50% - var(--sin) * 50%), rgba(255,255,255,0.2) 0%, transparent 60%)",
          backdropFilter: diagnostics.forcedColors ? "none" : materialBlur,
          WebkitBackdropFilter: diagnostics.forcedColors
            ? "none"
            : webkitMaterialBlur,
          border: diagnostics.forcedColors
            ? "2px solid CanvasText"
            : "0 solid transparent",
          boxSizing: "border-box",
          boxShadow: diagnostics.forcedColors
            ? "none"
            : TAHOE_V4_SPECULAR_SHADOW,
        }}
      />

      {semanticTint !== "none" && !diagnostics.forcedColors && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          data-tahoe-glass-v4-semantic-tint={semanticTint}
          style={{
            backgroundColor:
              semanticTint === "light" ? "white" : "rgb(8, 12, 20)",
            opacity: Math.max(0, Math.min(0.16, semanticTintOpacity)),
          }}
        />
      )}

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] p-px"
        data-tahoe-glass-v4-rim="true"
        style={{
          background: "var(--rim-gradient)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
          opacity: diagnostics.forcedColors
            ? 0
            : "calc(0.62 + var(--rim-intensity) * 0.24)",
        }}
      />

      <Content
        className={cn("relative z-20", TONE_CLASS[tone], contentClassName)}
      >
        {children}
      </Content>
    </Component>
  );
});

TahoeGlassV4Surface.displayName = "TahoeGlassV4Surface";

export type TahoeGlassV4ButtonProps = Omit<
  TahoeGlassV4SurfaceProps,
  "as" | "variant" | "href"
>;

export const TahoeGlassV4Button = React.forwardRef<
  HTMLButtonElement,
  TahoeGlassV4ButtonProps
>(function TahoeGlassV4Button(props, forwardedRef) {
  return (
    <TahoeGlassV4Surface
      {...props}
      ref={forwardedRef as React.ForwardedRef<HTMLElement>}
      as="button"
      variant="button"
    />
  );
});

TahoeGlassV4Button.displayName = "TahoeGlassV4Button";
