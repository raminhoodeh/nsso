import { TAHOE_V4_CONTROL_DISPLACEMENT_PX } from "./constants";
import type { TahoeV4SurfaceSnapshot } from "./types";

/**
 * The canonical material's 25% white base and strongest 20% white highlight
 * transmit 60% of the backdrop. Its separate semantic tint can then attenuate
 * that by another 16%. The shipped proof rounds 50.4% down to 50% and evaluates
 * both the light- and dark-tint offsets before blur.
 */
export const TAHOE_V4_PROOF_MATERIAL_TRANSMISSION = 0.5;
export interface TahoeV4ProofMaterialPrediction {
  backdropTransmission: number;
  lightOffset: number;
  darkOffset: number;
}
export const TAHOE_V4_PROOF_MATERIAL_PREDICTION: TahoeV4ProofMaterialPrediction = {
  backdropTransmission: TAHOE_V4_PROOF_MATERIAL_TRANSMISSION,
  // Fractions of white remaining after the base/highlight and max semantic tint.
  lightOffset: 0.496,
  darkOffset: 0.336,
};
export const TAHOE_V4_PROOF_BASE_WHITE_PREDICTION: TahoeV4ProofMaterialPrediction = {
  backdropTransmission: 0.6,
  lightOffset: 0.4,
  darkOffset: 0.4,
};
export const TAHOE_V4_PROOF_MAX_SAMPLES = 12;
export const TAHOE_V4_PROOF_CANDIDATE_BUDGET = 100_000;
export const TAHOE_V4_PROOF_MIN_SAMPLES = 4;
export const TAHOE_V4_PROOF_CHANGED_RATIO = 0.5;
export const TAHOE_V4_PROOF_MIN_CHANGED = 4;
/** JND threshold after conservative white-layer and tint adjustment. */
export const TAHOE_V4_PROOF_SAMPLE_DELTA_E = 2.3;
/** The full sample set must average at least one JND, not only a few outliers. */
export const TAHOE_V4_PROOF_MEAN_DELTA_E = 2.3;
/** At least one white-layer-and-tint-adjusted probe must clear two JNDs. */
export const TAHOE_V4_PROOF_MAX_DELTA_E = 4.6;
export const TAHOE_V4_PROOF_MIN_BEND_CSS_PX = 2;

const TAHOE_V4_PROOF_MAX_PRIMARY_SURFACES =
  TAHOE_V4_PROOF_MAX_SAMPLES / 2;
const TAHOE_V4_PROOF_LOCAL_TILE_COLUMNS = 4;
const TAHOE_V4_PROOF_LOCAL_TILE_ROWS = 4;

export interface TahoeV4RefractionProofSample {
  /** Device-pixel coordinate in the CPU map's top-to-bottom orientation. */
  x: number;
  y: number;
  bendPx: number;
  /** Registry surface that supplied this spatially reserved probe. */
  surfaceId: string;
  /** Third of the owning surface containing the probe, from top to bottom. */
  surfaceBand: 0 | 1 | 2;
  /** Coarse vertical viewport region, independent of nested surface identity. */
  viewportBand: 0 | 1 | 2;
}

export interface TahoeV4RefractionProofMetrics {
  sampleCount: number;
  changedCount: number;
  meanDelta: number;
  maxDelta: number;
  sampleSurfaceCount: number;
  changedSurfaceCount: number;
  sampleRegionCount: number;
  changedRegionCount: number;
}

interface DeviceSurfaceRegion {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  candidates: TahoeV4RefractionProofSample[];
}

interface LabColor {
  l: number;
  a: number;
  b: number;
}

export const EMPTY_TAHOE_V4_PROOF_METRICS: TahoeV4RefractionProofMetrics = {
  sampleCount: 0,
  changedCount: 0,
  meanDelta: 0,
  maxDelta: 0,
  sampleSurfaceCount: 0,
  changedSurfaceCount: 0,
  sampleRegionCount: 0,
  changedRegionCount: 0,
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Number.isFinite(value) ? value : 0));
}

