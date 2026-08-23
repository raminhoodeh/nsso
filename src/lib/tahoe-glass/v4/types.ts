import type { TahoeV4Lifecycle } from "./state";
import type { TahoeV4RimCssVariables } from "./optics";

export type TahoeV4Profile = "control" | "edge-lens" | "material-only";
export type TahoeV4Backend = "webgl" | "material-only";
export type TahoeV4SceneFit = "cover" | "contain" | "stretch";
export type TahoeV4ScenePosition = readonly [x: number, y: number];

export interface TahoeV4CloudPalette {
  sky: number;
  cloud: number;
  shadow: number;
  sun: number;
  glare: number;
  sunlight: number;
}

export interface TahoeV4CloudSceneSource {
  kind: "clouds";
  label?: string;
  palette?: Partial<TahoeV4CloudPalette>;
  /** Positive values move the cloud bank lower in the viewport. */
  horizonOffset?: number;
  speed?: number;
  /** Matches NSSO's approved 75%-resolution Vanta presentation by default. */
  renderScale?: number;
  /** Deterministic replacement for Vanta's disabled mouse controls. */
  cameraInput?: TahoeV4ScenePosition;
}

export interface TahoeV4ImageSceneSource {
  kind: "image";
  label?: string;
  /** Prefer a same-origin or explicitly CORS-enabled URL. */
  src?: string;
  /** Alternative for an already decoded image owned by the caller. */
  getElement?: () => HTMLImageElement | null;
  crossOrigin?: "anonymous" | "use-credentials";
  fit?: TahoeV4SceneFit;
  position?: TahoeV4ScenePosition;
}

export interface TahoeV4VideoSceneSource {
  kind: "video";
  label?: string;
  /** The element must contain a current, CORS-safe frame. */
  getElement: () => HTMLVideoElement | null;
  fit?: TahoeV4SceneFit;
  position?: TahoeV4ScenePosition;
}

export interface TahoeV4MaterialOnlySceneSource {
  kind: "material-only";
  label?: string;
  reason?: string;
}

/**
 * A single source owns the refractable pixels. V4 intentionally has no
 * arbitrary-DOM or foreign-canvas source: those paths cannot be sampled
 * reliably and were the source of the previous cross-context failures.
 */
export type TahoeV4SceneSource =
  | TahoeV4CloudSceneSource
  | TahoeV4ImageSceneSource
  | TahoeV4VideoSceneSource
  | TahoeV4MaterialOnlySceneSource;

export interface TahoeV4Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TahoeV4CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface TahoeV4SurfaceOptions {
  id: string;
  element: HTMLElement;
  profile: TahoeV4Profile;
  cornerRadiiPx: TahoeV4CornerRadii;
  priority?: number;
  continuous?: boolean;
  /** Optional explicit edge-band override for approved visual fixtures. */
  edgeBandPx?: number;
}

export interface TahoeV4SurfaceSnapshot {
  id: string;
  profile: TahoeV4Profile;
  /** Coordinates are CSS pixels relative to the renderer viewport. */
  rect: TahoeV4Rect;
  /** Ancestor/viewport clipping in the same coordinate system. */
  clipRect: TahoeV4Rect | null;
  cornerRadiiPx: TahoeV4CornerRadii;
  priority: number;
  continuous: boolean;
  visible: boolean;
  opacity: number;
  edgeBandPx?: number;
}

export interface TahoeV4RenderViewport {
  width: number;
  height: number;
  dpr: number;
  /** Deterministic tests may provide a clock value. */
  nowMs?: number;
}

export interface TahoeV4FramePresentedEvent {
  frame: number;
  sourceFrame: number;
  mapRevision: number;
  sourceKind: TahoeV4SceneSource["kind"];
  sourceLabel: string;
  dpr: number;
  surfaceCount: number;
  refractiveSurfaceCount: number;
  proofPassed: boolean;
  sampleCount: number;
  changedCount: number;
  meanDelta: number;
  maxDelta: number;
  sampleSurfaceCount: number;
  changedSurfaceCount: number;
  sampleRegionCount: number;
  changedRegionCount: number;
}

export interface TahoeV4FallbackEvent {
  reason: string;
  sourceKind: TahoeV4SceneSource["kind"];
  sourceLabel: string;
}

export interface TahoeV4SurfaceOpticsEvent {
  id: string;
  rim: TahoeV4RimCssVariables;
}

export interface TahoeV4Diagnostics {
  lifecycle: TahoeV4Lifecycle;
  backend: TahoeV4Backend;
  sourceKind: TahoeV4SceneSource["kind"];
  sourceLabel: string;
  reason: string | null;
  framePresented: boolean;
  sourceFrame: number;
  presentedFrame: number;
  mapRevision: number;
  surfaceCount: number;
  refractiveSurfaceCount: number;
  /** True only after a certified, distributed transmission-adjusted proof. */
  proofPassed: boolean;
  /** High-bend probes in the immutable last certified proof, once available. */
  sampleCount: number;
  /** Probes whose white-layer-and-tint-adjusted delta cleared one JND. */
  changedCount: number;
  /** Mean white-layer-and-tint-adjusted CIEDE2000 delta across probes. */
  meanDelta: number;
  /** Largest white-layer-and-tint-adjusted delta in the certified proof. */
  maxDelta: number;
  sampleSurfaceCount: number;
  changedSurfaceCount: number;
  sampleRegionCount: number;
  changedRegionCount: number;
  dpr: number;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  forcedColors: boolean;
  enabled: boolean;
  contextLost: boolean;
  lastFrameMs: number | null;
  maxTextureSize: number | null;
}

export interface TahoeV4RenderResult {
  presented: boolean;
  needsNextFrame: boolean;
  diagnostics: TahoeV4Diagnostics;
}

export interface TahoeV4RendererOptions {
  canvas: HTMLCanvasElement;
  maxDpr?: number;
  /** Continuous clouds/video rendering is capped to 30 by default. */
  maxFps?: number;
  sourceTimeoutMs?: number;
  onSourceReady?: (source: TahoeV4SceneSource) => void;
  /**
   * Called after a new displacement-map revision has synchronously cleared the
   * distributed white-layer-and-tint-adjusted CIEDE2000 prediction against its
   * zero-displacement control. Physical-device A/B still owns final approval.
   */
  onFramePresented?: (event: TahoeV4FramePresentedEvent) => void;
  onFallback?: (event: TahoeV4FallbackEvent) => void;
  onDiagnostics?: (diagnostics: TahoeV4Diagnostics) => void;
  onLifecycleChange?: (lifecycle: TahoeV4Lifecycle) => void;
  /** Emitted only when a surface field is rebuilt, never every animation frame. */
  onSurfaceOptics?: (event: TahoeV4SurfaceOpticsEvent) => void;
}
