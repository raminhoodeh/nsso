import { clamp, resolveEdgeProbe } from "./geometry";
import { DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS } from "./fixtures";
import type { TahoeV4Diagnostics } from "../v4/types";
import type {
  ApprovedReferenceComparison,
  EdgeProbeFixture,
  EdgeShiftResult,
  PerceptualDifferenceResult,
  PixelBufferLike,
  RuntimeOpticalProofInspection,
  RuntimeRefractionMeasurement,
  TriptychMeasurement,
  VisualAcceptanceThresholds,
  VisualMetricVector,
} from "./types";

type RuntimeOpticalDiagnostics = Pick<
  TahoeV4Diagnostics,
  | "lifecycle"
  | "backend"
  | "sourceKind"
  | "reason"
  | "framePresented"
  | "refractiveSurfaceCount"
  | "proofPassed"
  | "sampleCount"
  | "changedCount"
  | "meanDelta"
  | "maxDelta"
>;

interface LabColor {
  l: number;
  a: number;
  b: number;
}

function assertComparableFrames(
  first: PixelBufferLike,
  second: PixelBufferLike,
): void {
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error(
      `Screenshot dimensions differ: ${first.width}x${first.height} versus ${second.width}x${second.height}`,
    );
  }
  const expectedLength = first.width * first.height * 4;
  if (first.data.length < expectedLength || second.data.length < expectedLength) {
    throw new Error("Screenshot buffers must contain four channels per pixel.");
  }
}

