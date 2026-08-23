import {
  TAHOE_V4_CONTROL_CURVE_POWER,
  TAHOE_V4_CONTROL_SUPERELLIPSE_POWER,
  TAHOE_V4_EDGE_LENS_MAX_BAND_PX,
  TAHOE_V4_EDGE_LENS_MIN_BAND_PX,
  TAHOE_V4_EDGE_LENS_SHORT_SIDE_RATIO,
  TAHOE_V4_LIGHT_SOURCE,
  TAHOE_V4_PANEL_BODY_DISPLACEMENT_PX,
  TAHOE_V4_PANEL_EDGE_DISPLACEMENT_PX,
  TAHOE_V4_PANEL_MAX_DISPLACEMENT_PX,
  TAHOE_V4_RIM_BINS,
} from "./constants";
import type { TahoeV4CornerRadii, TahoeV4Profile } from "./types";

export interface TahoeV4DisplacementField {
  profile: Exclude<TahoeV4Profile, "material-only">;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  cornerRadiiPx: TahoeV4CornerRadii;
  edgeBandPx: number | null;
  /** RG encode the signed bend, B is neutral, and A is the surface mask. */
  data: Uint8Array;
}

export interface TahoeV4ControlFieldOptions {
  width: number;
  height: number;
  dpr?: number;
  alphaOutside?: 0 | 255;
}

export interface TahoeV4EdgeLensFieldOptions
  extends TahoeV4ControlFieldOptions {
  /** Uniform-radius convenience retained for deterministic fixtures. */
  radiusPx?: number;
  cornerRadiiPx?: TahoeV4CornerRadii;
  edgeBandPx?: number;
}

export interface TahoeV4RefractionAnalysis {
  profile: number[];
  domAngle: number;
  magnitude: number;
}

export interface TahoeV4RimVariables {
  cos: number;
  sin: number;
  lightAngleDeg: number;
  magnitude: number;
  gradient: string;
}

export interface TahoeV4RimCssVariables {
  "--cos": string;
  "--sin": string;
  "--light-angle": string;
  "--rim-intensity": string;
  "--rim-gradient": string;
}

export interface TahoeV4Vector2 {
  x: number;
  y: number;
}

export interface TahoeV4PanelDisplacementOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadiiPx: TahoeV4CornerRadii;
  edgeBandPx: number;
}

function dimensions(width: number, height: number, dpr = 1) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("tahoe-v4-field-dimensions-must-be-finite");
  }
  if (width <= 0 || height <= 0) {
    throw new Error("tahoe-v4-field-dimensions-must-be-positive");
  }
  const safeDpr = Math.max(0.25, Number.isFinite(dpr) ? dpr : 1);
  return {
    safeDpr,
    pixelWidth: Math.max(1, Math.round(width * safeDpr)),
    pixelHeight: Math.max(1, Math.round(height * safeDpr)),
  };
}

function writePixel(
  data: Uint8Array,
  index: number,
  bendX: number,
  bendY: number,
  alpha: number,
): void {
  data[index] = Math.round(128 + Math.max(-1, Math.min(1, bendX)) * 127);
  data[index + 1] = Math.round(
    128 + Math.max(-1, Math.min(1, bendY)) * 127,
  );
  data[index + 2] = 128;
  data[index + 3] = alpha;
}

/**
 * Exact byte-level reproduction of the supplied normalized button field.
 * Keep this generator unchanged; only the separate edge-lens profile may be
 * calibrated for large production surfaces.
 */
export function createTahoeV4CanonicalControlField({
  width,
  height,
  dpr = 1,
  alphaOutside = 0,
}: TahoeV4ControlFieldOptions): TahoeV4DisplacementField {
  const { safeDpr, pixelWidth, pixelHeight } = dimensions(width, height, dpr);
  const data = new Uint8Array(pixelWidth * pixelHeight * 4);

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const nx = (x / pixelWidth) * 2 - 1;
      const ny = (y / pixelHeight) * 2 - 1;
      const distance =
        Math.pow(Math.abs(nx), TAHOE_V4_CONTROL_SUPERELLIPSE_POWER) +
        Math.pow(Math.abs(ny), TAHOE_V4_CONTROL_SUPERELLIPSE_POWER);
      const index = (y * pixelWidth + x) * 4;

      if (distance <= 1) {
        const curveMagnitude = Math.sin(
          Math.pow(distance, TAHOE_V4_CONTROL_CURVE_POWER) * Math.PI,
        );
        writePixel(
          data,
          index,
          -nx * curveMagnitude,
          -ny * curveMagnitude,
          255,
        );
      } else {
        writePixel(data, index, 0, 0, alphaOutside);
      }
    }
  }

  return {
    profile: "control",
    cssWidth: width,
    cssHeight: height,
    pixelWidth,
    pixelHeight,
    dpr: safeDpr,
    cornerRadiiPx: {
      topLeft: Math.min(width, height) / 2,
      topRight: Math.min(width, height) / 2,
      bottomRight: Math.min(width, height) / 2,
      bottomLeft: Math.min(width, height) / 2,
    },
    edgeBandPx: null,
    data,
  };
}

