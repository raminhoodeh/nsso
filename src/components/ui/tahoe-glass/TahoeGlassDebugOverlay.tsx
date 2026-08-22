"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type {
  TahoeGlassBackend,
  TahoeGlassDiagnostics,
  TahoeGlassStatus,
} from "@/lib/tahoe-glass/types";

export interface TahoeGlassDebugSurface {
  id: string;
  variant: string;
  status: TahoeGlassStatus;
  backend: TahoeGlassBackend;
  source: string;
  reason: string | null;
  visible: boolean;
  measured: boolean;
  rect: { left: number; top: number; width: number; height: number };
}

export interface TahoeGlassDebugOverlayProps {
  diagnostics: TahoeGlassDiagnostics;
  surfaces: readonly TahoeGlassDebugSurface[];
}

const subscribeToNothing = () => () => undefined;

function statusColor(status: TahoeGlassStatus): string {
  if (status === "active") return "#42f59e";
  if (status === "fallback") return "#ffcc4d";
  if (status === "failed") return "#ff5d73";
  return "#66b7ff";
}

export function TahoeGlassDebugOverlay({
  diagnostics,
  surfaces,
}: TahoeGlassDebugOverlayProps) {
  const clientReady = React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  if (!clientReady) return null;

  return createPortal(
    <div
      aria-hidden="true"
      data-tahoe-glass-debug-overlay="true"
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
          maxWidth: 420,
          padding: "7px 9px",
          color: "white",
          background: "rgba(0, 0, 0, 0.86)",
          border: `1px solid ${statusColor(diagnostics.status)}`,
          borderRadius: 6,
          boxShadow: "0 4px 18px rgba(0,0,0,.35)",
          whiteSpace: "pre-wrap",
        }}
      >
        {`Tahoe ${diagnostics.status} / ${diagnostics.backend} / ${diagnostics.source}\n${diagnostics.visibleSurfaceCount}/${diagnostics.surfaceCount} visible · DPR ${diagnostics.dpr.toFixed(2)}${diagnostics.reason ? ` · ${diagnostics.reason}` : ""}`}
      </div>

      {surfaces.map((surface) => {
        const color = statusColor(surface.status);
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
                color: "#fff",
                background: "rgba(0,0,0,.86)",
                borderLeft: `3px solid ${color}`,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transform: "translateY(-100%)",
              }}
            >
              {`${surface.variant} · ${surface.status}/${surface.backend} · ${surface.source}${surface.reason ? ` · ${surface.reason}` : ""}`}
            </span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