function whiteLayerAdjustedChannel(
  channel: number,
  transmission: number,
  offset: number,
): number {
  const safeTransmission = Math.max(0, Math.min(1, transmission));
  const safeOffset = Math.max(0, Math.min(1, offset));
  return clampByte(
    clampByte(channel) * safeTransmission + 255 * safeOffset,
  );
}

function srgbChannelToLinear(channel: number): number {
  const normalized = clampByte(channel) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(red: number, green: number, blue: number): LabColor {
  const r = srgbChannelToLinear(red);
  const g = srgbChannelToLinear(green);
  const b = srgbChannelToLinear(blue);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const transform = (value: number) =>
    value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
  const fx = transform(x);
  const fy = transform(y);
  const fz = transform(z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function hueDegrees(a: number, b: number): number {
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  return degrees >= 0 ? degrees : degrees + 360;
}

/** CIEDE2000 perceptual color difference. */
function tahoeV4DeltaE2000(
  first: LabColor,
  second: LabColor,
): number {
  const averageLightness = (first.l + second.l) / 2;
  const firstChroma = Math.hypot(first.a, first.b);
  const secondChroma = Math.hypot(second.a, second.b);
  const averageChroma = (firstChroma + secondChroma) / 2;
  const averageChroma7 = averageChroma ** 7;
  const g =
    0.5 *
    (1 - Math.sqrt(averageChroma7 / (averageChroma7 + 25 ** 7)));
  const firstAdjustedA = (1 + g) * first.a;
  const secondAdjustedA = (1 + g) * second.a;
  const firstAdjustedChroma = Math.hypot(firstAdjustedA, first.b);
  const secondAdjustedChroma = Math.hypot(secondAdjustedA, second.b);
  const firstHue = hueDegrees(firstAdjustedA, first.b);
  const secondHue = hueDegrees(secondAdjustedA, second.b);
  const lightnessDifference = second.l - first.l;
  const chromaDifference = secondAdjustedChroma - firstAdjustedChroma;
  const rawHueDifference = secondHue - firstHue;
  let hueDifference = 0;
  if (firstAdjustedChroma * secondAdjustedChroma !== 0) {
    if (Math.abs(rawHueDifference) <= 180) hueDifference = rawHueDifference;
    else if (rawHueDifference > 180) hueDifference = rawHueDifference - 360;
    else hueDifference = rawHueDifference + 360;
  }
  const adjustedHueDifference =
    2 *
    Math.sqrt(firstAdjustedChroma * secondAdjustedChroma) *
    Math.sin(degreesToRadians(hueDifference / 2));
  const averageAdjustedChroma =
    (firstAdjustedChroma + secondAdjustedChroma) / 2;
  let averageHue = firstHue + secondHue;
  if (firstAdjustedChroma * secondAdjustedChroma === 0) {
    averageHue = firstHue + secondHue;
  } else if (Math.abs(firstHue - secondHue) <= 180) {
    averageHue = (firstHue + secondHue) / 2;
  } else if (firstHue + secondHue < 360) {
    averageHue = (firstHue + secondHue + 360) / 2;
  } else {
    averageHue = (firstHue + secondHue - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos(degreesToRadians(averageHue - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * averageHue)) +
    0.32 * Math.cos(degreesToRadians(3 * averageHue + 6)) -
    0.2 * Math.cos(degreesToRadians(4 * averageHue - 63));
  const deltaTheta =
    30 * Math.exp(-(((averageHue - 275) / 25) ** 2));
  const averageAdjustedChroma7 = averageAdjustedChroma ** 7;
  const rotation =
    -2 *
    Math.sqrt(
      averageAdjustedChroma7 /
        (averageAdjustedChroma7 + 25 ** 7),
    ) *
    Math.sin(degreesToRadians(2 * deltaTheta));
  const lightnessScale =
    1 +
    (0.015 * (averageLightness - 50) ** 2) /
      Math.sqrt(20 + (averageLightness - 50) ** 2);
  const chromaScale = 1 + 0.045 * averageAdjustedChroma;
  const hueScale = 1 + 0.015 * averageAdjustedChroma * t;
  const lightnessTerm = lightnessDifference / lightnessScale;
  const chromaTerm = chromaDifference / chromaScale;
  const hueTerm = adjustedHueDifference / hueScale;
  return Math.sqrt(
    lightnessTerm ** 2 +
      chromaTerm ** 2 +
      hueTerm ** 2 +
      rotation * chromaTerm * hueTerm,
  );
}

function clippedDeviceRegion(
  surface: TahoeV4SurfaceSnapshot,
  width: number,
  height: number,
  dpr: number,
): DeviceSurfaceRegion | null {
  if (
    surface.profile === "material-only" ||
    !surface.visible ||
    !surface.clipRect ||
    surface.opacity <= 0.01 ||
    surface.rect.width <= 0 ||
    surface.rect.height <= 0
  ) {
    return null;
  }
  const left = Math.max(
    0,
    Math.floor(Math.max(surface.rect.x, surface.clipRect.x) * dpr),
  );
  const top = Math.max(
    0,
    Math.floor(Math.max(surface.rect.y, surface.clipRect.y) * dpr),
  );
  const right = Math.min(
    width,
    Math.ceil(
      Math.min(
        surface.rect.x + surface.rect.width,
        surface.clipRect.x + surface.clipRect.width,
      ) * dpr,
    ),
  );
  const bottom = Math.min(
    height,
    Math.ceil(
      Math.min(
        surface.rect.y + surface.rect.height,
        surface.clipRect.y + surface.clipRect.height,
      ) * dpr,
    ),
  );
  if (right - left < 2 || bottom - top < 2) return null;
  return {
    id: surface.id,
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    candidates: [],
  };
}

function sampleBand(region: DeviceSurfaceRegion, y: number): 0 | 1 | 2 {
  const normalized =
    (y - region.top) / Math.max(1, region.bottom - region.top);
  return Math.max(0, Math.min(2, Math.floor(normalized * 3))) as 0 | 1 | 2;
}

function bendAt(
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  normalScale: number,
): number {
  const offset = (y * width + x) * 4;
  const alpha = data[offset + 3] / 255;
  if (alpha <= 0) return 0;
  const bendX = (data[offset] / 255 - 0.5) * 2 * normalScale * alpha;
  const bendY = (data[offset + 1] / 255 - 0.5) * 2 * normalScale * alpha;
  return Math.hypot(bendX, bendY);
}

function addIfSpaced(
  selected: TahoeV4RefractionProofSample[],
  candidate: TahoeV4RefractionProofSample,
  minimumSpacing: number,
): boolean {
  if (
    selected.some(
      (sample) =>
        Math.hypot(sample.x - candidate.x, sample.y - candidate.y) <
        minimumSpacing,
    )
  ) {
    return false;
  }
  selected.push(candidate);
  return true;
}

function chooseSpatiallyDistributedRegions(
  regions: readonly DeviceSurfaceRegion[],
  width: number,
  height: number,
): readonly DeviceSurfaceRegion[] {
  if (regions.length <= TAHOE_V4_PROOF_MAX_PRIMARY_SURFACES) return regions;
  const remaining = [...regions];
  const strongest = remaining.reduce((best, region) =>
    (region.candidates[0]?.bendPx ?? 0) >
    (best.candidates[0]?.bendPx ?? 0)
      ? region
      : best,
  );
  const selected = [strongest];
  remaining.splice(remaining.indexOf(strongest), 1);
  while (
    selected.length < TAHOE_V4_PROOF_MAX_PRIMARY_SURFACES &&
    remaining.length > 0
  ) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const region = remaining[index];
      const nearest = Math.min(
        ...selected.map((chosen) =>
          Math.hypot(
            (region.centerX - chosen.centerX) / Math.max(1, width),
            (region.centerY - chosen.centerY) / Math.max(1, height),
          ),
        ),
      );
      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestIndex = index;
      }
    }
    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }
  return selected;
}

/**
 * Selects high-bend proof probes without allowing one strong, full-width
 * surface (such as the fixed header) to monopolize the sample set. The scan is
 * hard-capped across all visible refractive surfaces, and two well-spaced
 * probes are reserved per spatially selected surface before any strongest-
 * remaining fill.
 */
export function selectTahoeV4RefractionProofSamples(
  data: Uint8Array,
  width: number,
  height: number,
  dpr: number,
  surfaces: readonly TahoeV4SurfaceSnapshot[],
): readonly TahoeV4RefractionProofSample[] {
  if (width < 2 || height < 2 || data.length < width * height * 4) return [];
  const regions = surfaces
    .map((surface) => clippedDeviceRegion(surface, width, height, dpr))
    .filter((region): region is DeviceSurfaceRegion => region !== null)
    // One sampled point per surface is the irreducible scan cost. This guard
    // keeps even adversarial registries within the documented pixel budget.
    .slice(0, TAHOE_V4_PROOF_CANDIDATE_BUDGET);
  if (regions.length === 0) return [];

  const perSurfaceBudget = Math.max(
    1,
    Math.floor(TAHOE_V4_PROOF_CANDIDATE_BUDGET / regions.length),
  );
  const normalScale = TAHOE_V4_CONTROL_DISPLACEMENT_PX * dpr;
  const minimumBendPx = Math.max(1, TAHOE_V4_PROOF_MIN_BEND_CSS_PX * dpr);

  for (const region of regions) {
    const regionWidth = region.right - region.left;
    const regionHeight = region.bottom - region.top;
    const aspect = regionWidth / Math.max(1, regionHeight);
    const columns = Math.max(
      1,
      Math.min(
        regionWidth,
        Math.floor(Math.sqrt(perSurfaceBudget * aspect)),
      ),
    );
    const rows = Math.max(
      1,
      Math.min(regionHeight, Math.floor(perSurfaceBudget / columns)),
    );
    const strongestByTile = new Map<number, TahoeV4RefractionProofSample>();
    for (let row = 0; row < rows; row += 1) {
      const y = Math.min(
        region.bottom - 1,
        Math.max(
          region.top,
          Math.floor(region.top + ((row + 0.5) * regionHeight) / rows),
        ),
      );
      for (let column = 0; column < columns; column += 1) {
        const x = Math.min(
          region.right - 1,
          Math.max(
            region.left,
            Math.floor(
              region.left + ((column + 0.5) * regionWidth) / columns,
            ),
          ),
        );
        const bendPx = bendAt(data, width, x, y, normalScale);
        if (bendPx < minimumBendPx) continue;
        const tileColumn = Math.min(
          TAHOE_V4_PROOF_LOCAL_TILE_COLUMNS - 1,
          Math.floor(
            ((x - region.left) / Math.max(1, regionWidth)) *
              TAHOE_V4_PROOF_LOCAL_TILE_COLUMNS,
          ),
        );
        const tileRow = Math.min(
          TAHOE_V4_PROOF_LOCAL_TILE_ROWS - 1,
          Math.floor(
            ((y - region.top) / Math.max(1, regionHeight)) *
              TAHOE_V4_PROOF_LOCAL_TILE_ROWS,
          ),
        );
        const tile = tileRow * TAHOE_V4_PROOF_LOCAL_TILE_COLUMNS + tileColumn;
        const candidate: TahoeV4RefractionProofSample = {
          x,
          y,
          bendPx,
          surfaceId: region.id,
          surfaceBand: sampleBand(region, y),
          viewportBand: Math.max(
            0,
            Math.min(2, Math.floor((y / Math.max(1, height)) * 3)),
          ) as 0 | 1 | 2,
        };
        const previous = strongestByTile.get(tile);
        if (!previous || candidate.bendPx > previous.bendPx) {
          strongestByTile.set(tile, candidate);
        }
      }
    }
    region.candidates = [...strongestByTile.values()].sort(
      (left, right) => right.bendPx - left.bendPx,
    );
  }

  const candidateRegions = regions.filter(
    (region) => region.candidates.length > 0,
  );
  if (candidateRegions.length === 0) return [];
  const primaryRegions = chooseSpatiallyDistributedRegions(
    candidateRegions,
    width,
    height,
  );
  const minimumSpacing = Math.max(4, Math.round(6 * dpr));
  const selected: TahoeV4RefractionProofSample[] = [];

  for (const region of primaryRegions) {
    let reserved = 0;
    for (const candidate of region.candidates) {
      if (addIfSpaced(selected, candidate, minimumSpacing)) reserved += 1;
      if (reserved >= 2) break;
    }
  }

  const remaining = candidateRegions
    .flatMap((region) => region.candidates)
    .sort((left, right) => right.bendPx - left.bendPx);
  for (const candidate of remaining) {
    if (selected.length >= TAHOE_V4_PROOF_MAX_SAMPLES) break;
    addIfSpaced(selected, candidate, minimumSpacing);
  }
  return selected.slice(0, TAHOE_V4_PROOF_MAX_SAMPLES);
}

export function measureTahoeV4RefractionProof(
  control: Uint8Array,
  displaced: Uint8Array,
  samples: readonly TahoeV4RefractionProofSample[],
  material: TahoeV4ProofMaterialPrediction =
    TAHOE_V4_PROOF_MATERIAL_PREDICTION,
): TahoeV4RefractionProofMetrics {
  let changedCount = 0;
  let deltaSum = 0;
  let maxDelta = 0;
  const sampleSurfaces = new Set<string>();
  const changedSurfaces = new Set<string>();
  const sampleRegions = new Set<string>();
  const changedRegions = new Set<string>();
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const offset = index * 3;
    const predictedDelta = (tintOffset: number) => {
      const adjustedLab = (buffer: Uint8Array) =>
        rgbToLab(
          whiteLayerAdjustedChannel(
            buffer[offset] ?? 0,
            material.backdropTransmission,
            tintOffset,
          ),
          whiteLayerAdjustedChannel(
            buffer[offset + 1] ?? 0,
            material.backdropTransmission,
            tintOffset,
          ),
          whiteLayerAdjustedChannel(
            buffer[offset + 2] ?? 0,
            material.backdropTransmission,
            tintOffset,
          ),
        );
      return tahoeV4DeltaE2000(adjustedLab(control), adjustedLab(displaced));
    };
    const delta = Math.min(
      predictedDelta(material.lightOffset),
      predictedDelta(material.darkOffset),
    );
    const region = String(sample.viewportBand);
    sampleSurfaces.add(sample.surfaceId);
    sampleRegions.add(region);
    if (delta >= TAHOE_V4_PROOF_SAMPLE_DELTA_E) {
      changedCount += 1;
      changedSurfaces.add(sample.surfaceId);
      changedRegions.add(region);
    }
    deltaSum += delta;
    maxDelta = Math.max(maxDelta, delta);
  }
  return {
    sampleCount: samples.length,
    changedCount,
    meanDelta: samples.length > 0 ? deltaSum / samples.length : 0,
    maxDelta,
    sampleSurfaceCount: sampleSurfaces.size,
    changedSurfaceCount: changedSurfaces.size,
    sampleRegionCount: sampleRegions.size,
    changedRegionCount: changedRegions.size,
  };
}

export function tahoeV4RefractionProofPassed(
  metrics: TahoeV4RefractionProofMetrics,
): boolean {
  const changedRequirement = Math.max(
    TAHOE_V4_PROOF_MIN_CHANGED,
    Math.ceil(metrics.sampleCount * TAHOE_V4_PROOF_CHANGED_RATIO),
  );
  const distributed =
    metrics.changedRegionCount >= 2 &&
    (metrics.sampleSurfaceCount < 2 || metrics.changedSurfaceCount >= 2);
  return (
    metrics.sampleCount >= TAHOE_V4_PROOF_MIN_SAMPLES &&
    metrics.changedCount >= changedRequirement &&
    metrics.meanDelta >= TAHOE_V4_PROOF_MEAN_DELTA_E &&
    metrics.maxDelta >= TAHOE_V4_PROOF_MAX_DELTA_E &&
    distributed
  );
}

/**
 * Runtime diagnostics publish the immutable last certified proof. A weaker
 * observational revalidation may be recorded internally but cannot replace it.
 */
export function tahoeV4PublishedProofMetrics(
  certified: TahoeV4RefractionProofMetrics | null,
  observed: TahoeV4RefractionProofMetrics,
): TahoeV4RefractionProofMetrics {
  return certified ?? observed;
}
