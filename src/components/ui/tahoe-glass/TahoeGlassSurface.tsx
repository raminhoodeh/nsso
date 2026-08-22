"use client";

import * as React from "react";
import {
  TahoeGlassEngineContext,
  useTahoeGlassDiagnostics,
} from "@/components/providers/TahoeGlassProvider";
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
  | "pill";

export interface TahoeGlassSurfaceProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  as?: TahoeGlassSurfaceElement;
  variant?: TahoeGlassSurfaceVariant;
  radius?: number | string;
  children?: React.ReactNode;
  contentClassName?: string;
  /** Enable while a surface is animated or follows the pointer. */
  tracking?: "static" | "continuous";
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
};

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
    className,
    contentClassName,
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
  const registerSurface = context?.registerSurface;
  const unregisterSurface = context?.unregisterSurface;
  const diagnostics = useTahoeGlassDiagnostics();
  const internalRef = React.useRef<HTMLElement | null>(null);
  const id = React.useId();

  const setRef = React.useCallback(
    (element: HTMLElement | null) => {
      internalRef.current = element;
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  React.useLayoutEffect(() => {
    const element = internalRef.current;
    if (!registerSurface || !unregisterSurface || !element) return;
    registerSurface(id, element, {
      continuous: tracking === "continuous",
    });
    return () => unregisterSurface(id);
  }, [id, registerSurface, tracking, unregisterSurface]);

  const activeWebGL =
    diagnostics.status === "active" && diagnostics.backend === "webgl";
  const solidMaterial = diagnostics.backend === "solid";
  const translucentMaterial = !activeWebGL && !solidMaterial;
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
        "relative z-[1] isolate border-0 bg-transparent",
        (variant === "button" || variant === "pill") && "select-none",
        as === "button" &&
          "pointer-events-auto inline-flex cursor-pointer items-center justify-center outline-none origin-center transition-transform duration-[400ms] ease-[cubic-bezier(0.4,1.5,0.3,1)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-50",
        as === "a" &&
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
        } as React.CSSProperties
      }
      data-tahoe-glass-surface={variant}
      data-tahoe-glass-state={diagnostics.status}
      data-tahoe-glass-backend={diagnostics.backend}
      data-tahoe-glass-source={diagnostics.source}
      data-tahoe-glass-fallback-reason={diagnostics.reason || undefined}
      {...nativeProps}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
        style={{
          background: activeWebGL
            ? "transparent"
            : solidMaterial
              ? "Canvas"
              : "color-mix(in srgb, white 25%, transparent)",
          backdropFilter: translucentMaterial
            ? "blur(2px) saturate(180%) brightness(1.05)"
            : "none",
          WebkitBackdropFilter: translucentMaterial
            ? "blur(1px) saturate(180%) brightness(1.05)"
            : "none",
          backgroundImage: translucentMaterial
            ? "radial-gradient(circle at calc(50% - var(--cos) * 50%) calc(50% - var(--sin) * 50%), rgba(255,255,255,0.2) 0%, transparent 60%)"
            : "none",
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

      <Content className={cn("relative z-20", contentClassName)}>
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
