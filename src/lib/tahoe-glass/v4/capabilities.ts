export interface TahoeV4EnvironmentCapabilities {
  canvasApi: boolean;
  webglApi: boolean;
  imageBitmapApi: boolean;
  requestVideoFrameCallbackApi: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  forcedColors: boolean;
  devicePixelRatio: number;
}

export interface TahoeV4ContextCapabilities {
  maxTextureSize: number;
  maxTextureUnits: number;
  maxRenderbufferSize: number;
  highPrecisionFragment: boolean;
}

function mediaMatches(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

/**
 * Environment-only feature detection. This function never creates a probe GL
 * context and never inspects the user agent. The renderer is the sole owner of
 * the one context created on its target canvas.
 */
export function detectTahoeV4EnvironmentCapabilities(): TahoeV4EnvironmentCapabilities {
  if (typeof window === "undefined") {
    return {
      canvasApi: false,
      webglApi: false,
      imageBitmapApi: false,
      requestVideoFrameCallbackApi: false,
      reducedMotion: false,
      reducedTransparency: false,
      forcedColors: false,
      devicePixelRatio: 1,
    };
  }

  const canvasApi = typeof HTMLCanvasElement !== "undefined";
  return {
    canvasApi,
    webglApi:
      canvasApi &&
      ("WebGLRenderingContext" in window || "WebGL2RenderingContext" in window),
    imageBitmapApi: typeof createImageBitmap === "function",
    requestVideoFrameCallbackApi:
      typeof HTMLVideoElement !== "undefined" &&
      "requestVideoFrameCallback" in HTMLVideoElement.prototype,
    reducedMotion: mediaMatches("(prefers-reduced-motion: reduce)"),
    reducedTransparency: mediaMatches("(prefers-reduced-transparency: reduce)"),
    forcedColors: mediaMatches("(forced-colors: active)"),
    devicePixelRatio: Math.max(1, Math.min(window.devicePixelRatio || 1, 3)),
  };
}

/** Read limits from the renderer's existing context; no second context exists. */
export function inspectTahoeV4ContextCapabilities(
  gl: WebGLRenderingContext,
): TahoeV4ContextCapabilities {
  const precision = gl.getShaderPrecisionFormat(
    gl.FRAGMENT_SHADER,
    gl.HIGH_FLOAT,
  );
  return {
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number,
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    highPrecisionFragment: Boolean(precision && precision.precision > 0),
  };
}
