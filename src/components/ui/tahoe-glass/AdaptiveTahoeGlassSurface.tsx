"use client";

import * as React from "react";

import { useTahoeV4Rollout } from "@/components/providers/TahoeV4RolloutGate";
import {
  TahoeGlassV4Button,
  TahoeGlassV4Surface,
} from "@/components/ui/tahoe-glass-v4";
import { cn } from "@/lib/utils";
import {
  TahoeGlassButton as LegacyTahoeGlassButton,
  TahoeGlassSurface as LegacyTahoeGlassSurface,
  type TahoeGlassButtonProps,
  type TahoeGlassSurfaceProps,
} from "./TahoeGlassSurface";
/**
 * Keeps every existing caller on the production implementation until the
 * explicit rollout gate is enabled. This avoids a second sitewide migration:
 * the already-audited card/menu/dialog inventory receives V4 through one
 * reversible seam.
 */
export const AdaptiveTahoeGlassSurface = React.forwardRef<
  HTMLElement,
  TahoeGlassSurfaceProps
>(function AdaptiveTahoeGlassSurface(props, forwardedRef) {
  const rollout = useTahoeV4Rollout();

  if (!rollout.enabled) {
    return <LegacyTahoeGlassSurface {...props} ref={forwardedRef} />;
  }

  return (
    <TahoeGlassV4Surface
      {...props}
      ref={forwardedRef}
      profile={rollout.forceMaterialOnly ? "material-only" : undefined}
    />
  );
});

AdaptiveTahoeGlassSurface.displayName = "AdaptiveTahoeGlassSurface";

export const AdaptiveTahoeGlassButton = React.forwardRef<
  HTMLButtonElement,
  TahoeGlassButtonProps
>(function AdaptiveTahoeGlassButton(
  { className, contentClassName, ...props },
  forwardedRef,
) {
  const rollout = useTahoeV4Rollout();

  if (!rollout.enabled) {
    return (
      <LegacyTahoeGlassButton
        {...props}
        ref={forwardedRef}
        className={className}
        contentClassName={contentClassName}
      />
    );
  }

  return (
    <TahoeGlassV4Button
      {...props}
      ref={forwardedRef}
      profile={rollout.forceMaterialOnly ? "material-only" : undefined}
      className={cn("px-12 py-5", className)}
      contentClassName={cn(
        "pointer-events-none flex items-center justify-center gap-2 text-sm font-semibold tracking-wide text-black/85",
        contentClassName,
      )}
    />
  );
});

AdaptiveTahoeGlassButton.displayName = "AdaptiveTahoeGlassButton";

export type {
  TahoeGlassButtonProps,
  TahoeGlassContentTone,
  TahoeGlassSemanticTint,
  TahoeGlassSurfaceElement,
  TahoeGlassSurfaceProps,
  TahoeGlassSurfaceVariant,
} from "./TahoeGlassSurface";
