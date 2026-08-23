import {
  TAHOE_V4_CONTROL_DISPLACEMENT_PX,
  TAHOE_V4_DEFAULT_CLOUD_PALETTE,
  TAHOE_V4_DEFAULT_CLOUD_RENDER_SCALE,
  TAHOE_V4_DEFAULT_MAX_DPR,
  TAHOE_V4_DEFAULT_MAX_FPS,
  TAHOE_V4_DEFAULT_SOURCE_TIMEOUT_MS,
  TAHOE_V4_MAX_DISPLACEMENT_CACHE_BYTES,
  TAHOE_V4_MAX_DISPLACEMENT_CACHE_ENTRIES,
  TAHOE_V4_MAX_SURFACE_FIELD_PIXELS,
  TAHOE_V4_MAX_VIEWPORT_PIXELS,
} from "./constants";
import {
  detectTahoeV4EnvironmentCapabilities,
  inspectTahoeV4ContextCapabilities,
} from "./capabilities";
import {
  createTahoeV4CanonicalControlField,
  createTahoeV4RoundedEdgeLensField,
  calculateTahoeV4Rim,
  tahoeV4RimCssVariables,
  type TahoeV4DisplacementField,
  type TahoeV4RimCssVariables,
} from "./optics";
import {
  TAHOE_V4_CLOUD_FRAGMENT_SHADER,
  TAHOE_V4_COMPOSITE_FRAGMENT_SHADER,
  TAHOE_V4_TEXTURE_FRAGMENT_SHADER,
  TAHOE_V4_VERTEX_SHADER,
} from "./shaders";
import {
  resolveTahoeV4PixelSource,
  tahoeV4PixelSourceDimensions,
  type TahoeV4ResolvedPixelSource,
} from "./source";
import {
  EMPTY_TAHOE_V4_PROOF_METRICS,
  TAHOE_V4_PROOF_MIN_SAMPLES,
  measureTahoeV4RefractionProof,
  selectTahoeV4RefractionProofSamples,
  tahoeV4PublishedProofMetrics,
  tahoeV4RefractionProofPassed,
  type TahoeV4RefractionProofMetrics,
  type TahoeV4RefractionProofSample,
} from "./proof";
import {
  TahoeV4LifecycleStore,
  type TahoeV4LifecycleSnapshot,
} from "./state";
import type {
  TahoeV4CloudPalette,
  TahoeV4Diagnostics,
  TahoeV4FramePresentedEvent,
  TahoeV4RenderResult,
  TahoeV4RendererOptions,
  TahoeV4RenderViewport,
  TahoeV4SceneFit,
  TahoeV4ScenePosition,
  TahoeV4SceneSource,
  TahoeV4SurfaceSnapshot,
} from "./types";

interface ProgramBundle {
  program: WebGLProgram;
  position: number;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface CompositeMap {
  data: Uint8Array;
  width: number;
  height: number;
  key: string;
  refractiveSurfaceCount: number;
  nonNeutral: boolean;
  proofSamples: readonly TahoeV4RefractionProofSample[];
}

interface TextureSize {
  width: number;
  height: number;
}

const TAHOE_V4_PROOF_WINDOW_MS = 2_000;
const TAHOE_V4_PROOF_WATCHDOG_GRACE_MS = 100;
const TAHOE_V4_PROOF_ATTEMPT_INTERVAL_MS = 120;
const TAHOE_V4_PROOF_REVALIDATION_INTERVAL_MS = 500;
const TAHOE_V4_PROOF_RECOVERY_INTERVAL_MS = 1_000;

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function compileShader(
  gl: WebGLRenderingContext,
  kind: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("tahoe-v4-shader-allocation-failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "tahoe-v4-shader-compile-failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  fragmentSource: string,
  uniformNames: readonly string[],
): ProgramBundle {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, TAHOE_V4_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("tahoe-v4-program-allocation-failed");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "tahoe-v4-program-link-failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return {
    program,
    position: gl.getAttribLocation(program, "aPosition"),
    uniforms: Object.fromEntries(
      uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
    ),
  };
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("tahoe-v4-texture-allocation-failed");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );
  return texture;
}

function assertGl(gl: WebGLRenderingContext, stage: string): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`${stage}-webgl-error-${error}`);
}