export function resolveTahoeV4EdgeBandPx(
  width: number,
  height: number,
  requested?: number,
): number {
  const shortSide = Math.min(width, height);
  const desired = Number.isFinite(requested)
    ? Math.max(1, requested as number)
    : Math.max(
        TAHOE_V4_EDGE_LENS_MIN_BAND_PX,
        Math.min(
          TAHOE_V4_EDGE_LENS_MAX_BAND_PX,
          shortSide * TAHOE_V4_EDGE_LENS_SHORT_SIDE_RATIO,
        ),
      );
  return Math.max(1, Math.min(desired, shortSide / 2));
}

interface SdfSample {
  distance: number;
  outwardX: number;
  outwardY: number;
}

/** Signed distance and outward normal for a centered rounded rectangle. */
function roundedRectSample(
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadii: TahoeV4CornerRadii,
): SdfSample {
  const localX = x - width / 2;
  const localY = y - height / 2;
  const radius =
    localY < 0
      ? localX < 0
        ? cornerRadii.topLeft
        : cornerRadii.topRight
      : localX < 0
        ? cornerRadii.bottomLeft
        : cornerRadii.bottomRight;
  const signX = localX < 0 ? -1 : localX > 0 ? 1 : 0;
  const signY = localY < 0 ? -1 : localY > 0 ? 1 : 0;
  const qx = Math.abs(localX) - width / 2 + radius;
  const qy = Math.abs(localY) - height / 2 + radius;
  const outsideX = Math.max(qx, 0);
  const outsideY = Math.max(qy, 0);
  const outsideLength = Math.hypot(outsideX, outsideY);
  const distance =
    outsideLength + Math.min(Math.max(qx, qy), 0) - radius;

  if (outsideLength > 0.0001) {
    return {
      distance,
      outwardX: (outsideX / outsideLength) * signX,
      outwardY: (outsideY / outsideLength) * signY,
    };
  }
  if (qx > qy) {
    return { distance, outwardX: signX || 1, outwardY: 0 };
  }
  return { distance, outwardX: 0, outwardY: signY || 1 };
}

/** The supplied normalized convex field, sampled without allocating a map. */
export function sampleTahoeV4CanonicalBodyVector(
  normalizedX: number,
  normalizedY: number,
): TahoeV4Vector2 {
  const distance =
    Math.pow(Math.abs(normalizedX), TAHOE_V4_CONTROL_SUPERELLIPSE_POWER) +
    Math.pow(Math.abs(normalizedY), TAHOE_V4_CONTROL_SUPERELLIPSE_POWER);
  if (distance > 1) return { x: 0, y: 0 };
  const curveMagnitude = Math.sin(
    Math.pow(distance, TAHOE_V4_CONTROL_CURVE_POWER) * Math.PI,
  );
  return {
    x: -normalizedX * curveMagnitude,
    y: -normalizedY * curveMagnitude,
  };
}

/** Clamp a vector radially, preserving its direction. */
export function clampTahoeV4VectorMagnitude(
  vector: TahoeV4Vector2,
  maximum: number,
): TahoeV4Vector2 {
  const safeMaximum = Math.max(0, maximum);
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude <= safeMaximum || magnitude === 0) return vector;
  const scale = safeMaximum / magnitude;
  return { x: vector.x * scale, y: vector.y * scale };
}

/**
 * Two-scale panel lens in physical CSS pixels. The fixed edge lens preserves
 * the supplied 35px rim optics while the canonical body term bends detail
 * across large neutral interiors. `null` means the point is outside the
 * rounded surface mask.
 */
