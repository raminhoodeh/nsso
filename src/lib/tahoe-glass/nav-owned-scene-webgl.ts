import { TAHOE_DISPLACEMENT_SCALE } from "./constants";
import type { TahoeDisplacementField } from "./optics";

/**
 * A viewport expressed in the same CSS-pixel coordinate space as
 * `Element.getBoundingClientRect()`.
 *
 * `left` and `top` let callers account for a shifted VisualViewport without
 * coupling this renderer to any browser- or UA-specific routing.
 */
export interface TahoeNavSceneViewport {
  width: number;
  height: number;
  left?: number;
  top?: number;
}

export interface TahoeNavSceneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TahoeNavOwnedSceneUpdate {
  /**
   * The owned scene only. This must never be an attempted DOM/backdrop
   * capture. Vanta's canvas is the intended source.
   */
  scene?: HTMLCanvasElement;
  displacement: TahoeDisplacementField;
  viewport: TahoeNavSceneViewport;
  headerRect: TahoeNavSceneRect;
  displacementScale?: number;
  /** Maximum opacity of the refracted scene band. */
  maxOpacity?: number;
  /** Small displacement-derived optical lift for low-frequency sky regions. */
  causticStrength?: number;
}

export interface TahoeNavResolvedSceneRegion {
  viewportWidth: number;
  viewportHeight: number;
  /** Bottom-left origin, matching WebGL texture coordinates. */
  regionLeft: number;
  regionBottom: number;
  regionWidth: number;
  regionHeight: number;
}

