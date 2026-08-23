"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { TahoeV4Diagnostics } from "@/lib/tahoe-glass/v4";

export interface TahoeGlassV4DebugSurface {
  id: string;
  variant: string;
  profile: string;
  visible: boolean;
  rect: { left: number; top: number; width: number; height: number } | null;
}

export interface TahoeGlassV4DiagnosticsProps {
  diagnostics: TahoeV4Diagnostics;
  surfaces?: readonly TahoeGlassV4DebugSurface[];
}

const subscribeToNothing = () => () => undefined;

function lifecycleColor(lifecycle: TahoeV4Diagnostics["lifecycle"]): string {
  if (lifecycle === "refraction-presented") return "#42f59e";
  if (lifecycle === "fallback") return "#ffb84d";
  if (lifecycle === "source-ready") return "#a98bff";
  return "#66b7ff";
}

export function TahoeGlassV4Diagnostics({
  diagnostics,
  surfaces = [],
}: TahoeGlassV4DiagnosticsProps) {
  const clientReady = React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  if (!clientReady) return null;

  const color = lifecycleColor(diagnostics.lifecycle);
  return createPortal(
    <div
      aria-hidden="true"
      data-tahoe-glass-v4-debug="true"
      style={{
        pointerEvents: "none",
        position: "fixed",
        inset: 0,
        zIndex: 2_147_483_647,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1.35,
      }}
    >
      <div
        style={{
          position: "fixed",
          left: 8,
          top: 8,
          maxWidth: "min(520px, calc(100vw - 16px))",
          padding: "8px 10px",
          color: "white",
          background: "rgba(0,0,0,.88)",
          border: `1px solid ${color}`,
          borderRadius: 7,
          boxShadow: "0 4px 18px rgba(0,0,0,.4)",
          whiteSpace: "pre-wrap",
        }}
      >
        {`Tahoe V4 · ${diagnostics.lifecycle}\n${diagnostics.backend} / ${diagnostics.sourceKind} · frame ${diagnostics.framePresented ? "presented" : "not-presented"}\n${diagnostics.refractiveSurfaceCount}/${diagnostics.surfaceCount} refractive · DPR ${diagnostics.dpr.toFixed(2)}${diagnostics.reason ? ` · ${diagnostics.reason}` : ""}`}
      </div>

      {surfaces.map((surface) => {
        if (!surface.visible || !surface.rect) return null;
        return (
          <div
            key={surface.id}
            style={{
              position: "fixed",
              left: surface.rect.left,
              top: surface.rect.top,
              width: surface.rect.width,
              height: surface.rect.height,
              border: `1px dashed ${color}`,
              borderRadius: 4,
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                maxWidth: "min(340px, 90vw)",
                padding: "2px 4px",
                color: "white",
                background: "rgba(0,0,0,.88)",
                borderLeft: `3px solid ${color}`,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transform: "translateY(-100%)",
              }}
            >
              {`${surface.variant} · ${surface.profile}`}
            </span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
