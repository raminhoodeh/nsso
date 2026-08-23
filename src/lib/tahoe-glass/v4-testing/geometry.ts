import type {
  EdgeProbeFixture,
  NormalizedPoint,
  PixelPoint,
  PixelRect,
} from "./types";

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function insetRect(rect: PixelRect, inset: number): PixelRect {
  const safeInset = clamp(inset, 0, Math.min(rect.width, rect.height) / 2);
  return {
    x: rect.x + safeInset,
    y: rect.y + safeInset,
    width: Math.max(0, rect.width - safeInset * 2),
    height: Math.max(0, rect.height - safeInset * 2),
  };
}

export function normalizedPointToPixel(
  point: NormalizedPoint,
  width: number,
  height: number,
): PixelPoint {
  return {
    x: clamp(point.x, 0, 1) * Math.max(0, width - 1),
    y: clamp(point.y, 0, 1) * Math.max(0, height - 1),
  };
}

export function isInsideRoundedRect(
  x: number,
  y: number,
  rect: PixelRect,
  radius: number,
): boolean {
  if (
    x < rect.x ||
    y < rect.y ||
    x >= rect.x + rect.width ||
    y >= rect.y + rect.height
  ) {
    return false;
  }

  const safeRadius = clamp(radius, 0, Math.min(rect.width, rect.height) / 2);
  if (safeRadius === 0) return true;

  const innerLeft = rect.x + safeRadius;
  const innerRight = rect.x + rect.width - safeRadius;
  const innerTop = rect.y + safeRadius;
  const innerBottom = rect.y + rect.height - safeRadius;
  if (x >= innerLeft && x < innerRight) return true;
  if (y >= innerTop && y < innerBottom) return true;

  const centerX = x < innerLeft ? innerLeft : innerRight;
  const centerY = y < innerTop ? innerTop : innerBottom;
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= safeRadius * safeRadius;
}

/**
 * Builds a byte mask for screenshot comparisons. The mask excludes the rim,
 * shadow and rounded corners so those pixels cannot be counted as refraction.
 */
export function createRoundedInteriorMask(options: {
  width: number;
  height: number;
  radius: number;
  inset: number;
}): Uint8Array {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  const mask = new Uint8Array(width * height);
  const outer: PixelRect = { x: 0, y: 0, width, height };
  const interior = insetRect(outer, Math.max(0, options.inset));
  const interiorRadius = Math.max(0, options.radius - options.inset);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isInsideRoundedRect(x + 0.5, y + 0.5, interior, interiorRadius)) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

export function createSurfaceInteriorMask(options: {
  cssWidth: number;
  cssHeight: number;
  radiusCssPx: number;
  devicePixelRatio?: number;
  insetCssPx?: number;
}): Uint8Array {
  const dpr = Math.max(0.01, options.devicePixelRatio ?? 1);
  return createRoundedInteriorMask({
    width: Math.round(options.cssWidth * dpr),
    height: Math.round(options.cssHeight * dpr),
    radius: options.radiusCssPx * dpr,
    inset: (options.insetCssPx ?? 12) * dpr,
  });
}

export interface ResolvedEdgeProbe {
  id: string;
  axis: EdgeProbeFixture["axis"];
  fixed: number;
  anchor: number;
  searchStart: number;
  searchEnd: number;
  kind: EdgeProbeFixture["kind"];
}

export function resolveEdgeProbe(
  probe: EdgeProbeFixture,
  width: number,
  height: number,
): ResolvedEdgeProbe {
  const axisLength = probe.axis === "x" ? width : height;
  const fixedLength = probe.axis === "x" ? height : width;
  const anchor = clamp(probe.anchor, 0, 1) * Math.max(0, axisLength - 1);
  const radius = clamp(probe.searchRadius, 0, 0.5) * axisLength;
  return {
    id: probe.id,
    axis: probe.axis,
    fixed: clamp(probe.fixed, 0, 1) * Math.max(0, fixedLength - 1),
    anchor,
    searchStart: clamp(Math.floor(anchor - radius), 1, Math.max(1, axisLength - 2)),
    searchEnd: clamp(Math.ceil(anchor + radius), 1, Math.max(1, axisLength - 2)),
    kind: probe.kind,
  };
}
