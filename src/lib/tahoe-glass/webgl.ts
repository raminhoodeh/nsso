import { TAHOE_DISPLACEMENT_SCALE } from "./constants";
import type { TahoeGlassWebGLSource } from "./types";

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform sampler2D uDisplacement;
  uniform vec2 uResolution;
  uniform vec2 uSourceSize;
  uniform vec2 uPosition;
  uniform float uScale;
  uniform float uFit;

  vec2 sceneUv(vec2 viewportUv) {
    if (uFit < 0.5) return viewportUv;

    float viewportAspect = uResolution.x / max(1.0, uResolution.y);
    float sourceAspect = uSourceSize.x / max(1.0, uSourceSize.y);
    vec2 mapped = viewportUv;

    if (uFit < 1.5) {
      // object-fit: cover
      if (sourceAspect > viewportAspect) {
        float visibleWidth = viewportAspect / sourceAspect;
        mapped.x = (viewportUv.x - uPosition.x) * visibleWidth + uPosition.x;
      } else {
        float visibleHeight = sourceAspect / viewportAspect;
        mapped.y = (viewportUv.y - uPosition.y) * visibleHeight + uPosition.y;
      }
      return mapped;
    }

    // object-fit: contain. Coordinates outside the source become transparent.
    if (sourceAspect > viewportAspect) {
      float occupiedHeight = viewportAspect / sourceAspect;
      mapped.y = (viewportUv.y - uPosition.y) / occupiedHeight + uPosition.y;
    } else {
      float occupiedWidth = sourceAspect / viewportAspect;
      mapped.x = (viewportUv.x - uPosition.x) / occupiedWidth + uPosition.x;
    }
    return mapped;
  }

  void main() {
    vec4 displacement = texture2D(uDisplacement, vUv);
    vec2 sampleUv = vUv;
    if (displacement.a > 0.01) {
      vec2 bend = (displacement.rg - 0.5) * 2.0 * uScale;
      sampleUv += vec2(bend.x / uResolution.x, -bend.y / uResolution.y);
    }

    vec2 sourceUv = sceneUv(sampleUv);
    if (sourceUv.x < 0.0 || sourceUv.x > 1.0 || sourceUv.y < 0.0 || sourceUv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = texture2D(uScene, sourceUv);
  }
`;

interface Locations {
  scene: WebGLUniformLocation | null;
  displacement: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  sourceSize: WebGLUniformLocation | null;
  position: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  fit: WebGLUniformLocation | null;
}

function assertWebGLSuccess(
  gl: WebGLRenderingContext,
  stage: string,
): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    throw new Error(`${stage}-webgl-error-${error}`);
  }
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("webgl-shader-allocation-failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "webgl-shader-compile-failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createTexture(gl: WebGLRenderingContext, unit: number): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("webgl-texture-allocation-failed");
  gl.activeTexture(gl.TEXTURE0 + unit);
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
    new Uint8Array([128, 128, 128, 0]),
  );
  assertWebGLSuccess(gl, "texture-initialization");
  return texture;
}

function sourceDimensions(source: TexImageSource): readonly [number, number] {
  if (source instanceof HTMLVideoElement) {
    return [source.videoWidth || 1, source.videoHeight || 1];
  }
  if (source instanceof HTMLImageElement) {
    return [source.naturalWidth || 1, source.naturalHeight || 1];
  }
  if (source instanceof HTMLCanvasElement) {
    return [source.width || 1, source.height || 1];
  }
  return [1, 1];
}

function abortedError(): Error {
  return new Error("webgl-source-resolution-aborted");
}

async function waitForElementSource(
  getElement: () => HTMLCanvasElement | HTMLVideoElement | null,
  signal?: AbortSignal,
  timeoutMs = 10_000,
): Promise<HTMLCanvasElement | HTMLVideoElement> {
  const immediate = getElement();
  if (immediate) return immediate;
  if (signal?.aborted) throw abortedError();

  return new Promise((resolve, reject) => {
    const started = performance.now();
    const interval = window.setInterval(() => {
      if (signal?.aborted) {
        cleanup();
        reject(abortedError());
        return;
      }
      const element = getElement();
      if (element) {
        cleanup();
        resolve(element);
        return;
      }
      if (performance.now() - started >= timeoutMs) {
        cleanup();
        reject(new Error("webgl-scene-source-timeout"));
      }
    }, 50);
    const aborted = () => {
      cleanup();
      reject(abortedError());
    };
    const cleanup = () => {
      window.clearInterval(interval);
      signal?.removeEventListener("abort", aborted);
    };
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

export class TahoeWebGLRenderer {
  readonly gl: WebGLRenderingContext;
  readonly dynamic: boolean;
  readonly requiresSynchronousRefresh: boolean;
  readonly maxTextureSize: number;

  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly sceneTexture: WebGLTexture;
  private readonly displacementTexture: WebGLTexture;
  private readonly locations: Locations;
  private readonly sourceConfig: TahoeGlassWebGLSource;
  private source: TexImageSource | null = null;
  private sourceSize: readonly [number, number] = [1, 1];
  private readonly textureSizes = new Map<
    WebGLTexture,
    readonly [width: number, height: number]
  >();
  private disposed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    sourceConfig: TahoeGlassWebGLSource,
  ) {
    const context = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!context) throw new Error("webgl-context-unavailable");
    this.gl = context;
    this.maxTextureSize = context.getParameter(
      context.MAX_TEXTURE_SIZE,
    ) as number;
    this.sourceConfig = sourceConfig;
    this.dynamic =
      sourceConfig.kind === "video" ||
      (sourceConfig.kind === "canvas" && sourceConfig.dynamic !== false);
    this.requiresSynchronousRefresh =
      sourceConfig.kind === "canvas" && sourceConfig.dynamic === false;

    const vertex = compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(
      context,
      context.FRAGMENT_SHADER,
      FRAGMENT_SHADER,
    );
    const program = context.createProgram();
    if (!program) throw new Error("webgl-program-allocation-failed");
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const message =
        context.getProgramInfoLog(program) || "webgl-program-link-failed";
      context.deleteProgram(program);
      throw new Error(message);
    }
    this.program = program;

    const buffer = context.createBuffer();
    if (!buffer) throw new Error("webgl-buffer-allocation-failed");
    this.buffer = buffer;
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      context.STATIC_DRAW,
    );

    context.useProgram(program);
    const position = context.getAttribLocation(program, "aPosition");
    context.enableVertexAttribArray(position);
    context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

    this.locations = {
      scene: context.getUniformLocation(program, "uScene"),
      displacement: context.getUniformLocation(program, "uDisplacement"),
      resolution: context.getUniformLocation(program, "uResolution"),
      sourceSize: context.getUniformLocation(program, "uSourceSize"),
      position: context.getUniformLocation(program, "uPosition"),
      scale: context.getUniformLocation(program, "uScale"),
      fit: context.getUniformLocation(program, "uFit"),
    };
    this.sceneTexture = createTexture(context, 0);
    this.displacementTexture = createTexture(context, 1);
    this.textureSizes.set(this.sceneTexture, [1, 1]);
    this.textureSizes.set(this.displacementTexture, [1, 1]);
  }

  static async create(
    canvas: HTMLCanvasElement,
    sourceConfig: TahoeGlassWebGLSource,
    signal?: AbortSignal,
  ): Promise<TahoeWebGLRenderer> {
    const renderer = new TahoeWebGLRenderer(canvas, sourceConfig);
    try {
      await renderer.resolveSource(signal);
      renderer.uploadSource();
      return renderer;
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (width > this.maxTextureSize || height > this.maxTextureSize) {
      throw new Error("webgl-viewport-exceeds-max-texture-size");
    }
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    assertWebGLSuccess(this.gl, "viewport-resize");
  }

  uploadDisplacement(canvas: HTMLCanvasElement): void {
    this.bindTexture(this.displacementTexture, 1, canvas);
  }

  draw(dpr: number, refreshSource = false): void {
    if (this.disposed) return;
    if (this.sourceConfig.kind !== "image") {
      const nextSource = this.sourceConfig.getElement();
      if (nextSource) {
        this.source = nextSource;
        this.sourceSize = sourceDimensions(nextSource);
      }
    }
    if (!this.source) throw new Error("webgl-scene-source-unavailable");
    if (this.dynamic || refreshSource) this.uploadSource();

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.uniform1i(this.locations.scene, 0);
    gl.uniform1i(this.locations.displacement, 1);
    gl.uniform2f(
      this.locations.resolution,
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform2f(
      this.locations.sourceSize,
      this.sourceSize[0],
      this.sourceSize[1],
    );
    const position = this.sourceConfig.position ?? [0.5, 0.5];
    gl.uniform2f(this.locations.position, position[0], 1 - position[1]);
    gl.uniform1f(
      this.locations.scale,
      TAHOE_DISPLACEMENT_SCALE * Math.max(0.25, dpr),
    );
    const fit = this.sourceConfig.fit ??
      (this.sourceConfig.kind === "image" ? "cover" : "stretch");
    gl.uniform1f(
      this.locations.fit,
      fit === "stretch" ? 0 : fit === "cover" ? 1 : 2,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    assertWebGLSuccess(gl, "scene-draw");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.sceneTexture);
    gl.deleteTexture(this.displacementTexture);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
  }

  private async resolveSource(signal?: AbortSignal): Promise<void> {
    if (this.sourceConfig.kind !== "image") {
      const element = await waitForElementSource(
        this.sourceConfig.getElement,
        signal,
      );
      if (
        element instanceof HTMLVideoElement &&
        element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        await new Promise<void>((resolve, reject) => {
          const ready = () => {
            cleanup();
            resolve();
          };
          const failed = () => {
            cleanup();
            reject(new Error("webgl-video-source-failed"));
          };
          const cleanup = () => {
            element.removeEventListener("loadeddata", ready);
            element.removeEventListener("error", failed);
            signal?.removeEventListener("abort", aborted);
          };
          const aborted = () => {
            cleanup();
            reject(abortedError());
          };
          element.addEventListener("loadeddata", ready, { once: true });
          element.addEventListener("error", failed, { once: true });
          signal?.addEventListener("abort", aborted, { once: true });
        });
      }
      this.source = element;
      this.sourceSize = sourceDimensions(element);
      return;
    }

    const imageSource = this.sourceConfig;
    const image = new Image();
    image.crossOrigin = imageSource.crossOrigin ?? "anonymous";
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        signal?.removeEventListener("abort", aborted);
      };
      const aborted = () => {
        cleanup();
        image.src = "";
        reject(abortedError());
      };
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error("webgl-image-source-failed"));
      };
      signal?.addEventListener("abort", aborted, { once: true });
      image.src = imageSource.src;
    });
    this.source = image;
    this.sourceSize = sourceDimensions(image);
  }

  private uploadSource(): void {
    if (!this.source) throw new Error("webgl-scene-source-unavailable");
    this.bindTexture(this.sceneTexture, 0, this.source);
  }

  private bindTexture(
    texture: WebGLTexture,
    unit: number,
    source: TexImageSource,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    const nextSize = sourceDimensions(source);
    if (
      nextSize[0] > this.maxTextureSize ||
      nextSize[1] > this.maxTextureSize
    ) {
      throw new Error("webgl-source-exceeds-max-texture-size");
    }
    const currentSize = this.textureSizes.get(texture);
    if (
      currentSize &&
      currentSize[0] === nextSize[0] &&
      currentSize[1] === nextSize[1]
    ) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      this.textureSizes.set(texture, nextSize);
    }
    assertWebGLSuccess(gl, "texture-upload");
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
}