export function sampleTahoeV4PanelDisplacementPx({
  x,
  y,
  width,
  height,
  cornerRadiiPx,
  edgeBandPx,
}: TahoeV4PanelDisplacementOptions): TahoeV4Vector2 | null {
  const sample = roundedRectSample(
    x,
    y,
    width,
    height,
    cornerRadiiPx,
  );
  if (sample.distance > 0) return null;

  const inset = Math.max(0, -sample.distance);
  const normalizedInset = Math.min(
    1,
    inset / Math.max(Number.EPSILON, edgeBandPx),
  );
  const edgeMagnitude =
    normalizedInset >= 1
      ? 0
      : Math.sin(
          Math.pow(normalizedInset, TAHOE_V4_CONTROL_CURVE_POWER) * Math.PI,
        );
  const body = sampleTahoeV4CanonicalBodyVector(
    (x / width) * 2 - 1,
    (y / height) * 2 - 1,
  );
  return clampTahoeV4VectorMagnitude(
    {
      x:
        -sample.outwardX *
          edgeMagnitude *
          TAHOE_V4_PANEL_EDGE_DISPLACEMENT_PX +
        body.x * TAHOE_V4_PANEL_BODY_DISPLACEMENT_PX,
      y:
        -sample.outwardY *
          edgeMagnitude *
          TAHOE_V4_PANEL_EDGE_DISPLACEMENT_PX +
        body.y * TAHOE_V4_PANEL_BODY_DISPLACEMENT_PX,
    },
    TAHOE_V4_PANEL_MAX_DISPLACEMENT_PX,
  );
}

/**
 * A two-scale lens for cards, panels, menus and dialogs. Its full-strength
 * edge bend remains fixed in CSS pixels while a weaker canonical body term
 * prevents large interiors from becoming optically neutral.
 */
export function createTahoeV4RoundedEdgeLensField({
  width,
  height,
  dpr = 1,
  alphaOutside = 0,
  radiusPx,
  cornerRadiiPx,
  edgeBandPx,
}: TahoeV4EdgeLensFieldOptions): TahoeV4DisplacementField {
  const { safeDpr, pixelWidth, pixelHeight } = dimensions(width, height, dpr);
  const uniformRadius = Math.max(
    0,
    Math.min(radiusPx ?? 0, Math.min(width, height) / 2),
  );
  const requestedRadii = cornerRadiiPx ?? {
    topLeft: uniformRadius,
    topRight: uniformRadius,
    bottomRight: uniformRadius,
    bottomLeft: uniformRadius,
  };
  const rawCornerRadii: TahoeV4CornerRadii = {
    topLeft: Math.max(0, requestedRadii.topLeft),
    topRight: Math.max(0, requestedRadii.topRight),
    bottomRight: Math.max(0, requestedRadii.bottomRight),
    bottomLeft: Math.max(0, requestedRadii.bottomLeft),
  };
  const ratio = (available: number, requested: number) =>
    requested > 0 ? available / requested : 1;
  const radiusScale = Math.min(
    1,
    ratio(width, rawCornerRadii.topLeft + rawCornerRadii.topRight),
    ratio(width, rawCornerRadii.bottomLeft + rawCornerRadii.bottomRight),
    ratio(height, rawCornerRadii.topLeft + rawCornerRadii.bottomLeft),
    ratio(height, rawCornerRadii.topRight + rawCornerRadii.bottomRight),
  );
  const cornerRadii: TahoeV4CornerRadii = {
    topLeft: rawCornerRadii.topLeft * radiusScale,
    topRight: rawCornerRadii.topRight * radiusScale,
    bottomRight: rawCornerRadii.bottomRight * radiusScale,
    bottomLeft: rawCornerRadii.bottomLeft * radiusScale,
  };
  const band = resolveTahoeV4EdgeBandPx(width, height, edgeBandPx);
  const data = new Uint8Array(pixelWidth * pixelHeight * 4);

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const cssX = (x + 0.5) / safeDpr;
      const cssY = (y + 0.5) / safeDpr;
      const displacement = sampleTahoeV4PanelDisplacementPx({
        x: cssX,
        y: cssY,
        width,
        height,
        cornerRadiiPx: cornerRadii,
        edgeBandPx: band,
      });
      const index = (y * pixelWidth + x) * 4;
      if (!displacement) {
        writePixel(data, index, 0, 0, alphaOutside);
        continue;
      }
      writePixel(
        data,
        index,
        displacement.x / TAHOE_V4_PANEL_EDGE_DISPLACEMENT_PX,
        displacement.y / TAHOE_V4_PANEL_EDGE_DISPLACEMENT_PX,
        255,
      );
    }
  }

  return {
    profile: "edge-lens",
    cssWidth: width,
    cssHeight: height,
    pixelWidth,
    pixelHeight,
    dpr: safeDpr,
    cornerRadiiPx: cornerRadii,
    edgeBandPx: band,
    data,
  };
}

export function tahoeV4FieldMaximumBend(
  field: TahoeV4DisplacementField,
): number {
  let maximum = 0;
  for (let index = 0; index < field.data.length; index += 4) {
    if (field.data[index + 3] === 0) continue;
    const x = (field.data[index] - 128) / 127;
    const y = (field.data[index + 1] - 128) / 127;
    maximum = Math.max(maximum, Math.hypot(x, y));
  }
  return maximum;
}

