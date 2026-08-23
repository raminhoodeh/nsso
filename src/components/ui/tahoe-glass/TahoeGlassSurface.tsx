"use client";

import * as React from "react";
import {
  TahoeGlassEngineContext,
  useTahoeGlassDiagnostics,
} from "@/components/providers/TahoeGlassProvider";
import { TahoeGlassDirectBackdropBoundaryContext } from "@/components/ui/tahoe-glass/TahoeGlassBoundaryContext";
import { cn } from "@/lib/utils";
import { TAHOE_SPECULAR_SHADOW } from "@/lib/tahoe-glass/constants";

export type TahoeGlassSurfaceElement =
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

export type TahoeGlassSurfaceVariant =
  | "card"
  | "menu"
  | "panel"
  | "button"
  | "pill"
  | "recessed"
  | "dialog"
  | "popover"
  | "mediaFrame";

export type TahoeGlassContentTone = "inherit" | "light" | "dark";
export type TahoeGlassSemanticTint = "none" | "light" | "dark";

export interface TahoeGlassSurfaceProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  as?: TahoeGlassSurfaceElement;
  variant?: TahoeGlassSurfaceVariant;
  radius?: number | string;
  children?: React.ReactNode;
  contentClassName?: string;
  /** Changes content contrast only; it never tints the optical body. */
  tone?: TahoeGlassContentTone;
  /** Optional semantic wash rendered as its own layer, never as shell fill. */
  semanticTint?: TahoeGlassSemanticTint;
  semanticTintOpacity?: number;
  /** Enable while a surface is animated or follows the pointer. */
  tracking?: "static" | "continuous";
  /** Explicit optical stacking override for portals and top-level overlays. */
  opticalPriority?: number;
  href?: string;
  target?: string;
  rel?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

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

const TONE_CLASS: Record<TahoeGlassContentTone, string> = {
  inherit: "text-inherit",
  light: "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]",
  dark: "text-black/90 [text-shadow:0_1px_1px_rgba(255,255,255,0.35)]",
};

function enforceClearOpticalRoot(element: HTMLElement): void {
  element.style.setProperty("background", "transparent", "important");
  element.style.setProperty("background-color", "transparent", "important");
  element.style.setProperty("background-image", "none", "important");
  element.style.setProperty("backdrop-filter", "none", "important");
  element.style.setProperty("-webkit-backdrop-filter", "none", "important");
}

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const TahoeGlassSurface = React.forwardRef<
  HTMLElement,
  TahoeGlassSurfaceProps
>(function TahoeGlassSurface(
  {
    as = "div",
    variant = "card",
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
  const context = React.useContext(TahoeGlassEngineContext);
  const insideDirectBackdrop = React.useContext(
    TahoeGlassDirectBackdropBoundaryContext,
  );
  const registerSurface = context?.registerSurface;
  const unregisterSurface = context?.unregisterSurface;
  const requestRender = context?.requestRender;
  const diagnostics = useTahoeGlassDiagnostics();
  const internalRef = React.useRef<HTMLElement | null>(null);
  const id = React.useId();

  const setRef = React.useCallback(
    (element: HTMLElement | null) => {
      internalRef.current = element;
      if (element) enforceClearOpticalRoot(element);
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  React.useLayoutEffect(() => {
    const element = internalRef.current;
    if (!registerSurface || !unregisterSurface || !element) return;
    registerSurface(id, element, {
      continuous: tracking === "continuous",
      priority: opticalPriority,
      refractive: !insideDirectBackdrop,
    });
    return () => unregisterSurface(id);
  }, [
    id,
    insideDirectBackdrop,
    opticalPriority,
    registerSurface,
    tracking,
    unregisterSurface,
    variant,
  ]);

  React.useLayoutEffect(() => {
    if (internalRef.current) enforceClearOpticalRoot(internalRef.current);
    requestRender?.("surface-props-change");
  }, [className, requestRender, style]);

  const activeOptics =
    !insideDirectBackdrop &&
    diagnostics.status === "active" &&
    (diagnostics.backend === "svg" || diagnostics.backend === "webgl");
  const solidMaterial = diagnostics.backend === "solid";
  const fallbackFrost = !activeOptics && !solidMaterial;
  const resolvedRadius =
    typeof radius === "number"
      ? `${radius}px`
      : radius || VARIANT_RADIUS[variant];
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

  return (
    <Component
      ref={setRef}
      className={cn(
        "pointer-events-auto relative z-[1] isolate border-0 !bg-transparent !backdrop-blur-none",
        (variant === "button" || variant === "pill") && "select-none",
        as === "button" &&
          "pointer-events-auto inline-flex cursor-pointer items-center justify-center outline-none origin-center transition-transform duration-[400ms] ease-[cubic-bezier(0.4,1.5,0.3,1)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-50",
        as === "a" && href &&
          "pointer-events-auto cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        diagnostics.reducedMotion && "transition-none active:scale-100",
        className,
      )}
      style={
        {
          "--cos": "0",
          "--sin": "0",
          "--light-angle": "0deg",
          "--rim-intensity": "0.6",
          "--rim-gradient": "none",
          borderRadius: resolvedRadius,
          ...style,
          background: "transparent",
          backgroundColor: "transparent",
          backgroundImage: "none",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
        } as React.CSSProperties
      }
      {...nativeProps}
      {...props}
      data-tahoe-glass-surface={variant}
      data-tahoe-glass-tone={tone}
      data-tahoe-glass-tint={semanticTint}
      data-tahoe-glass-state={context ? undefined : diagnostics.status}
      data-tahoe-glass-backend={context ? undefined : diagnostics.backend}
      data-tahoe-glass-source={context ? undefined : diagnostics.source}
      data-tahoe-glass-fallback-reason={
        context ? undefined : diagnostics.reason || undefined
      }
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
        style={{
          background: activeOptics
            ? "transparent"
            : solidMaterial
              ? "Canvas"
              : "color-mix(in srgb, white 25%, transparent)",
          backdropFilter: fallbackFrost
            ? "blur(2px) saturate(180%) brightness(1.05)"
            : "none",
          WebkitBackdropFilter: fallbackFrost
            ? "blur(1px) saturate(180%) brightness(1.05)"
            : "none",
          backgroundImage: fallbackFrost
            ? "radial-gradient(circle at calc(50% - var(--cos) * 50%) calc(50% - var(--sin) * 50%), rgba(255,255,255,0.2) 0%, transparent 60%)"
            : "none",
          boxShadow: TAHOE_SPECULAR_SHADOW,
        }}
      />

      {semanticTint !== "none" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
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

      <Content
        className={cn("relative z-20", TONE_CLASS[tone], contentClassName)}
      >
        {children}
      </Content>
    </Component>
  );
});

TahoeGlassSurface.displayName = "TahoeGlassSurface";

export type TahoeGlassButtonProps = Omit<
  TahoeGlassSurfaceProps,
  "as" | "variant" | "href"
>;

export const TahoeGlassButton = React.forwardRef<
  HTMLButtonElement,
  TahoeGlassButtonProps
>(function TahoeGlassButton(
  { className, contentClassName, ...props },
  forwardedRef,
) {
  return (
    <TahoeGlassSurface
      {...props}
      ref={forwardedRef as React.ForwardedRef<HTMLElement>}
      as="button"
      variant="button"
      className={cn("px-12 py-5", className)}
      contentClassName={cn(
        "flex items-center justify-center gap-2 text-sm font-semibold tracking-wide text-black/85 pointer-events-none",
        contentClassName,
      )}
    />
  );
});

TahoeGlassButton.displayName = "TahoeGlassButton";