function hexColor(value: number): readonly [number, number, number] {
  const safe = Math.max(0, Math.min(0xffffff, Math.round(value)));
  return [
    ((safe >> 16) & 0xff) / 255,
    ((safe >> 8) & 0xff) / 255,
    (safe & 0xff) / 255,
  ];
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function fitUniform(fit: TahoeV4SceneFit | undefined): number {
  return fit === "stretch" ? 0 : fit === "contain" ? 2 : 1;
}

function sourceLabel(source: TahoeV4SceneSource): string {
  return source.label || source.kind;
}

function fieldCacheKey(
  surface: TahoeV4SurfaceSnapshot,
  dpr: number,
): string {
  return [
    surface.profile,
    surface.rect.width.toFixed(2),
    surface.rect.height.toFixed(2),
    dpr.toFixed(3),
    surface.cornerRadiiPx.topLeft.toFixed(2),
    surface.cornerRadiiPx.topRight.toFixed(2),
    surface.cornerRadiiPx.bottomRight.toFixed(2),
    surface.cornerRadiiPx.bottomLeft.toFixed(2),
    surface.edgeBandPx?.toFixed(2) ?? "auto",
  ].join(":");
}

function mapSignature(
  surfaces: readonly TahoeV4SurfaceSnapshot[],
  width: number,
  height: number,
  dpr: number,
): string {
  return [
    `${width}x${height}@${dpr.toFixed(3)}`,
    ...surfaces.map((surface) =>
      [
        surface.id,
        surface.profile,
        surface.visible ? 1 : 0,
        surface.opacity.toFixed(3),
        surface.priority,
        surface.rect.x.toFixed(2),
        surface.rect.y.toFixed(2),
        surface.rect.width.toFixed(2),
        surface.rect.height.toFixed(2),
        surface.clipRect?.x.toFixed(2) ?? "x",
        surface.clipRect?.y.toFixed(2) ?? "x",
        surface.clipRect?.width.toFixed(2) ?? "x",
        surface.clipRect?.height.toFixed(2) ?? "x",
        surface.cornerRadiiPx.topLeft.toFixed(2),
        surface.cornerRadiiPx.topRight.toFixed(2),
        surface.cornerRadiiPx.bottomRight.toFixed(2),
        surface.cornerRadiiPx.bottomLeft.toFixed(2),
        surface.edgeBandPx?.toFixed(2) ?? "auto",
      ].join("/"),
    ),
  ].join("|");
}

function insideRoundedSurface(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: TahoeV4SurfaceSnapshot["cornerRadiiPx"],
): boolean {
  if (x < 0 || y < 0 || x > width || y > height) return false;
  const insideCorner = (
    radius: number,
    centerX: number,
    centerY: number,
  ) => {
    if (radius <= 0) return true;
    return Math.hypot(x - centerX, y - centerY) <= radius;
  };
  if (x < radii.topLeft && y < radii.topLeft) {
    return insideCorner(radii.topLeft, radii.topLeft, radii.topLeft);
  }
  if (x > width - radii.topRight && y < radii.topRight) {
    return insideCorner(
      radii.topRight,
      width - radii.topRight,
      radii.topRight,
    );
  }
  if (
    x > width - radii.bottomRight &&
    y > height - radii.bottomRight
  ) {
    return insideCorner(
      radii.bottomRight,
      width - radii.bottomRight,
      height - radii.bottomRight,
    );
  }
  if (x < radii.bottomLeft && y > height - radii.bottomLeft) {
    return insideCorner(
      radii.bottomLeft,
      radii.bottomLeft,
      height - radii.bottomLeft,
    );
  }
  return true;
}

export class TahoeV4Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;

  private readonly options: TahoeV4RendererOptions;
  private readonly lifecycle = new TahoeV4LifecycleStore();
  private readonly environment = detectTahoeV4EnvironmentCapabilities();
  private readonly contextCapabilities;
  private readonly quadBuffer: WebGLBuffer;
  private readonly cloudProgram: ProgramBundle;
  private readonly textureProgram: ProgramBundle;
  private readonly compositeProgram: ProgramBundle;
  private readonly sourceTexture: WebGLTexture;
  private readonly sceneTexture: WebGLTexture;
  private readonly displacementTexture: WebGLTexture;
  private readonly sceneFramebuffer: WebGLFramebuffer;
  private readonly fieldCache = new Map<string, TahoeV4DisplacementField>();
  private readonly rimCache = new Map<string, TahoeV4RimCssVariables>();
  private fieldCacheBytes = 0;
  private source: TahoeV4SceneSource = {
    kind: "material-only",
    label: "unconfigured",
    reason: "scene-not-configured",
  };
  private resolvedSource: TahoeV4ResolvedPixelSource | null = null;
  private sourceAbort: AbortController | null = null;
  private sourceRevision = 0;
  private sourceReady = false;
  private sourceUploaded = false;
  private lastUploadedSource: TahoeV4ResolvedPixelSource | null = null;
  private sceneTargetSize: TextureSize = { width: 0, height: 0 };
  private displacementTextureSize: TextureSize = { width: 0, height: 0 };
  private currentMap: CompositeMap | null = null;
  private uploadedMapKey = "";
  private frameRequest: number | null = null;
  private lastScheduledRenderAt = 0;
  private lastSurfaces: readonly TahoeV4SurfaceSnapshot[] | null = null;
  private lastViewport: TahoeV4RenderViewport | null = null;
  private sourceReadyAt: number | null = null;
  private proofMapKey = "";
  private provenMapKey = "";
  private proofStartedAt: number | null = null;
  private proofDeadlineAt: number | null = null;
  private proofDeadlineTimer: number | null = null;
  private proofRecoveryTimer: number | null = null;
  private proofPausedAt: number | null = null;
  private lastProofAttemptAt: number | null = null;
  private lastRecoveryRenderAt: number | null = null;
  private lastSuccessfulProofAt: number | null = null;
  private proofMetrics: TahoeV4RefractionProofMetrics = {
    ...EMPTY_TAHOE_V4_PROOF_METRICS,
  };
  private certifiedProofMetrics: TahoeV4RefractionProofMetrics | null = null;
  private hasProvenRefraction = false;
  private proofRecovering = false;
  private recoveryMapResetAvailable = false;
  private contextLost = false;
  private disposed = false;
  private sourceFrame = 0;
  private sourceStartedAt = 0;
  private presentedFrame = 0;
  private mapRevision = 0;
  private diagnostics: TahoeV4Diagnostics;

  constructor(options: TahoeV4RendererOptions) {
    this.options = options;
    this.canvas = options.canvas;
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("tahoe-v4-webgl-context-unavailable");
    this.gl = gl;
    this.contextCapabilities = inspectTahoeV4ContextCapabilities(gl);

    const quadBuffer = gl.createBuffer();
    if (!quadBuffer) throw new Error("tahoe-v4-buffer-allocation-failed");
    this.quadBuffer = quadBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.cloudProgram = createProgram(gl, TAHOE_V4_CLOUD_FRAGMENT_SHADER, [
      "uResolution",
      "uCameraInput",
      "uTime",
      "uHorizonOffset",
      "uSpeed",
      "uSkyColor",
      "uCloudColor",
      "uCloudShadowColor",
      "uSunColor",
      "uSunlightColor",
      "uSunGlareColor",
    ]);
    this.textureProgram = createProgram(gl, TAHOE_V4_TEXTURE_FRAGMENT_SHADER, [
      "uSource",
      "uResolution",
      "uSourceSize",
      "uPosition",
      "uFit",
    ]);
    this.compositeProgram = createProgram(
      gl,
      TAHOE_V4_COMPOSITE_FRAGMENT_SHADER,
      ["uScene", "uDisplacement", "uResolution", "uScale"],
    );
    this.sourceTexture = createTexture(gl);
    this.sceneTexture = createTexture(gl);
    this.displacementTexture = createTexture(gl);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("tahoe-v4-framebuffer-allocation-failed");
    this.sceneFramebuffer = framebuffer;

    this.diagnostics = {
      lifecycle: "material-ready",
      backend: "material-only",
      sourceKind: this.source.kind,
      sourceLabel: sourceLabel(this.source),
      reason: null,
      framePresented: false,
      sourceFrame: 0,
      presentedFrame: 0,
      mapRevision: 0,
      surfaceCount: 0,
      refractiveSurfaceCount: 0,
      proofPassed: false,
      sampleCount: 0,
      changedCount: 0,
      meanDelta: 0,
      maxDelta: 0,
      sampleSurfaceCount: 0,
      changedSurfaceCount: 0,
      sampleRegionCount: 0,
      changedRegionCount: 0,
      dpr: 1,
      reducedMotion: this.environment.reducedMotion,
      reducedTransparency: this.environment.reducedTransparency,
      forcedColors: this.environment.forcedColors,
      enabled: false,
      contextLost: false,
      lastFrameMs: null,
      maxTextureSize: this.contextCapabilities.maxTextureSize,
    };

    this.lifecycle.subscribe((snapshot) => {
      this.updateDiagnostics({
        lifecycle: snapshot.lifecycle,
        reason: snapshot.reason,
        backend: snapshot.lifecycle === "fallback" ? "material-only" : "webgl",
        enabled: snapshot.lifecycle !== "fallback",
      });
      this.options.onLifecycleChange?.(snapshot.lifecycle);
    });
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    document.addEventListener("visibilitychange", this.handleProofVisibilityChange);
    assertGl(gl, "tahoe-v4-initialization");
  }

  async setScene(source: TahoeV4SceneSource): Promise<void> {
    if (this.disposed) throw new Error("tahoe-v4-renderer-disposed");
    this.sourceAbort?.abort();
    const abort = new AbortController();
    this.sourceAbort = abort;
    const revision = ++this.sourceRevision;
    this.source = source;
    this.sourceStartedAt =
      typeof performance === "undefined" ? Date.now() : performance.now();
    this.resolvedSource = null;
    this.sourceReady = false;
    this.sourceUploaded = false;
    this.lastUploadedSource = null;
    this.sourceReadyAt = null;
    this.clearProofDeadline();
    this.proofMapKey = "";
    this.provenMapKey = "";
    this.proofStartedAt = null;
    this.proofDeadlineAt = null;
    this.proofPausedAt = null;
    this.lastProofAttemptAt = null;
    this.lastRecoveryRenderAt = null;
    this.lastSuccessfulProofAt = null;
    this.proofMetrics = { ...EMPTY_TAHOE_V4_PROOF_METRICS };
    this.certifiedProofMetrics = null;
    this.hasProvenRefraction = false;
    this.proofRecovering = false;
    this.recoveryMapResetAvailable = false;
    this.clearRecoveryTimer();
    this.sourceFrame = 0;
    this.presentedFrame = 0;
    this.updateDiagnostics({
      sourceKind: source.kind,
      sourceLabel: sourceLabel(source),
      framePresented: false,
      sourceFrame: 0,
      presentedFrame: 0,
      proofPassed: false,
      sampleCount: 0,
      changedCount: 0,
      meanDelta: 0,
      maxDelta: 0,
      sampleSurfaceCount: 0,
      changedSurfaceCount: 0,
      sampleRegionCount: 0,
      changedRegionCount: 0,
      enabled: source.kind !== "material-only",
      backend: source.kind === "material-only" ? "material-only" : "webgl",
    });

    if (source.kind === "material-only") {
      this.enterFallback(source.reason || "material-only-scene");
      return;
    }

    this.lifecycle.dispatch({ type: "SOURCE_LOADING" });
    try {
      const resolved = await resolveTahoeV4PixelSource(
        source,
        abort.signal,
        this.options.sourceTimeoutMs ?? TAHOE_V4_DEFAULT_SOURCE_TIMEOUT_MS,
      );
      if (abort.signal.aborted || revision !== this.sourceRevision || this.disposed) return;
      this.resolvedSource = resolved;
      this.sourceReady = true;
      this.sourceReadyAt = monotonicNow();
      this.startProofWindow(this.sourceReadyAt);
      this.lifecycle.dispatch({ type: "SOURCE_READY" });
      this.options.onSourceReady?.(source);
      this.requestFrame();
    } catch (error: unknown) {
      if (abort.signal.aborted || revision !== this.sourceRevision || this.disposed) return;
      this.enterFallback(
        error instanceof Error ? error.message : "tahoe-v4-source-resolution-failed",
      );
    }
  }

  render(
    surfaces: readonly TahoeV4SurfaceSnapshot[],
    viewport: TahoeV4RenderViewport,
  ): TahoeV4RenderResult {
    this.lastSurfaces = surfaces;
    this.lastViewport = viewport;
    const started = monotonicNow();

    if (
      this.disposed ||
      this.contextLost ||
      !this.sourceReady ||
      this.source.kind === "material-only" ||
      (typeof document !== "undefined" &&
        document.visibilityState === "hidden") ||
      viewport.width <= 0 ||
      viewport.height <= 0
    ) {
      this.updateDiagnostics({
        surfaceCount: surfaces.length,
        refractiveSurfaceCount: 0,
      });
      return {
        presented: false,
        needsNextFrame: false,
        diagnostics: this.getDiagnostics(),
      };
    }

    try {
      const frameNow = viewport.nowMs ?? started;
      const dpr = this.resolveDpr(viewport);
      const width = Math.max(1, Math.round(viewport.width * dpr));
      const height = Math.max(1, Math.round(viewport.height * dpr));
      const sceneScale = this.source.kind === "clouds"
        ? Math.max(
            0.25,
            Math.min(
              1,
              this.source.renderScale ?? TAHOE_V4_DEFAULT_CLOUD_RENDER_SCALE,
            ),
          )
        : 1;
      const sceneWidth = Math.max(1, Math.round(width * sceneScale));
      const sceneHeight = Math.max(1, Math.round(height * sceneScale));
      this.resize(width, height, sceneWidth, sceneHeight);
      const map = this.buildCompositeMap(surfaces, width, height, dpr);
      if (this.proofMapKey !== map.key) {
        this.beginMapProof(map, frameNow);
      }
      if (this.uploadedMapKey !== map.key) {
        this.uploadDisplacement(map);
        this.uploadedMapKey = map.key;
      }
      this.renderScene(sceneWidth, sceneHeight, frameNow);

      const wasAlreadyProven = this.hasProvenRefraction;
      const proofPending = this.provenMapKey !== map.key;
      const proofAttemptInterval = this.hasProvenRefraction
        ? TAHOE_V4_PROOF_REVALIDATION_INTERVAL_MS
        : this.proofRecovering
          ? TAHOE_V4_PROOF_RECOVERY_INTERVAL_MS
          : TAHOE_V4_PROOF_ATTEMPT_INTERVAL_MS;
      const proofRetryReady =
        this.lastProofAttemptAt === null ||
        frameNow - this.lastProofAttemptAt >= proofAttemptInterval;
      const mapRevalidationReady =
        !this.hasProvenRefraction ||
        this.lastSuccessfulProofAt === null ||
        frameNow - this.lastSuccessfulProofAt >=
          TAHOE_V4_PROOF_REVALIDATION_INTERVAL_MS;
      const proofDue =
        proofPending &&
        map.proofSamples.length > 0 &&
        proofRetryReady &&
        mapRevalidationReady;
      if (proofDue) {
        this.lastProofAttemptAt = frameNow;
        this.proofMetrics = this.renderAndMeasureRefractionProof(
          map.proofSamples,
          width,
          height,
          dpr,
        );
      } else {
        // Even while proof is pending, the framebuffer always ends with the
        // displaced composite. The provider keeps it hidden behind material.
        this.renderComposite(width, height, dpr);
      }
      this.sourceFrame += 1;
      this.presentedFrame += 1;

      if (
        this.provenMapKey !== map.key &&
        map.nonNeutral &&
        tahoeV4RefractionProofPassed(this.proofMetrics)
      ) {
        this.provenMapKey = map.key;
        this.hasProvenRefraction = true;
        this.proofRecovering = false;
        this.recoveryMapResetAvailable = false;
        this.lastRecoveryRenderAt = null;
        this.clearRecoveryTimer();
        this.certifiedProofMetrics = { ...this.proofMetrics };
        this.lastSuccessfulProofAt = frameNow;
        this.completeProofWindow();
        this.lifecycle.dispatch({ type: "FRAME_PRESENTED" });
        const event: TahoeV4FramePresentedEvent = {
          frame: this.presentedFrame,
          sourceFrame: this.sourceFrame,
          mapRevision: this.mapRevision,
          sourceKind: this.source.kind,
          sourceLabel: sourceLabel(this.source),
          dpr,
          surfaceCount: surfaces.length,
          refractiveSurfaceCount: map.refractiveSurfaceCount,
          proofPassed: true,
          sampleCount: this.certifiedProofMetrics.sampleCount,
          changedCount: this.certifiedProofMetrics.changedCount,
          meanDelta: this.certifiedProofMetrics.meanDelta,
          maxDelta: this.certifiedProofMetrics.maxDelta,
          sampleSurfaceCount: this.certifiedProofMetrics.sampleSurfaceCount,
          changedSurfaceCount: this.certifiedProofMetrics.changedSurfaceCount,
          sampleRegionCount: this.certifiedProofMetrics.sampleRegionCount,
          changedRegionCount: this.certifiedProofMetrics.changedRegionCount,
        };
        this.options.onFramePresented?.(event);
      } else if (proofDue && wasAlreadyProven) {
        // A low-contrast patch cannot revoke an already-proven source. Record
        // its metrics and mark this geometry revision checked without retrying
        // synchronously on every animation frame.
        this.provenMapKey = map.key;
      }

      // First proof gates the reveal. Later map revisions are revalidated in
      // the background so scrolling and transforms never blink the scene off.
      const presented = this.hasProvenRefraction;
      const publishedProof = tahoeV4PublishedProofMetrics(
        this.certifiedProofMetrics,
        this.proofMetrics,
      );
      const finished = monotonicNow();
      this.updateDiagnostics({
        framePresented: presented,
        sourceFrame: this.sourceFrame,
        presentedFrame: this.presentedFrame,
        mapRevision: this.mapRevision,
        surfaceCount: surfaces.length,
        refractiveSurfaceCount: map.refractiveSurfaceCount,
        proofPassed: this.certifiedProofMetrics !== null,
        sampleCount: publishedProof.sampleCount,
        changedCount: publishedProof.changedCount,
        meanDelta: publishedProof.meanDelta,
        maxDelta: publishedProof.maxDelta,
        sampleSurfaceCount: publishedProof.sampleSurfaceCount,
        changedSurfaceCount: publishedProof.changedSurfaceCount,
        sampleRegionCount: publishedProof.sampleRegionCount,
        changedRegionCount: publishedProof.changedRegionCount,
        dpr,
        lastFrameMs: Math.max(0, finished - started),
      });
      const proofExpired =
        !this.hasProvenRefraction &&
        this.provenMapKey !== map.key &&
        this.proofDeadlineAt !== null &&
        frameNow >= this.proofDeadlineAt;
      if (proofExpired) {
        this.enterRecoverableProof(this.proofFailureReason(map));
        return {
          presented: false,
          needsNextFrame: false,
          diagnostics: this.getDiagnostics(),
        };
      }
      const dynamicScene =
        this.source.kind === "clouds" || this.source.kind === "video";
      const continuousSurface = surfaces.some(
        (surface) => surface.visible && surface.continuous,
      );
      if (this.proofRecovering && !presented) {
        this.lastRecoveryRenderAt = frameNow;
        this.scheduleRecoveryProof();
      }
      return {
        presented,
        needsNextFrame:
          (!this.proofRecovering && this.provenMapKey !== map.key) ||
          (!this.proofRecovering &&
            !this.environment.reducedMotion &&
            (dynamicScene || continuousSurface)),
        diagnostics: this.getDiagnostics(),
      };
    } catch (error: unknown) {
      this.enterFallback(
        error instanceof Error ? error.message : "tahoe-v4-render-failed",
      );
      return {
        presented: false,
        needsNextFrame: false,
        diagnostics: this.getDiagnostics(),
      };
    }
  }

  requestFrame(
    surfaces?: readonly TahoeV4SurfaceSnapshot[],
    viewport?: TahoeV4RenderViewport,
  ): void {
    if (surfaces) this.lastSurfaces = surfaces;
    if (viewport) this.lastViewport = viewport;
    if (
      this.disposed ||
      this.frameRequest !== null ||
      (typeof document !== "undefined" &&
        document.visibilityState === "hidden") ||
      !this.lastSurfaces ||
      !this.lastViewport
    ) {
      return;
    }
    this.frameRequest = requestAnimationFrame((nowMs) => {
      this.frameRequest = null;
      if (!this.lastSurfaces || !this.lastViewport) return;
      if (document.visibilityState === "hidden") return;
      const maxFps = Math.max(
        1,
        Math.min(60, this.options.maxFps ?? TAHOE_V4_DEFAULT_MAX_FPS),
      );
      const minimumInterval = 1000 / maxFps;
      if (
        this.lastScheduledRenderAt > 0 &&
        nowMs - this.lastScheduledRenderAt < minimumInterval
      ) {
        this.requestFrame();
        return;
      }
      this.lastScheduledRenderAt = nowMs;
      const result = this.render(this.lastSurfaces, {
        ...this.lastViewport,
        nowMs,
      });
      if (result.needsNextFrame) this.requestFrame();
    });
  }

  getDiagnostics(): TahoeV4Diagnostics {
    return { ...this.diagnostics };
  }

  getLifecycleSnapshot(): TahoeV4LifecycleSnapshot {
    return this.lifecycle.getSnapshot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sourceAbort?.abort();
    this.completeProofWindow();
    this.clearRecoveryTimer();
    if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    document.removeEventListener(
      "visibilitychange",
      this.handleProofVisibilityChange,
    );
    const gl = this.gl;
    gl.deleteTexture(this.sourceTexture);
    gl.deleteTexture(this.sceneTexture);
    gl.deleteTexture(this.displacementTexture);
    gl.deleteFramebuffer(this.sceneFramebuffer);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteProgram(this.cloudProgram.program);
    gl.deleteProgram(this.textureProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
    this.fieldCache.clear();
    this.rimCache.clear();
    this.fieldCacheBytes = 0;
  }

  private resolveDpr(viewport: TahoeV4RenderViewport): number {
    const requested = Math.max(
      0.25,
      Math.min(viewport.dpr || 1, this.options.maxDpr ?? TAHOE_V4_DEFAULT_MAX_DPR),
    );
    const areaCap = Math.sqrt(
      TAHOE_V4_MAX_VIEWPORT_PIXELS /
        Math.max(1, viewport.width * viewport.height),
    );
    const dimensionCap = Math.min(
      this.contextCapabilities.maxTextureSize / Math.max(1, viewport.width),
      this.contextCapabilities.maxTextureSize / Math.max(1, viewport.height),
    );
    const dpr = Math.min(requested, areaCap, dimensionCap);
    if (dpr < 0.25) throw new Error("tahoe-v4-viewport-exceeds-texture-limits");
    return Math.max(0.25, dpr);
  }

  private resize(
    width: number,
    height: number,
    sceneWidth: number,
    sceneHeight: number,
  ): void {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    if (
      this.sceneTargetSize.width === sceneWidth &&
      this.sceneTargetSize.height === sceneHeight
    ) {
      return;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      sceneWidth,
      sceneHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.sceneTexture,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("tahoe-v4-scene-framebuffer-incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.sceneTargetSize = { width: sceneWidth, height: sceneHeight };
    this.currentMap = null;
    this.uploadedMapKey = "";
  }

  private buildCompositeMap(
    surfaces: readonly TahoeV4SurfaceSnapshot[],
    width: number,
    height: number,
    dpr: number,
  ): CompositeMap {
    // Registry snapshots are already in resolved DOM paint order. Keeping that
    // stable also guarantees nested controls overwrite their parent lens.
    const ordered = [...surfaces];
    const key = mapSignature(ordered, width, height, dpr);
    if (this.currentMap?.key === key) return this.currentMap;

    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < data.length; index += 4) {
      data[index] = 128;
      data[index + 1] = 128;
      data[index + 2] = 128;
      data[index + 3] = 0;
    }
    let refractiveSurfaceCount = 0;
    let nonNeutral = false;

    for (const surface of ordered) {
      if (
        surface.profile === "material-only" ||
        !surface.visible ||
        !surface.clipRect ||
        surface.opacity <= 0.01 ||
        surface.rect.width <= 0 ||
        surface.rect.height <= 0
      ) {
        continue;
      }
      refractiveSurfaceCount += 1;
      const fieldDpr = Math.max(
        0.25,
        Math.min(
          dpr,
          Math.sqrt(
            TAHOE_V4_MAX_SURFACE_FIELD_PIXELS /
              Math.max(1, surface.rect.width * surface.rect.height),
          ),
        ),
      );
      const field = this.getField(surface, fieldDpr);
      const viewportCssWidth = width / dpr;
      const viewportCssHeight = height / dpr;
      const centerX =
        (surface.rect.x + surface.rect.width / 2) /
        Math.max(1, viewportCssWidth);
      const centerY =
        (surface.rect.y + surface.rect.height / 2) /
        Math.max(1, viewportCssHeight);
      const rimKey = `${fieldCacheKey(surface, fieldDpr)}:${centerX.toFixed(2)}:${centerY.toFixed(2)}`;
      let rim = this.rimCache.get(rimKey);
      if (!rim) {
        rim = tahoeV4RimCssVariables(
          calculateTahoeV4Rim(field, centerX, centerY),
        );
        this.rimCache.set(rimKey, rim);
        while (this.rimCache.size > 512) {
          const oldest = this.rimCache.keys().next().value;
          if (typeof oldest !== "string") break;
          this.rimCache.delete(oldest);
        }
      }
      this.options.onSurfaceOptics?.({
        id: surface.id,
        rim,
      });
      const clip = surface.clipRect;
      const left = Math.max(0, Math.floor(clip.x * dpr));
      const top = Math.max(0, Math.floor(clip.y * dpr));
      const right = Math.min(width, Math.ceil((clip.x + clip.width) * dpr));
      const bottom = Math.min(height, Math.ceil((clip.y + clip.height) * dpr));
      const opacity = Math.max(0, Math.min(1, surface.opacity));

      for (let targetY = top; targetY < bottom; targetY += 1) {
        const cssY = (targetY + 0.5) / dpr - surface.rect.y;
        const sourceY = Math.max(
          0,
          Math.min(field.pixelHeight - 1, Math.floor(cssY * field.dpr)),
        );
        for (let targetX = left; targetX < right; targetX += 1) {
          const cssX = (targetX + 0.5) / dpr - surface.rect.x;
          if (
            !insideRoundedSurface(
              cssX,
              cssY,
              surface.rect.width,
              surface.rect.height,
              surface.cornerRadiiPx,
            )
          ) {
            continue;
          }
          const sourceX = Math.max(
            0,
            Math.min(field.pixelWidth - 1, Math.floor(cssX * field.dpr)),
          );
          const sourceIndex = (sourceY * field.pixelWidth + sourceX) * 4;
          const sourceAlpha = field.data[sourceIndex + 3];
          if (sourceAlpha === 0) continue;
          const targetIndex = (targetY * width + targetX) * 4;
          data[targetIndex] = field.data[sourceIndex];
          data[targetIndex + 1] = field.data[sourceIndex + 1];
          data[targetIndex + 2] = 128;
          data[targetIndex + 3] = Math.round(sourceAlpha * opacity);
          nonNeutral ||=
            data[targetIndex] !== 128 || data[targetIndex + 1] !== 128;
        }
      }
    }

    this.mapRevision += 1;
    const proofSamples = this.resolveProofSampleOwners(
      selectTahoeV4RefractionProofSamples(
        data,
        width,
        height,
        dpr,
        ordered,
      ),
      ordered,
      dpr,
    );
    this.currentMap = {
      data,
      width,
      height,
      key,
      refractiveSurfaceCount,
      nonNeutral,
      proofSamples,
    };
    return this.currentMap;
  }

  private resolveProofSampleOwners(
    samples: readonly TahoeV4RefractionProofSample[],
    surfaces: readonly TahoeV4SurfaceSnapshot[],
    dpr: number,
  ): readonly TahoeV4RefractionProofSample[] {
    const resolved: TahoeV4RefractionProofSample[] = [];
    for (const sample of samples) {
      const viewportX = (sample.x + 0.5) / dpr;
      const viewportY = (sample.y + 0.5) / dpr;
      let owner: TahoeV4SurfaceSnapshot | null = null;
      for (let index = surfaces.length - 1; index >= 0; index -= 1) {
        const surface = surfaces[index];
        const clip = surface.clipRect;
        if (
          surface.profile === "material-only" ||
          !surface.visible ||
          !clip ||
          surface.opacity <= 0.01 ||
          viewportX < clip.x ||
          viewportX >= clip.x + clip.width ||
          viewportY < clip.y ||
          viewportY >= clip.y + clip.height
        ) {
          continue;
        }
        const localX = viewportX - surface.rect.x;
        const localY = viewportY - surface.rect.y;
        if (
          !insideRoundedSurface(
            localX,
            localY,
            surface.rect.width,
            surface.rect.height,
            surface.cornerRadiiPx,
          )
        ) {
          continue;
        }
        const fieldDpr = Math.max(
          0.25,
          Math.min(
            dpr,
            Math.sqrt(
              TAHOE_V4_MAX_SURFACE_FIELD_PIXELS /
                Math.max(1, surface.rect.width * surface.rect.height),
            ),
          ),
        );
        const field = this.getField(surface, fieldDpr);
        const sourceX = Math.max(
          0,
          Math.min(field.pixelWidth - 1, Math.floor(localX * field.dpr)),
        );
        const sourceY = Math.max(
          0,
          Math.min(field.pixelHeight - 1, Math.floor(localY * field.dpr)),
        );
        if (field.data[(sourceY * field.pixelWidth + sourceX) * 4 + 3] === 0) {
          continue;
        }
        owner = surface;
        break;
      }
      if (!owner) continue;
      const ownerTop = owner.rect.y * dpr;
      const ownerHeight = Math.max(1, owner.rect.height * dpr);
      resolved.push({
        ...sample,
        surfaceId: owner.id,
        surfaceBand: Math.max(
          0,
          Math.min(2, Math.floor(((sample.y - ownerTop) / ownerHeight) * 3)),
        ) as 0 | 1 | 2,
      });
    }
    return resolved;
  }

  private getField(
    surface: TahoeV4SurfaceSnapshot,
    dpr: number,
  ): TahoeV4DisplacementField {
    const key = fieldCacheKey(surface, dpr);
    const cached = this.fieldCache.get(key);
    if (cached) {
      this.fieldCache.delete(key);
      this.fieldCache.set(key, cached);
      return cached;
    }
    const field = surface.profile === "control"
      ? createTahoeV4CanonicalControlField({
          width: surface.rect.width,
          height: surface.rect.height,
          dpr,
          alphaOutside: 0,
        })
      : createTahoeV4RoundedEdgeLensField({
          width: surface.rect.width,
          height: surface.rect.height,
          dpr,
          cornerRadiiPx: surface.cornerRadiiPx,
          edgeBandPx: surface.edgeBandPx,
          alphaOutside: 0,
        });
    this.fieldCache.set(key, field);
    this.fieldCacheBytes += field.data.byteLength;
    while (
      this.fieldCache.size > TAHOE_V4_MAX_DISPLACEMENT_CACHE_ENTRIES ||
      this.fieldCacheBytes > TAHOE_V4_MAX_DISPLACEMENT_CACHE_BYTES
    ) {
      const oldestKey = this.fieldCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const removed = this.fieldCache.get(oldestKey);
      this.fieldCache.delete(oldestKey);
      this.fieldCacheBytes -= removed?.data.byteLength ?? 0;
    }
    return field;
  }

  private uploadDisplacement(map: CompositeMap): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.displacementTexture);
    // ArrayBuffer uploads are kept in deterministic top-to-bottom CPU order.
    // The shader performs the explicit Y conversion, so this never relies on
    // browser-specific handling of UNPACK_FLIP_Y_WEBGL for typed arrays.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    // Pixel sources use premultiplied uploads; the RG displacement bytes must
    // never inherit that state or partially transparent/fading lenses skew.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    if (
      this.displacementTextureSize.width === map.width &&
      this.displacementTextureSize.height === map.height
    ) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        map.width,
        map.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        map.data,
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        map.width,
        map.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        map.data,
      );
      this.displacementTextureSize = { width: map.width, height: map.height };
    }
    assertGl(gl, "tahoe-v4-displacement-upload");
  }

  private renderScene(width: number, height: number, nowMs: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.source.kind === "clouds") {
      const palette: TahoeV4CloudPalette = {
        ...TAHOE_V4_DEFAULT_CLOUD_PALETTE,
        ...this.source.palette,
      };
      const camera: TahoeV4ScenePosition = this.source.cameraInput ?? [0, 0];
      this.useProgram(this.cloudProgram);
      gl.uniform2f(this.cloudProgram.uniforms.uResolution, width, height);
      gl.uniform2f(
        this.cloudProgram.uniforms.uCameraInput,
        clampUnit(camera[0]),
        clampUnit(camera[1]),
      );
      const speed = this.source.speed ?? 0.5;
      const elapsedMs = Math.max(
        0,
        nowMs >= this.sourceStartedAt ? nowMs - this.sourceStartedAt : nowMs,
      );
      // Vanta advances iTime by `speed` in its base loop and also supplies
      // `speed` to the CLOUDS shader. Preserve that pinned double application.
      gl.uniform1f(
        this.cloudProgram.uniforms.uTime,
        (elapsedMs / 1000) * speed,
      );
      gl.uniform1f(
        this.cloudProgram.uniforms.uHorizonOffset,
        this.source.horizonOffset ?? 0.6,
      );
      gl.uniform1f(this.cloudProgram.uniforms.uSpeed, speed);
      this.uniformColor(this.cloudProgram.uniforms.uSkyColor, palette.sky);
      this.uniformColor(this.cloudProgram.uniforms.uCloudColor, palette.cloud);
      this.uniformColor(
        this.cloudProgram.uniforms.uCloudShadowColor,
        palette.shadow,
      );
      this.uniformColor(this.cloudProgram.uniforms.uSunColor, palette.sun);
      this.uniformColor(
        this.cloudProgram.uniforms.uSunlightColor,
        palette.sunlight,
      );
      this.uniformColor(
        this.cloudProgram.uniforms.uSunGlareColor,
        palette.glare,
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (this.source.kind === "image" || this.source.kind === "video") {
      if (!this.resolvedSource) throw new Error("tahoe-v4-pixel-source-unavailable");
      if (this.source.kind === "video") {
        const latest = this.source.getElement();
        if (
          latest &&
          latest.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          latest.videoWidth > 0
        ) {
          this.resolvedSource = latest;
        }
      } else if (this.source.getElement) {
        this.resolvedSource = this.source.getElement() ?? this.resolvedSource;
      }
      const pixelSource = this.resolvedSource;
      if (!pixelSource) throw new Error("tahoe-v4-pixel-source-unavailable");
      this.uploadPixelSource(pixelSource, this.source.kind === "video");
      const [sourceWidth, sourceHeight] = tahoeV4PixelSourceDimensions(pixelSource);
      const position = this.source.position ?? [0.5, 0.5];
      this.useProgram(this.textureProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.uniform1i(this.textureProgram.uniforms.uSource, 0);
      gl.uniform2f(this.textureProgram.uniforms.uResolution, width, height);
      gl.uniform2f(
        this.textureProgram.uniforms.uSourceSize,
        sourceWidth,
        sourceHeight,
      );
      gl.uniform2f(
        this.textureProgram.uniforms.uPosition,
        clampUnit(position[0]),
        1 - clampUnit(position[1]),
      );
      gl.uniform1f(this.textureProgram.uniforms.uFit, fitUniform(this.source.fit));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      throw new Error("tahoe-v4-material-only-scene-cannot-render");
    }
    assertGl(gl, "tahoe-v4-scene-render");
  }

  private renderComposite(
    width: number,
    height: number,
    dpr: number,
    scale = TAHOE_V4_CONTROL_DISPLACEMENT_PX * dpr,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.displacementTexture);
    gl.uniform1i(this.compositeProgram.uniforms.uScene, 1);
    gl.uniform1i(this.compositeProgram.uniforms.uDisplacement, 2);
    gl.uniform2f(this.compositeProgram.uniforms.uResolution, width, height);
    gl.uniform1f(this.compositeProgram.uniforms.uScale, scale);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    assertGl(gl, "tahoe-v4-composite-render");
    gl.flush();
  }

  private uploadPixelSource(
    source: TahoeV4ResolvedPixelSource,
    force: boolean,
  ): void {
    if (!force && this.sourceUploaded && this.lastUploadedSource === source) return;
    const [width, height] = tahoeV4PixelSourceDimensions(source);
    if (
      width > this.contextCapabilities.maxTextureSize ||
      height > this.contextCapabilities.maxTextureSize
    ) {
      throw new Error("tahoe-v4-source-exceeds-texture-limits");
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );
    assertGl(gl, "tahoe-v4-source-upload");
    this.sourceUploaded = true;
    this.lastUploadedSource = source;
  }

  private useProgram(bundle: ProgramBundle): void {
    const gl = this.gl;
    gl.useProgram(bundle.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(bundle.position);
    gl.vertexAttribPointer(bundle.position, 2, gl.FLOAT, false, 0, 0);
  }

  private uniformColor(
    location: WebGLUniformLocation | null,
    value: number,
  ): void {
    const [red, green, blue] = hexColor(value);
    this.gl.uniform3f(location, red, green, blue);
  }

  private readProofRgb(
    samples: readonly TahoeV4RefractionProofSample[],
    height: number,
  ): Uint8Array {
    const gl = this.gl;
    const pixel = new Uint8Array(4);
    const rgb = new Uint8Array(samples.length * 3);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const readY = Math.max(0, Math.min(height - 1, height - 1 - sample.y));
      gl.readPixels(sample.x, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const target = index * 3;
      rgb[target] = pixel[0];
      rgb[target + 1] = pixel[1];
      rgb[target + 2] = pixel[2];
    }
    assertGl(gl, "tahoe-v4-refraction-proof-readback");
    return rgb;
  }

  private renderAndMeasureRefractionProof(
    samples: readonly TahoeV4RefractionProofSample[],
    width: number,
    height: number,
    dpr: number,
  ): TahoeV4RefractionProofMetrics {
    let control: Uint8Array;
    try {
      this.renderComposite(width, height, dpr, 0);
      this.gl.finish();
      control = this.readProofRgb(samples, height);
    } finally {
      // A control render is never allowed to become the displayed output.
      this.renderComposite(width, height, dpr);
    }
    this.gl.finish();
    const displaced = this.readProofRgb(samples, height);
    return measureTahoeV4RefractionProof(control, displaced, samples);
  }

  private beginMapProof(map: CompositeMap, now: number): void {
    const continuingPendingWindow = this.proofStartedAt !== null;
    if (
      !this.hasProvenRefraction &&
      !this.proofRecovering &&
      this.proofStartedAt === null
    ) {
      this.startProofWindow(
        this.sourceReadyAt ?? now,
      );
    } else if (this.hasProvenRefraction) {
      // Revalidation is observational after first proof; no async deadline may
      // demote a renderer that already established pixel truth.
      this.clearProofDeadline();
      this.proofStartedAt = null;
      this.proofDeadlineAt = null;
      this.proofPausedAt = null;
    }
    this.proofMapKey = map.key;
    if (
      !continuingPendingWindow &&
      !this.hasProvenRefraction &&
      (!this.proofRecovering || this.recoveryMapResetAvailable)
    ) {
      this.lastProofAttemptAt = null;
      if (this.proofRecovering) this.recoveryMapResetAvailable = false;
    }
    this.proofMetrics = {
      ...EMPTY_TAHOE_V4_PROOF_METRICS,
      sampleCount: map.proofSamples.length,
    };
    if (!this.certifiedProofMetrics) {
      this.updateDiagnostics({
        framePresented: false,
        proofPassed: false,
        mapRevision: this.mapRevision,
        sampleCount: this.proofMetrics.sampleCount,
        changedCount: 0,
        meanDelta: 0,
        maxDelta: 0,
        sampleSurfaceCount: 0,
        changedSurfaceCount: 0,
        sampleRegionCount: 0,
        changedRegionCount: 0,
      });
    } else {
      this.updateDiagnostics({ mapRevision: this.mapRevision });
    }
    if (
      this.hasProvenRefraction &&
      map.proofSamples.length < TAHOE_V4_PROOF_MIN_SAMPLES
    ) {
      this.provenMapKey = map.key;
    }
  }

  private startProofWindow(startedAt: number): void {
    if (this.proofStartedAt !== null || this.disposed) return;
    this.proofStartedAt = startedAt;
    this.proofDeadlineAt = startedAt + TAHOE_V4_PROOF_WINDOW_MS;
    if (document.visibilityState === "hidden") {
      this.proofPausedAt = monotonicNow();
      return;
    }
    this.scheduleProofDeadline();
  }

  private scheduleProofDeadline(): void {
    this.clearProofDeadline();
    if (this.proofDeadlineAt === null || this.proofPausedAt !== null) return;
    const remaining = Math.max(
      0,
      this.proofDeadlineAt - monotonicNow() +
        TAHOE_V4_PROOF_WATCHDOG_GRACE_MS,
    );
    this.proofDeadlineTimer = window.setTimeout(() => {
      this.proofDeadlineTimer = null;
      if (
        this.disposed ||
        !this.sourceReady ||
        this.proofStartedAt === null ||
        this.hasProvenRefraction
      ) {
        return;
      }
      this.enterRecoverableProof(this.proofFailureReason(this.currentMap));
    }, remaining);
  }

  private enterRecoverableProof(reason: string): void {
    if (this.disposed || !this.sourceReady || this.hasProvenRefraction) return;
    const lastAttemptAt = this.lastProofAttemptAt;
    this.completeProofWindow();
    this.lastProofAttemptAt = lastAttemptAt;
    this.proofRecovering = true;
    this.recoveryMapResetAvailable = true;
    this.lastRecoveryRenderAt = monotonicNow();
    this.lifecycle.dispatch({ type: "PROOF_RECOVERING", reason });
    this.updateDiagnostics({
      lifecycle: "source-ready",
      backend: "webgl",
      enabled: true,
      reason,
      framePresented: false,
      proofPassed: false,
    });
    this.scheduleRecoveryProof();
  }

  private scheduleRecoveryProof(): void {
    this.clearRecoveryTimer();
    if (
      this.disposed ||
      !this.proofRecovering ||
      !this.sourceReady ||
      this.hasProvenRefraction ||
      document.visibilityState === "hidden"
    ) {
      return;
    }
    const now = monotonicNow();
    const remaining = Math.max(
      0,
      this.lastRecoveryRenderAt === null
        ? 0
        : TAHOE_V4_PROOF_RECOVERY_INTERVAL_MS -
            (now - this.lastRecoveryRenderAt),
    );
    this.proofRecoveryTimer = window.setTimeout(() => {
      this.proofRecoveryTimer = null;
      if (!this.proofRecovering || this.disposed || !this.sourceReady) return;
      this.requestFrame();
    }, remaining);
  }

  private clearRecoveryTimer(): void {
    if (this.proofRecoveryTimer !== null) {
      window.clearTimeout(this.proofRecoveryTimer);
      this.proofRecoveryTimer = null;
    }
  }

  private completeProofWindow(): void {
    this.clearProofDeadline();
    this.proofStartedAt = null;
    this.proofDeadlineAt = null;
    this.proofPausedAt = null;
    this.lastProofAttemptAt = null;
  }

  private clearProofDeadline(): void {
    if (this.proofDeadlineTimer !== null) {
      window.clearTimeout(this.proofDeadlineTimer);
      this.proofDeadlineTimer = null;
    }
  }

  private proofFailureReason(map: CompositeMap | null): string {
    if (
      !map ||
      !map.nonNeutral ||
      map.refractiveSurfaceCount === 0 ||
      map.proofSamples.length < TAHOE_V4_PROOF_MIN_SAMPLES
    ) {
      return "refraction-no-presentable-surfaces";
    }
    return "refraction-subthreshold";
  }

  private readonly handleProofVisibilityChange = (): void => {
    if (this.proofRecovering) {
      if (document.visibilityState === "hidden") {
        this.clearRecoveryTimer();
      } else {
        this.lastProofAttemptAt = null;
        this.lastRecoveryRenderAt = null;
        this.scheduleRecoveryProof();
      }
      return;
    }
    if (this.hasProvenRefraction || this.proofStartedAt === null) return;
    const now = monotonicNow();
    if (document.visibilityState === "hidden") {
      if (this.proofPausedAt === null) this.proofPausedAt = now;
      this.clearProofDeadline();
      return;
    }
    if (this.proofPausedAt !== null) {
      const hiddenDuration = Math.max(0, now - this.proofPausedAt);
      this.proofStartedAt += hiddenDuration;
      if (this.proofDeadlineAt !== null) {
        this.proofDeadlineAt += hiddenDuration;
      }
      this.proofPausedAt = null;
    }
    this.scheduleProofDeadline();
  };

  private enterFallback(reason: string): void {
    if (this.disposed) return;
    const alreadyReported =
      this.lifecycle.getSnapshot().lifecycle === "fallback" &&
      this.lifecycle.getSnapshot().reason === reason;
    this.completeProofWindow();
    this.clearRecoveryTimer();
    this.proofRecovering = false;
    this.recoveryMapResetAvailable = false;
    this.lastRecoveryRenderAt = null;
    this.certifiedProofMetrics = null;
    this.proofMetrics = { ...EMPTY_TAHOE_V4_PROOF_METRICS };
    this.sourceReady = false;
    this.lifecycle.dispatch({ type: "FALLBACK", reason });
    this.updateDiagnostics({
      backend: "material-only",
      enabled: false,
      reason,
      framePresented: false,
      proofPassed: false,
      sampleCount: 0,
      changedCount: 0,
      meanDelta: 0,
      maxDelta: 0,
      sampleSurfaceCount: 0,
      changedSurfaceCount: 0,
      sampleRegionCount: 0,
      changedRegionCount: 0,
    });
    if (!alreadyReported) {
      this.options.onFallback?.({
        reason,
        sourceKind: this.source.kind,
        sourceLabel: sourceLabel(this.source),
      });
    }
  }

  private updateDiagnostics(
    patch: Partial<TahoeV4Diagnostics>,
  ): void {
    this.diagnostics = { ...this.diagnostics, ...patch };
    this.options.onDiagnostics?.({ ...this.diagnostics });
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.updateDiagnostics({ contextLost: true });
    this.enterFallback("tahoe-v4-webgl-context-lost");
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.updateDiagnostics({ contextLost: false });
    this.enterFallback("tahoe-v4-webgl-context-restored-reinitialize");
  };
}