/** Exact supplied 24-bin deformation analysis, evaluated from field bytes. */
export function analyzeTahoeV4Refraction(
  field: TahoeV4DisplacementField,
  lightAzimuth: number,
): TahoeV4RefractionAnalysis {
  const profile = new Array<number>(TAHOE_V4_RIM_BINS).fill(0);
  const counts = new Array<number>(TAHOE_V4_RIM_BINS).fill(0);
  let sumX = 0;
  let sumY = 0;
  let sumMagnitude = 0;
  const step = Math.max(1, Math.round(2 * field.dpr));

  for (let y = 0; y < field.pixelHeight; y += step) {
    for (let x = 0; x < field.pixelWidth; x += step) {
      const index = (y * field.pixelWidth + x) * 4;
      const bendX = (field.data[index] - 128) / 127;
      const bendY = (field.data[index + 1] - 128) / 127;
      const magnitude = Math.hypot(bendX, bendY);
      if (magnitude < 0.02) continue;

      const angle = Math.atan2(bendY, bendX);
      const facing = Math.max(0, Math.cos(angle - lightAzimuth));
      const brightness = magnitude * (0.35 + 0.65 * facing);
      sumX += Math.cos(angle) * brightness;
      sumY += Math.sin(angle) * brightness;
      sumMagnitude += brightness;

      let bin =
        Math.floor(
          ((angle + Math.PI) / (2 * Math.PI)) * TAHOE_V4_RIM_BINS,
        ) % TAHOE_V4_RIM_BINS;
      if (bin < 0) bin += TAHOE_V4_RIM_BINS;
      profile[bin] += brightness;
      counts[bin] += 1;
    }
  }

  let maxProfile = 0;
  for (let bin = 0; bin < TAHOE_V4_RIM_BINS; bin += 1) {
    if (counts[bin]) profile[bin] /= counts[bin];
    maxProfile = Math.max(maxProfile, profile[bin]);
  }
  if (maxProfile > 0) {
    for (let bin = 0; bin < TAHOE_V4_RIM_BINS; bin += 1) {
      profile[bin] /= maxProfile;
    }
  }

  const domAngle = Math.atan2(sumY, sumX);
  const samples = Math.max(
    1,
    (field.pixelWidth * field.pixelHeight) / (step * step),
  );
  const magnitude = Math.min(1, (sumMagnitude / samples) * 6);
  return { profile, domAngle, magnitude };
}

export function buildTahoeV4ConicGradient(
  profile: readonly number[],
  fromDeg: number,
): string {
  const stops: string[] = [];
  for (let bin = 0; bin <= TAHOE_V4_RIM_BINS; bin += 1) {
    const value = profile[bin % TAHOE_V4_RIM_BINS] ?? 0;
    const degrees = (bin / TAHOE_V4_RIM_BINS) * 360;
    const opacity = (0.07 + value * 0.63).toFixed(3);
    stops.push(
      `rgba(255,255,255,${opacity}) ${degrees.toFixed(1)}deg`,
    );
  }
  return `conic-gradient(from ${fromDeg.toFixed(1)}deg at 50% 50%, ${stops.join(", ")})`;
}

export function calculateTahoeV4Rim(
  field: TahoeV4DisplacementField,
  centerX: number,
  centerY: number,
): TahoeV4RimVariables {
  const lightAzimuth = Math.atan2(
    TAHOE_V4_LIGHT_SOURCE.y - centerY,
    TAHOE_V4_LIGHT_SOURCE.x - centerX,
  );
  const analysis = analyzeTahoeV4Refraction(field, lightAzimuth);
  const intensity = 0.4 + analysis.magnitude * 0.6;
  const cos = -Math.cos(analysis.domAngle) * intensity;
  const sin = -Math.sin(analysis.domAngle) * intensity;
  const lightAngleDeg = (analysis.domAngle * 180) / Math.PI + 90;
  return {
    cos,
    sin,
    lightAngleDeg,
    magnitude: analysis.magnitude,
    gradient: buildTahoeV4ConicGradient(analysis.profile, lightAngleDeg),
  };
}

export function tahoeV4RimCssVariables(
  rim: TahoeV4RimVariables,
): TahoeV4RimCssVariables {
  return {
    "--cos": rim.cos.toString(),
    "--sin": rim.sin.toString(),
    "--light-angle": `${rim.lightAngleDeg}deg`,
    "--rim-intensity": rim.magnitude.toString(),
    "--rim-gradient": rim.gradient,
  };
}