interface UniformLocations {
  scene: WebGLUniformLocation;
  displacement: WebGLUniformLocation;
  viewportResolution: WebGLUniformLocation;
  regionOrigin: WebGLUniformLocation;
  regionSize: WebGLUniformLocation;
  displacementScale: WebGLUniformLocation;
  maxOpacity: WebGLUniformLocation;
  causticStrength: WebGLUniformLocation;
}

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision __TAHOE_FRAGMENT_PRECISION__ float;

  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform sampler2D uDisplacement;
  uniform vec2 uViewportResolution;
  uniform vec2 uRegionOrigin;
  uniform vec2 uRegionSize;
  uniform float uDisplacementScale;
  uniform float uMaxOpacity;
  uniform float uCausticStrength;

  void main() {
    vec4 displacement = texture2D(uDisplacement, vUv);
    const float neutral = 128.0 / 255.0;
    vec2 normalizedBend = (displacement.rg - vec2(neutral)) * 2.0;
    float bendMagnitude = length(normalizedBend);

    // The overlay exists only where the supplied lens actually bends light.
    // A neutral map therefore remains transparent instead of becoming an
    // opaque copy of the sky over scrolling content.
    float bendMask = smoothstep(0.025, 0.38, bendMagnitude);
    float opticalAlpha = displacement.a * bendMask * uMaxOpacity;
    if (opticalAlpha <= 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec2 viewportPixel = uRegionOrigin + vUv * uRegionSize;
    vec2 viewportUv = viewportPixel / uViewportResolution;
    // Preserve the supplied WebGL fallback contract exactly. Its shader
    // decodes the 0..1 map to -1..1 before applying the scale of 35.
    vec2 bendPixels = normalizedBend * uDisplacementScale;
    vec2 sourceUv = viewportUv + vec2(
      bendPixels.x / uViewportResolution.x,
      -bendPixels.y / uViewportResolution.y
    );

    if (
      sourceUv.x < 0.0 || sourceUv.x > 1.0 ||
      sourceUv.y < 0.0 || sourceUv.y > 1.0
    ) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec4 scene = texture2D(uScene, sourceUv);
    opticalAlpha *= scene.a;
    float caustic = 1.0 + bendMask * uCausticStrength;
    vec3 opticalColor = min(vec3(1.0), scene.rgb * caustic);

    // The target context uses premultiplied alpha for clean CSS composition.
    gl_FragColor = vec4(opticalColor * opticalAlpha, opticalAlpha);
  }
`;

function finiteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`nav-owned-scene-${name}-invalid`);
  }
  return value;
}

function positiveNumber(value: number, name: string): number {
  const finite = finiteNumber(value, name);
  if (finite <= 0) throw new Error(`nav-owned-scene-${name}-invalid`);
  return finite;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Resolves a top-left DOM rectangle into the bottom-left viewport region used
 * by the shader. Exported so integration tests can verify address-bar and
 * VisualViewport offsets without requiring a WebGL context.
 */
export function resolveTahoeNavSceneRegion(
  viewport: TahoeNavSceneViewport,
  headerRect: TahoeNavSceneRect,
): TahoeNavResolvedSceneRegion {
  const viewportWidth = positiveNumber(viewport.width, "viewport-width");
  const viewportHeight = positiveNumber(viewport.height, "viewport-height");
  const viewportLeft = finiteNumber(viewport.left ?? 0, "viewport-left");
  const viewportTop = finiteNumber(viewport.top ?? 0, "viewport-top");
  const headerLeft = finiteNumber(headerRect.left, "header-left");
  const headerTop = finiteNumber(headerRect.top, "header-top");
  const regionWidth = positiveNumber(headerRect.width, "header-width");
  const regionHeight = positiveNumber(headerRect.height, "header-height");

  return {
    viewportWidth,
    viewportHeight,
    regionLeft: headerLeft - viewportLeft,
    regionBottom:
      viewportHeight - (headerTop - viewportTop + regionHeight),
    regionWidth,
    regionHeight,
  };
}

function assertWebGLSuccess(gl: WebGLRenderingContext, stage: string): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    throw new Error(`nav-owned-scene-${stage}-webgl-error-${error}`);
  }
}

function fragmentPrecision(gl: WebGLRenderingContext): "highp" | "mediump" {
  const high = gl.getShaderPrecisionFormat(
    gl.FRAGMENT_SHADER,
    gl.HIGH_FLOAT,
  );
  return high && high.precision > 0 ? "highp" : "mediump";
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("nav-owned-scene-shader-allocation-failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message =
      gl.getShaderInfoLog(shader) || "nav-owned-scene-shader-compile-failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function requiredUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`nav-owned-scene-uniform-${name}-unavailable`);
  }
  return location;
}

function createTexture(
  gl: WebGLRenderingContext,
  unit: number,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("nav-owned-scene-texture-allocation-failed");
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
    new Uint8Array([0, 0, 0, 0]),
  );
  return texture;
}

/**
 * WebGL1 renderer for a nav-local copy of an explicitly owned canvas scene.
 *
 * This class does not inspect, capture, or claim to refract page DOM. Call
 * `draw()` synchronously from the owned WebGL scene's post-render callback when
 * that source uses `preserveDrawingBuffer: false` (as Vanta does).
 *
 * Routing deliberately lives outside this class. The renderer is equally
 * usable in Safari/WebKit and Chromium; callers choose it based on verified
 * rendering capability, not a browser brand string.
 */
export class TahoeNavOwnedSceneWebGLRenderer {
  readonly gl: WebGLRenderingContext;
  readonly maxTextureSize: number;

  private readonly target: HTMLCanvasElement;
  private scene: HTMLCanvasElement;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly sceneTexture: WebGLTexture;
  private readonly displacementTexture: WebGLTexture;
  private readonly uniforms: UniformLocations;
  private readonly textureSizes = new Map<
    WebGLTexture,
    readonly [width: number, height: number]
  >();
  private region: TahoeNavResolvedSceneRegion | null = null;
  private displacementScale = TAHOE_DISPLACEMENT_SCALE;
  private maxOpacity = 0.72;
  private causticStrength = 0.1;
  private displacementReady = false;
  private resized = false;
  private disposed = false;

  constructor(target: HTMLCanvasElement, scene: HTMLCanvasElement) {
    if (target === scene) {
      throw new Error("nav-owned-scene-source-target-feedback");
    }

    const gl = target.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("nav-owned-scene-webgl-context-unavailable");

    this.target = target;
    this.scene = scene;
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let sceneTexture: WebGLTexture | null = null;
    let displacementTexture: WebGLTexture | null = null;

    try {
      vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      fragment = compileShader(
        gl,
        gl.FRAGMENT_SHADER,
        FRAGMENT_SHADER.replace(
          "__TAHOE_FRAGMENT_PRECISION__",
          fragmentPrecision(gl),
        ),
      );
      program = gl.createProgram();
      if (!program) {
        throw new Error("nav-owned-scene-program-allocation-failed");
      }
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message =
          gl.getProgramInfoLog(program) ||
          "nav-owned-scene-program-link-failed";
        throw new Error(message);
      }

      buffer = gl.createBuffer();
      if (!buffer) {
        throw new Error("nav-owned-scene-buffer-allocation-failed");
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "aPosition");
      if (position < 0) {
        throw new Error("nav-owned-scene-attribute-position-unavailable");
      }
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const uniforms: UniformLocations = {
        scene: requiredUniform(gl, program, "uScene"),
        displacement: requiredUniform(gl, program, "uDisplacement"),
        viewportResolution: requiredUniform(
          gl,
          program,
          "uViewportResolution",
        ),
        regionOrigin: requiredUniform(gl, program, "uRegionOrigin"),
        regionSize: requiredUniform(gl, program, "uRegionSize"),
        displacementScale: requiredUniform(
          gl,
          program,
          "uDisplacementScale",
        ),
        maxOpacity: requiredUniform(gl, program, "uMaxOpacity"),
        causticStrength: requiredUniform(gl, program, "uCausticStrength"),
      };

      sceneTexture = createTexture(gl, 0);
      displacementTexture = createTexture(gl, 1);

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 0);
      assertWebGLSuccess(gl, "initialization");

      this.program = program;
      this.buffer = buffer;
      this.uniforms = uniforms;
      this.sceneTexture = sceneTexture;
      this.displacementTexture = displacementTexture;
      this.textureSizes.set(sceneTexture, [1, 1]);
      this.textureSizes.set(displacementTexture, [1, 1]);
    } catch (error) {
      // A failed constructor has no instance on which callers can invoke
      // dispose(). Release every successfully allocated object here so retries
      // do not accumulate GPU resources on memory-constrained mobile devices.
      if (!gl.isContextLost()) {
        if (displacementTexture) gl.deleteTexture(displacementTexture);
        if (sceneTexture) gl.deleteTexture(sceneTexture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
      throw error;
    } finally {
      // Shader objects are no longer needed after linking. Deleting them is
      // also safe when compilation or a later allocation stage failed.
      if (!gl.isContextLost()) {
        if (fragment) gl.deleteShader(fragment);
        if (vertex) gl.deleteShader(vertex);
      }
    }
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.assertUsable();
    const safeDpr = positiveNumber(dpr, "target-dpr");
    const width = Math.max(
      1,
      Math.round(
        positiveNumber(cssWidth, "target-css-width") * safeDpr,
      ),
    );
    const height = Math.max(
      1,
      Math.round(positiveNumber(cssHeight, "target-css-height") * safeDpr),
    );
    if (width > this.maxTextureSize || height > this.maxTextureSize) {
      throw new Error("nav-owned-scene-target-exceeds-max-texture-size");
    }
    if (this.target.width !== width) this.target.width = width;
    if (this.target.height !== height) this.target.height = height;
    this.gl.viewport(0, 0, width, height);
    this.resized = true;
    assertWebGLSuccess(this.gl, "resize");
  }

  update(options: TahoeNavOwnedSceneUpdate): void {
    this.assertUsable();
    if (options.scene) {
      if (options.scene === this.target) {
        throw new Error("nav-owned-scene-source-target-feedback");
      }
      this.scene = options.scene;
    }

    this.region = resolveTahoeNavSceneRegion(
      options.viewport,
      options.headerRect,
    );
    this.displacementScale = finiteNumber(
      options.displacementScale ?? TAHOE_DISPLACEMENT_SCALE,
      "displacement-scale",
    );
    this.maxOpacity = clamp(
      finiteNumber(options.maxOpacity ?? 0.72, "max-opacity"),
      0,
      1,
    );
    this.causticStrength = clamp(
      finiteNumber(options.causticStrength ?? 0.1, "caustic-strength"),
      0,
      0.35,
    );
    this.uploadCanvas(
      this.displacementTexture,
      1,
      options.displacement.canvas,
      "displacement",
    );
    this.displacementReady = true;
  }

  /**
   * Uploads the current owned scene and renders one transparent nav-local
   * optical frame. Keep this call synchronous with Vanta's `afterRender`.
   */
  draw(): void {
    this.assertUsable();
    if (!this.region || !this.displacementReady) {
      throw new Error("nav-owned-scene-update-required");
    }
    if (!this.resized) {
      throw new Error("nav-owned-scene-resize-required");
    }

    this.uploadCanvas(this.sceneTexture, 0, this.scene, "scene");

    const gl = this.gl;
    const region = this.region;
    gl.viewport(0, 0, this.target.width, this.target.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.displacementTexture);
    gl.uniform1i(this.uniforms.scene, 0);
    gl.uniform1i(this.uniforms.displacement, 1);
    gl.uniform2f(
      this.uniforms.viewportResolution,
      region.viewportWidth,
      region.viewportHeight,
    );
    gl.uniform2f(
      this.uniforms.regionOrigin,
      region.regionLeft,
      region.regionBottom,
    );
    gl.uniform2f(
      this.uniforms.regionSize,
      region.regionWidth,
      region.regionHeight,
    );
    gl.uniform1f(this.uniforms.displacementScale, this.displacementScale);
    gl.uniform1f(this.uniforms.maxOpacity, this.maxOpacity);
    gl.uniform1f(this.uniforms.causticStrength, this.causticStrength);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    assertWebGLSuccess(gl, "draw");
  }

  /**
   * Verifies that the most recent frame contains a distributed, non-empty
   * optical overlay. Call only for the first reveal; readback is deliberately
   * avoided during steady-state animation.
   */
  hasVisibleOutput(): boolean {
    this.assertUsable();
    if (this.target.width <= 0 || this.target.height <= 0) return false;

    const gl = this.gl;
    const pixel = new Uint8Array(4);
    const xFractions = [0.15, 0.32, 0.68, 0.85];
    const yFractions = [0.2, 0.5, 0.8];
    let visibleSamples = 0;

    for (const yFraction of yFractions) {
      for (const xFraction of xFractions) {
        const x = Math.min(
          this.target.width - 1,
          Math.max(0, Math.round((this.target.width - 1) * xFraction)),
        );
        const y = Math.min(
          this.target.height - 1,
          Math.max(0, Math.round((this.target.height - 1) * yFraction)),
        );
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (pixel[3] >= 24 && pixel[0] + pixel[1] + pixel[2] > 12) {
          visibleSamples += 1;
        }
      }
    }
    assertWebGLSuccess(gl, "visibility-proof");
    return visibleSamples >= 3;
  }

  dispose(): void {
    if (this.disposed) return;
    const gl = this.gl;
    if (!gl.isContextLost()) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.deleteTexture(this.sceneTexture);
      gl.deleteTexture(this.displacementTexture);
      gl.deleteBuffer(this.buffer);
      gl.deleteProgram(this.program);
    }
    this.textureSizes.clear();
    this.region = null;
    this.displacementReady = false;
    this.resized = false;
    this.disposed = true;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("nav-owned-scene-renderer-disposed");
    if (this.gl.isContextLost()) {
      throw new Error("nav-owned-scene-webgl-context-lost");
    }
  }

  private uploadCanvas(
    texture: WebGLTexture,
    unit: number,
    source: HTMLCanvasElement,
    label: "scene" | "displacement",
  ): void {
    const width = positiveNumber(source.width, `${label}-width`);
    const height = positiveNumber(source.height, `${label}-height`);
    if (width > this.maxTextureSize || height > this.maxTextureSize) {
      throw new Error(`nav-owned-scene-${label}-exceeds-max-texture-size`);
    }

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    const previous = this.textureSizes.get(texture);
    if (previous && previous[0] === width && previous[1] === height) {
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
      this.textureSizes.set(texture, [width, height]);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    assertWebGLSuccess(gl, `${label}-upload`);
  }
}
