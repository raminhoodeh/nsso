export type TahoeGlassBackend = "svg" | "webgl" | "css-blur" | "solid";

export type TahoeGlassStatus = "initializing" | "active" | "fallback" | "failed";

export type TahoeGlassFallback = "webgl" | "blur" | "solid";

export type TahoeGlassPreferredBackend = "auto" | "svg" | "webgl";

export interface TahoeGlassDiagnostics {
  status: TahoeGlassStatus;
  backend: TahoeGlassBackend;
  source: string;
  reason: string | null;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  surfaceCount: number;
  visibleSurfaceCount: number;
  dpr: number;
}

export interface TahoeGlassImageSource {
  kind: "image";
  src: string;
  crossOrigin?: "anonymous" | "use-credentials";
  fit?: "cover" | "contain" | "stretch";
  position?: readonly [x: number, y: number];
  label?: string;
}

export interface TahoeGlassElementSource {
  kind: "canvas" | "video";
  getElement: () => HTMLCanvasElement | HTMLVideoElement | null;
  dynamic?: boolean;
  fit?: "cover" | "contain" | "stretch";
  position?: readonly [x: number, y: number];
  label?: string;
}

/**
 * WebGL cannot sample arbitrary DOM. Safari/iOS routes therefore provide an
 * honest, same-scene image/canvas/video source or visibly fall back.
 */
export type TahoeGlassWebGLSource = TahoeGlassImageSource | TahoeGlassElementSource;

export interface TahoeGlassSurfaceSnapshot {
  id: string;
  status: TahoeGlassStatus;
  backend: TahoeGlassBackend;
  source: string;
  reason: string | null;
  visible: boolean;
  measured: boolean;
}