function srgbChannelToLinear(channel: number): number {
  const normalized = clamp(channel, 0, 255) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function pixelToLab(buffer: PixelBufferLike, pixelIndex: number): LabColor {
  const offset = pixelIndex * 4;
  const r = srgbChannelToLinear(Number(buffer.data[offset] ?? 0));
  const g = srgbChannelToLinear(Number(buffer.data[offset + 1] ?? 0));
  const b = srgbChannelToLinear(Number(buffer.data[offset + 2] ?? 0));

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

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function hueDegrees(a: number, b: number): number {
  const degrees = radiansToDegrees(Math.atan2(b, a));
  return degrees >= 0 ? degrees : degrees + 360;
}

/** CIEDE2000 perceptual color difference. A value of 2.3 is one JND. */
export function deltaE2000(first: LabColor, second: LabColor): number {
  const averageLightness = (first.l + second.l) / 2;
  const firstChroma = Math.hypot(first.a, first.b);
  const secondChroma = Math.hypot(second.a, second.b);
  const averageChroma = (firstChroma + secondChroma) / 2;
  const averageChroma7 = averageChroma ** 7;
  const g = 0.5 * (1 - Math.sqrt(averageChroma7 / (averageChroma7 + 25 ** 7)));
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

export function comparePerceptualDifference(
  first: PixelBufferLike,
  second: PixelBufferLike,
  options: { mask?: Uint8Array; jndDeltaE?: number } = {},
): PerceptualDifferenceResult {
  assertComparableFrames(first, second);
  const pixelCount = first.width * first.height;
  if (options.mask && options.mask.length !== pixelCount) {
    throw new Error("Comparison mask dimensions do not match the screenshots.");
  }
  const threshold = options.jndDeltaE ?? 2.3;
  let comparedPixels = 0;
  let jndPixels = 0;
  let deltaSum = 0;
  let maximumDeltaE = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    if (options.mask && options.mask[index] === 0) continue;
    const delta = deltaE2000(pixelToLab(first, index), pixelToLab(second, index));
    comparedPixels += 1;
    deltaSum += delta;
    maximumDeltaE = Math.max(maximumDeltaE, delta);
    if (delta >= threshold) jndPixels += 1;
  }

  return {
    comparedPixels,
    jndPixels,
    jndRatio: comparedPixels === 0 ? 0 : jndPixels / comparedPixels,
    meanDeltaE: comparedPixels === 0 ? 0 : deltaSum / comparedPixels,
    maximumDeltaE,
  };
}

function relativeLuminanceAt(
  buffer: PixelBufferLike,
  x: number,
  y: number,
): number {
  const resolvedX = clamp(Math.round(x), 0, Math.max(0, buffer.width - 1));
  const resolvedY = clamp(Math.round(y), 0, Math.max(0, buffer.height - 1));
  const offset = (resolvedY * buffer.width + resolvedX) * 4;
  const r = srgbChannelToLinear(Number(buffer.data[offset] ?? 0));
  const g = srgbChannelToLinear(Number(buffer.data[offset + 1] ?? 0));
  const b = srgbChannelToLinear(Number(buffer.data[offset + 2] ?? 0));
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function rgbAt(
  buffer: PixelBufferLike,
  x: number,
  y: number,
): readonly [number, number, number] {
  const resolvedX = clamp(Math.round(x), 0, Math.max(0, buffer.width - 1));
  const resolvedY = clamp(Math.round(y), 0, Math.max(0, buffer.height - 1));
  const offset = (resolvedY * buffer.width + resolvedX) * 4;
  return [
    Number(buffer.data[offset] ?? 0),
    Number(buffer.data[offset + 1] ?? 0),
    Number(buffer.data[offset + 2] ?? 0),
  ];
}

function chromaticSimilarity(
  sample: readonly [number, number, number],
  target: readonly [number, number, number],
): { score: number; contrast: number } {
  const sampleMean = (sample[0] + sample[1] + sample[2]) / 3;
  const targetMean = (target[0] + target[1] + target[2]) / 3;
  const sampleVector = [
    sample[0] - sampleMean,
    sample[1] - sampleMean,
    sample[2] - sampleMean,
  ] as const;
  const targetVector = [
    target[0] - targetMean,
    target[1] - targetMean,
    target[2] - targetMean,
  ] as const;
  const sampleMagnitude = Math.hypot(...sampleVector);
  const targetMagnitude = Math.hypot(...targetVector);
  if (sampleMagnitude < 0.001 || targetMagnitude < 0.001) {
    return { score: 0, contrast: 0 };
  }
  const cosine = clamp(
    (sampleVector[0] * targetVector[0] +
      sampleVector[1] * targetVector[1] +
      sampleVector[2] * targetVector[2]) /
      (sampleMagnitude * targetMagnitude),
    0,
    1,
  );
  const contrast = clamp(sampleMagnitude / 255, 0, 1);
  return { score: cosine ** 8 * contrast, contrast };
}

function strongestFeature(
  frame: PixelBufferLike,
  probe: EdgeProbeFixture,
): { position: number; contrast: number } {
  const resolved = resolveEdgeProbe(probe, frame.width, frame.height);
  let strongestPosition = resolved.anchor;
  let strongestScore = -1;
  let winningContrast = 0;
  for (
    let position = resolved.searchStart;
    position <= resolved.searchEnd;
    position += 1
  ) {
    if (probe.targetRgb) {
      const sample =
        resolved.axis === "x"
          ? rgbAt(frame, position, resolved.fixed)
          : rgbAt(frame, resolved.fixed, position);
      const similarity = chromaticSimilarity(sample, probe.targetRgb);
      if (similarity.score > strongestScore) {
        strongestScore = similarity.score;
        strongestPosition = position;
        winningContrast = similarity.contrast;
      }
      continue;
    }
    const before =
      resolved.axis === "x"
        ? relativeLuminanceAt(frame, position - 1, resolved.fixed)
        : relativeLuminanceAt(frame, resolved.fixed, position - 1);
    const after =
      resolved.axis === "x"
        ? relativeLuminanceAt(frame, position + 1, resolved.fixed)
        : relativeLuminanceAt(frame, resolved.fixed, position + 1);
    const contrast = Math.abs(after - before);
    if (contrast > strongestScore) {
      strongestScore = contrast;
      strongestPosition = position;
      winningContrast = contrast;
    }
  }
  return {
    position: strongestPosition,
    contrast: Math.max(0, winningContrast),
  };
}

export function measureEdgeShift(
  before: PixelBufferLike,
  after: PixelBufferLike,
  probe: EdgeProbeFixture,
  devicePixelRatio = 1,
): EdgeShiftResult {
  assertComparableFrames(before, after);
  const beforeEdge = strongestFeature(before, probe);
  const afterEdge = strongestFeature(after, probe);
  const shiftBitmapPixels = afterEdge.position - beforeEdge.position;
  return {
    id: probe.id,
    kind: probe.kind,
    beforeBitmapPosition: beforeEdge.position,
    afterBitmapPosition: afterEdge.position,
    shiftBitmapPixels,
    shiftCssPixels: shiftBitmapPixels / Math.max(0.01, devicePixelRatio),
    beforeEdgeContrast: beforeEdge.contrast,
    afterEdgeContrast: afterEdge.contrast,
  };
}

export function evaluateTriptych(options: {
  bare: PixelBufferLike;
  material: PixelBufferLike;
  refraction: PixelBufferLike;
  mask?: Uint8Array;
  probes: readonly EdgeProbeFixture[];
  devicePixelRatio?: number;
  thresholds?: VisualAcceptanceThresholds;
}): TriptychMeasurement {
  const thresholds =
    options.thresholds ?? DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS;
  const material = comparePerceptualDifference(options.bare, options.material, {
    mask: options.mask,
    jndDeltaE: thresholds.jndDeltaE,
  });
  const refraction = comparePerceptualDifference(
    options.material,
    options.refraction,
    { mask: options.mask, jndDeltaE: thresholds.jndDeltaE },
  );
  const edgeShifts = options.probes.map((probe) =>
    measureEdgeShift(
      options.material,
      options.refraction,
      probe,
      options.devicePixelRatio,
    ),
  );
  const strongEdges = edgeShifts.filter(
    (edge) =>
      edge.beforeEdgeContrast >= thresholds.minimumProbeEdgeContrast &&
      edge.afterEdgeContrast >= thresholds.minimumProbeEdgeContrast,
  );
  const visibleLensEdges = strongEdges.filter(
    (edge) =>
      edge.kind === "lens" &&
      Math.abs(edge.shiftCssPixels) >= thresholds.minimumLensProbeShiftCssPx,
  );
  const visibleSourceDetailEdges = strongEdges.filter(
    (edge) =>
      edge.kind === "source-detail" &&
      Math.abs(edge.shiftCssPixels) >=
        thresholds.minimumSourceDetailProbeShiftCssPx,
  );
  const maximumProbeShift = edgeShifts.reduce(
    (maximum, edge) => Math.max(maximum, Math.abs(edge.shiftCssPixels)),
    0,
  );
  const hasPositiveLensShift = visibleLensEdges.some(
    (edge) => edge.shiftCssPixels > 0,
  );
  const hasNegativeLensShift = visibleLensEdges.some(
    (edge) => edge.shiftCssPixels < 0,
  );
  const failures: string[] = [];

  if (material.jndRatio < thresholds.minimumMaterialJndRatio) {
    failures.push(
      `Material body changed ${(material.jndRatio * 100).toFixed(1)}% of interior pixels; expected at least ${(thresholds.minimumMaterialJndRatio * 100).toFixed(1)}%.`,
    );
  }
  if (refraction.jndRatio < thresholds.minimumRefractionJndRatio) {
    failures.push(
      `Refraction changed ${(refraction.jndRatio * 100).toFixed(1)}% of interior pixels; expected at least ${(thresholds.minimumRefractionJndRatio * 100).toFixed(1)}%.`,
    );
  }
  if (visibleLensEdges.length < thresholds.minimumLensProbeCount) {
    failures.push(
      `${visibleLensEdges.length} lens probes moved visibly; expected at least ${thresholds.minimumLensProbeCount}.`,
    );
  }
  if (maximumProbeShift < thresholds.minimumMaximumProbeShiftCssPx) {
    failures.push(
      `Maximum edge movement was ${maximumProbeShift.toFixed(2)} CSS px; expected at least ${thresholds.minimumMaximumProbeShiftCssPx}.`,
    );
  }
  if (
    visibleSourceDetailEdges.length < thresholds.minimumSourceDetailProbeCount
  ) {
    failures.push(
      `${visibleSourceDetailEdges.length} source-detail probes moved visibly; expected at least ${thresholds.minimumSourceDetailProbeCount}.`,
    );
  }
  if (
    thresholds.requireBidirectionalLensShift &&
    !(hasPositiveLensShift && hasNegativeLensShift)
  ) {
    failures.push(
      "Lens probes did not demonstrate visible displacement in both directions.",
    );
  }
  return {
    material,
    refraction,
    edgeShifts,
    pass: failures.length === 0,
    failures,
  };
}

/**
 * Consumes the renderer's stable optical-proof diagnostics. The renderer only
 * enters `refraction-presented` after its GPU displaced-versus-control samples
 * clear the canonical thresholds, so this adapter deliberately verifies the
 * completed lifecycle and that the published proof is non-empty instead of
 * duplicating private renderer thresholds in the lab.
 */
export function evaluateRuntimeOpticalProof(
  diagnostics: RuntimeOpticalDiagnostics,
): RuntimeOpticalProofInspection {
  const failures: string[] = [];
  if (
    diagnostics.lifecycle !== "refraction-presented" ||
    diagnostics.backend !== "webgl" ||
    !diagnostics.framePresented
  ) {
    failures.push(
      `Renderer did not present proven refraction: ${diagnostics.lifecycle}/${diagnostics.backend}${diagnostics.reason ? ` (${diagnostics.reason})` : ""}.`,
    );
  }
  if (!diagnostics.proofPassed) {
    failures.push(
      "Renderer did not publish a certified transmission-adjusted proof.",
    );
  }
  if (diagnostics.refractiveSurfaceCount < 1) {
    failures.push("Renderer reported zero refractive surfaces.");
  }
  if (diagnostics.sourceKind !== "image") {
    failures.push(
      `Expected the lab's owned image source, received ${diagnostics.sourceKind}.`,
    );
  }
  if (diagnostics.sampleCount < 1) {
    failures.push("Renderer published no optical proof samples.");
  }
  if (diagnostics.changedCount < 1) {
    failures.push("Renderer published no changed optical proof samples.");
  }
  if (diagnostics.meanDelta <= 0) {
    failures.push("Renderer optical proof mean CIEDE2000 delta was not positive.");
  }
  if (diagnostics.maxDelta <= 0) {
    failures.push(
      "Renderer optical proof maximum CIEDE2000 delta was not positive.",
    );
  }
  return {
    pass: failures.length === 0,
    sampleCount: diagnostics.sampleCount,
    changedCount: diagnostics.changedCount,
    changedRatio:
      diagnostics.sampleCount > 0
        ? diagnostics.changedCount / diagnostics.sampleCount
        : 0,
    meanDelta: diagnostics.meanDelta,
    maxDelta: diagnostics.maxDelta,
    failures,
  };
}

/**
 * Qualifies pixels copied from the live V4 WebGL canvas against the deterministic
 * owned source. Material is deliberately excluded: it lives in the DOM above
 * the canvas and is inspected from computed styles by the runtime lab adapter.
 */
export function evaluateRuntimeRefraction(options: {
  bare: PixelBufferLike;
  refraction: PixelBufferLike;
  mask?: Uint8Array;
  probes: readonly EdgeProbeFixture[];
  devicePixelRatio?: number;
  thresholds?: VisualAcceptanceThresholds;
}): RuntimeRefractionMeasurement {
  const thresholds =
    options.thresholds ?? DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS;
  const refraction = comparePerceptualDifference(
    options.bare,
    options.refraction,
    { mask: options.mask, jndDeltaE: thresholds.jndDeltaE },
  );
  const edgeShifts = options.probes.map((probe) =>
    measureEdgeShift(
      options.bare,
      options.refraction,
      probe,
      options.devicePixelRatio,
    ),
  );
  const strongEdges = edgeShifts.filter(
    (edge) =>
      edge.beforeEdgeContrast >= thresholds.minimumProbeEdgeContrast &&
      edge.afterEdgeContrast >= thresholds.minimumProbeEdgeContrast,
  );
  const visibleLensEdges = strongEdges.filter(
    (edge) =>
      edge.kind === "lens" &&
      Math.abs(edge.shiftCssPixels) >= thresholds.minimumLensProbeShiftCssPx,
  );
  const visibleSourceDetailEdges = strongEdges.filter(
    (edge) =>
      edge.kind === "source-detail" &&
      Math.abs(edge.shiftCssPixels) >=
        thresholds.minimumSourceDetailProbeShiftCssPx,
  );
  const maximumProbeShiftCssPx = edgeShifts.reduce(
    (maximum, edge) => Math.max(maximum, Math.abs(edge.shiftCssPixels)),
    0,
  );
  const hasPositiveLensShift = visibleLensEdges.some(
    (edge) => edge.shiftCssPixels > 0,
  );
  const hasNegativeLensShift = visibleLensEdges.some(
    (edge) => edge.shiftCssPixels < 0,
  );
  const failures: string[] = [];

  if (refraction.jndRatio < thresholds.minimumRefractionJndRatio) {
    failures.push(
      `Live refraction changed ${(refraction.jndRatio * 100).toFixed(1)}% of qualified source pixels; expected at least ${(thresholds.minimumRefractionJndRatio * 100).toFixed(1)}%.`,
    );
  }
  if (visibleLensEdges.length < thresholds.minimumLensProbeCount) {
    failures.push(
      `${visibleLensEdges.length} live lens probes moved visibly; expected at least ${thresholds.minimumLensProbeCount}.`,
    );
  }
  if (maximumProbeShiftCssPx < thresholds.minimumMaximumProbeShiftCssPx) {
    failures.push(
      `Maximum live edge movement was ${maximumProbeShiftCssPx.toFixed(2)} CSS px; expected at least ${thresholds.minimumMaximumProbeShiftCssPx}.`,
    );
  }
  if (
    visibleSourceDetailEdges.length < thresholds.minimumSourceDetailProbeCount
  ) {
    failures.push(
      `${visibleSourceDetailEdges.length} live source-detail probes moved visibly; expected at least ${thresholds.minimumSourceDetailProbeCount}.`,
    );
  }
  if (
    thresholds.requireBidirectionalLensShift &&
    !(hasPositiveLensShift && hasNegativeLensShift)
  ) {
    failures.push(
      "Live lens probes did not demonstrate visible displacement in both directions.",
    );
  }

  return {
    refraction,
    edgeShifts,
    visibleLensProbeCount: visibleLensEdges.length,
    visibleSourceDetailProbeCount: visibleSourceDetailEdges.length,
    maximumProbeShiftCssPx,
    pass: failures.length === 0,
    failures,
  };
}

export function visualMetricVector(
  measurement: TriptychMeasurement,
): VisualMetricVector {
  const lensShifts = measurement.edgeShifts
    .filter((edge) => edge.kind === "lens")
    .map((edge) => Math.abs(edge.shiftCssPixels));
  return {
    materialJndRatio: measurement.material.jndRatio,
    refractionJndRatio: measurement.refraction.jndRatio,
    maximumEdgeShiftCssPx: measurement.edgeShifts.reduce(
      (maximum, edge) => Math.max(maximum, Math.abs(edge.shiftCssPixels)),
      0,
    ),
    meanLensShiftCssPx:
      lensShifts.length === 0
        ? 0
        : lensShifts.reduce((sum, shift) => sum + shift, 0) /
          lensShifts.length,
  };
}

/**
 * Compares a result to a user-approved browser/device baseline. The default
 * 80–120% band catches both vanished optics and later over-amplification.
 */
export function compareToApprovedReference(
  currentMeasurement: TriptychMeasurement,
  approvedMeasurement: TriptychMeasurement,
  options: { minimumRatio?: number; maximumRatio?: number } = {},
): ApprovedReferenceComparison {
  const current = visualMetricVector(currentMeasurement);
  const approved = visualMetricVector(approvedMeasurement);
  const minimumRatio = options.minimumRatio ?? 0.8;
  const maximumRatio = options.maximumRatio ?? 1.2;
  const failures: string[] = [];
  const entries = Object.keys(current) as Array<keyof VisualMetricVector>;

  for (const key of entries) {
    const referenceValue = approved[key];
    const currentValue = current[key];
    if (referenceValue <= Number.EPSILON) {
      if (currentValue > Number.EPSILON) {
        failures.push(
          `${key} has no nonzero approved reference and cannot be ratio-qualified.`,
        );
      }
      continue;
    }
    const ratio = currentValue / referenceValue;
    if (ratio < minimumRatio || ratio > maximumRatio) {
      failures.push(
        `${key} is ${(ratio * 100).toFixed(1)}% of the approved reference; expected ${(minimumRatio * 100).toFixed(0)}–${(maximumRatio * 100).toFixed(0)}%.`,
      );
    }
  }

  return {
    current,
    approved,
    minimumRatio,
    maximumRatio,
    pass: failures.length === 0,
    failures,
  };
}
