"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import GlassCard, {
  type GlassCardProps,
} from "@/components/ui/GlassCard";
import {
  TahoeBackdropSurface,
  type TahoeGlassContentTone,
  type TahoeGlassSemanticTint,
  type TahoeGlassSurfaceVariant,
} from "@/components/ui/tahoe-glass";
import {
  getDashboardDirectBackdropSnapshot,
  getDashboardServerSnapshot,
  subscribeDashboardBackdropPolicy,
} from "@/lib/tahoe-glass/dashboard-backdrop-policy";

export interface DashboardGlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: GlassCardProps["variant"];
  radius?: number | string;
  style?: CSSProperties;
  tone?: TahoeGlassContentTone;
  semanticTint?: TahoeGlassSemanticTint;
  semanticTintOpacity?: number;
  /**
   * Use the live-backdrop lens only for a page's primary environmental pane.
   * Repeated list cards and nested controls deliberately stay on the shared
   * material engine so a dashboard does not create a WebGL context per card.
   */
  refractive?: boolean;
  /** A selected pane may use the strongest approved dashboard material. */
  selected?: boolean;
}

const VARIANT_SURFACE: Record<
  NonNullable<DashboardGlassCardProps["variant"]>,
  TahoeGlassSurfaceVariant
> = {
  default: "card",
  strong: "panel",
  subtle: "card",
  apple: "card",
  ultimate: "panel",
};

interface PrimaryBackdropCardProps
  extends Omit<DashboardGlassCardProps, "refractive" | "selected"> {
  tintOpacity: number;
  variant: NonNullable<DashboardGlassCardProps["variant"]>;
  tone: TahoeGlassContentTone;
  semanticTint: TahoeGlassSemanticTint;
}

function PrimaryBackdropCard({
  children,
  className = "",
  variant,
  radius,
  style,
  tone,
  semanticTint,
  tintOpacity,
}: PrimaryBackdropCardProps) {
  // Keep one TahoeBackdropSurface root across SSR, hydration and capability
  // changes. Only Chromium's verified live-DOM SVG route enables its direct
  // lens; Apple mobile remains on the same bright material without allocating
  // another owned-scene WebGL context beneath the fixed header.
  const directBackdropEnabled = useSyncExternalStore(
    subscribeDashboardBackdropPolicy,
    getDashboardDirectBackdropSnapshot,
    getDashboardServerSnapshot,
  );

  const resolvedRadius =
    radius ?? (variant === "apple" || variant === "ultimate" ? 24 : 40);

  return (
    <TahoeBackdropSurface chromiumAppearance="light" materialFinish="satin"
      backdropEnabled={directBackdropEnabled}
      variant={VARIANT_SURFACE[variant]}
      radius={resolvedRadius}
      className={`overflow-visible ${className}`}
      contentClassName="h-full w-full"
      style={style}
      tone={tone}
      semanticTint={semanticTint}
      semanticTintOpacity={tintOpacity}
    >
      {children}
    </TahoeBackdropSurface>
  );
}

/**
 * Dashboard-safe glass defaults.
 *
 * Match the bright crystal material used on the homepage and sign-in page.
 * Individual cards inherit dark readable content and a light satin backing
 * without introducing another owned-scene rendering context.
 */
export default function DashboardGlassCard({
  children,
  className = "",
  variant = "default",
  radius,
  style,
  tone = "dark",
  semanticTint = "light",
  semanticTintOpacity,
  refractive = false,
  selected = false,
}: DashboardGlassCardProps) {
  const tintOpacity = semanticTintOpacity ?? (semanticTint === "none" ? 0 : selected ? 0.2 : 0.18);

  if (!refractive) {
    return (
      <GlassCard
        chromiumAppearance="light"
        materialFinish="satin"
        className={`nsso-crystal-panel ${className}`}
        variant={variant}
        radius={radius}
        style={style}
        tone={tone}
        semanticTint={semanticTint}
        semanticTintOpacity={tintOpacity}
      >
        {children}
      </GlassCard>
    );
  }

  return (
    <PrimaryBackdropCard
      className={`nsso-crystal-panel ${className}`}
      variant={variant}
      radius={radius}
      style={style}
      tone={tone}
      semanticTint={semanticTint}
      tintOpacity={tintOpacity}
    >
      {children}
    </PrimaryBackdropCard>
  );
}
