import {
  TAHOE_CURVE_POWER,
  TAHOE_LIGHT_SOURCE,
  TAHOE_RIM_BINS,
  TAHOE_SUPERELLIPSE_POWER,
} from "./constants";

export interface TahoeDisplacementField {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  data: Uint8ClampedArray;
  canvas: HTMLCanvasElement;
}

/**
 * `control` is the supplied button map verbatim. `surface` preserves the same
 * superellipse, curve and displacement constants, but measures distance as a
 * superellipse radius so the optical profile remains legible on large cards.
 */
export type TahoeDisplacementProfile = "control" | "surface";

export interface TahoeRefractionAnalysis {
  profile: number[];
  domAngle: number;
  magnitude: number;
}

export interface TahoeRimVariables {
  cos: number;
  sin: number;
  lightAngleDeg: number;
  magnitude: number;
  gradient: string;
}

/**
 * Generates the supplied power-3.5 superellipse and
 * sin(pow(d, .8) * PI) convex deformation without approximation.
 */
export function createTahoeDisplacementField(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  alphaOutside: 0 | 255,
  profile: TahoeDisplacementProfile = "control",
): TahoeDisplacementField | null {
  if (typeof document === "undefined") return null;

  const safeDpr = Math.max(0.25, Number.isFinite(dpr) ? dpr : 1);
  const pixelWidth = Math.max(1, Math.round(cssWidth * safeDpr) || 0);
  const pixelHeight = Math.max(1, Math.round(cssHeight * safeDpr) || 0);
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const image = context.createImageData(pixelWidth, pixelHeight);
  const { data } = image;

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const nx = (x / pixelWidth) * 2 - 1;
      const ny = (y / pixelHeight) * 2 - 1;
      const superellipse =
        Math.pow(Math.abs(nx), TAHOE_SUPERELLIPSE_POWER) +
        Math.pow(Math.abs(ny), TAHOE_SUPERELLIPSE_POWER);
      const distance = profile === "surface"
        ? Math.pow(superellipse, 1 / TAHOE_SUPERELLIPSE_POWER)
        : superellipse;

      let red = 128;
      let green = 128;
      let alpha: number = alphaOutside;

      if (superellipse <= 1) {
        const curveMagnitude = Math.sin(
          Math.pow(distance, TAHOE_CURVE_POWER) * Math.PI,
        );
        red = Math.round(128 + -nx * curveMagnitude * 127);
        green = Math.round(128 + -ny * curveMagnitude * 127);
        alpha = 255;
      }

      const index = (y * pixelWidth + x) * 4;
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = 128;
      data[index + 3] = alpha;
    }
  }

  context.putImageData(image, 0, 0);
  return {
    cssWidth,
    cssHeight,
    pixelWidth,
    pixelHeight,
    dpr: safeDpr,
    data,
    canvas,
  };
}

/** The supplied 24-bin deformation analysis, applied per surface. */
export function analyzeTahoeRefraction(
  field: TahoeDisplacementField,
  lightAzimuth: number,
): TahoeRefractionAnalysis {
  const profile = new Array<number>(TAHOE_RIM_BINS).fill(0);
  const counts = new Array<number>(TAHOE_RIM_BINS).fill(0);
  let sumX = 0;
  let sumY = 0;
  let sumMagnitude = 0;

  // Two CSS pixels matches the supplied step=2 at DPR 1.
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
          ((angle + Math.PI) / (2 * Math.PI)) * TAHOE_RIM_BINS,
        ) % TAHOE_RIM_BINS;
      if (bin < 0) bin += TAHOE_RIM_BINS;
      profile[bin] += brightness;
      counts[bin] += 1;
    }
  }

  let maxProfile = 0;
  for (let bin = 0; bin < TAHOE_RIM_BINS; bin += 1) {
    if (counts[bin]) profile[bin] /= counts[bin];
    if (profile[bin] > maxProfile) maxProfile = profile[bin];
  }
  if (maxProfile > 0) {
    for (let bin = 0; bin < TAHOE_RIM_BINS; bin += 1) {
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

export function buildTahoeConicGradient(
  profile: readonly number[],
  fromDeg: number,
): string {
  const stops: string[] = [];
  for (let bin = 0; bin <= TAHOE_RIM_BINS; bin += 1) {
    const value = profile[bin % TAHOE_RIM_BINS] ?? 0;
    const degrees = (bin / TAHOE_RIM_BINS) * 360;
    const opacity = (0.07 + value * 0.63).toFixed(3);
    stops.push(
      `rgba(255,255,255,${opacity}) ${degrees.toFixed(1)}deg`,
    );
  }
  return `conic-gradient(from ${fromDeg.toFixed(1)}deg at 50% 50%, ${stops.join(", ")})`;
}

export function calculateTahoeRim(
  field: TahoeDisplacementField,
  centerX: number,
  centerY: number,
): TahoeRimVariables {
  const lightAzimuth = Math.atan2(
    TAHOE_LIGHT_SOURCE.y - centerY,
    TAHOE_LIGHT_SOURCE.x - centerX,
  );
  const analysis = analyzeTahoeRefraction(field, lightAzimuth);
  const intensity = 0.4 + analysis.magnitude * 0.6;
  const cos = -Math.cos(analysis.domAngle) * intensity;
  const sin = -Math.sin(analysis.domAngle) * intensity;
  const lightAngleDeg = (analysis.domAngle * 180) / Math.PI + 90;
  return {
    cos,
    sin,
    lightAngleDeg,
    magnitude: analysis.magnitude,
    gradient: buildTahoeConicGradient(analysis.profile, lightAngleDeg),
  };
}

export function applyTahoeRimVariables(
  element: HTMLElement,
  rim: TahoeRimVariables,
): void {
  element.style.setProperty("--cos", rim.cos.toString());
  element.style.setProperty("--sin", rim.sin.toString());
  element.style.setProperty("--light-angle", `${rim.lightAngleDeg}deg`);
  element.style.setProperty("--rim-intensity", rim.magnitude.toString());
  element.style.setProperty("--rim-gradient", rim.gradient);
}
