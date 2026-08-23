export type GlassLabSceneId = "checker" | "photo" | "frozen-clouds";

export type GlassLabSurfaceId =
  | "control"
  | "menu"
  | "mobile-card"
  | "desktop-card"
  | "nav"
  | "nested";

export type GlassLabRenderMode = "bare" | "material" | "refraction";

export type GlassLabLifecycleMode =
  | "active"
  | "loading"
  | "failure"
  | "material-only";

export type GlassLabSurfaceProfile =
  | "control"
  | "edge-lens"
  | "material-only";

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelBufferLike {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface GlassLabSceneFixture {
  id: GlassLabSceneId;
  label: string;
  description: string;
  src: string;
  fit: "cover" | "contain" | "stretch";
  position: readonly [number, number];
}

export interface EdgeProbeFixture {
  id: string;
  /** Direction in which the edge position is measured. */
  axis: "x" | "y";
  /** Normalized coordinate on the axis perpendicular to the scan. */
  fixed: number;
  /** Expected normalized location of the calibration edge. */
  anchor: number;
  /** Normalized half-width searched on either side of the anchor. */
  searchRadius: number;
  /** Optional unique calibration-line color used instead of luminance edges. */
  targetRgb?: readonly [red: number, green: number, blue: number];
  kind: "lens" | "source-detail";
}

export interface GlassLabSurfaceFixture {
  id: GlassLabSurfaceId;
  label: string;
  description: string;
  width: number;
  height: number;
  radius: number;
  profile: Exclude<GlassLabSurfaceProfile, "material-only">;
  probes: readonly EdgeProbeFixture[];
}

export interface VisualAcceptanceThresholds {
  jndDeltaE: number;
  minimumMaterialJndRatio: number;
  minimumRefractionJndRatio: number;
  minimumProbeEdgeContrast: number;
  minimumLensProbeShiftCssPx: number;
  minimumLensProbeCount: number;
  minimumMaximumProbeShiftCssPx: number;
  minimumSourceDetailProbeShiftCssPx: number;
  minimumSourceDetailProbeCount: number;
  requireBidirectionalLensShift: boolean;
}

export interface PerceptualDifferenceResult {
  comparedPixels: number;
  jndPixels: number;
  jndRatio: number;
  meanDeltaE: number;
  maximumDeltaE: number;
}

export interface EdgeShiftResult {
  id: string;
  kind: EdgeProbeFixture["kind"];
  beforeBitmapPosition: number;
  afterBitmapPosition: number;
  shiftBitmapPixels: number;
  shiftCssPixels: number;
  beforeEdgeContrast: number;
  afterEdgeContrast: number;
}

export interface TriptychMeasurement {
  material: PerceptualDifferenceResult;
  refraction: PerceptualDifferenceResult;
  edgeShifts: readonly EdgeShiftResult[];
  pass: boolean;
  failures: readonly string[];
}

export interface VisualMetricVector {
  materialJndRatio: number;
  refractionJndRatio: number;
  maximumEdgeShiftCssPx: number;
  meanLensShiftCssPx: number;
}

export interface ApprovedReferenceComparison {
  current: VisualMetricVector;
  approved: VisualMetricVector;
  minimumRatio: number;
  maximumRatio: number;
  pass: boolean;
  failures: readonly string[];
}
