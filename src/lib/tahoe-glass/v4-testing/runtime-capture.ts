import type {
  GlassLabSceneFixture,
  PixelBufferLike,
  RuntimeMaterialInspection,
  RuntimeSourceParityInspection,
} from "./types";

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function waitForImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error(`glass-lab-source-load-failed:${src}`)),
      { once: true },
    );
    image.src = src;
  });
}

/** Rasterizes the deterministic fixture with the same fit/position contract. */
export async function rasterizeGlassLabSource(options: {
  scene: GlassLabSceneFixture;
  width: number;
  height: number;
}): Promise<PixelBufferLike> {
  const canvas = createCanvas(options.width, options.height);
  const context = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true,
  });
  if (!context) throw new Error("glass-lab-2d-context-unavailable");
  const image = await waitForImage(options.scene.src);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const targetWidth = canvas.width;
  const targetHeight = canvas.height;
  const [positionX, positionY] = options.scene.position;

  context.clearRect(0, 0, targetWidth, targetHeight);
  if (options.scene.fit === "stretch") {
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
  } else {
    const scale =
      options.scene.fit === "cover"
        ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
        : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (targetWidth - drawWidth) * positionX;
    const drawY = (targetHeight - drawHeight) * positionY;
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  const frame = context.getImageData(0, 0, targetWidth, targetHeight);
  return { width: targetWidth, height: targetHeight, data: frame.data };
}

/**
 * Reads the currently presented renderer bytes. Call in the same animation
 * frame as a requested V4 render because the context intentionally does not
 * preserve its drawing buffer between browser composites.
 */
export function readTahoeV4WebGlFrame(
  canvas: HTMLCanvasElement,
): PixelBufferLike {
  const gl = canvas.getContext("webgl");
  if (!gl) throw new Error("glass-lab-live-webgl-context-unavailable");
  const width = canvas.width;
  const height = canvas.height;
  const bottomUp = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    throw new Error(`glass-lab-live-read-pixels-error:${error}`);
  }

  const topDown = new Uint8Array(bottomUp.length);
  const rowBytes = width * 4;
  let opaquePixels = 0;
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = (height - 1 - y) * rowBytes;
    const targetOffset = y * rowBytes;
    topDown.set(bottomUp.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
    for (let x = 0; x < width; x += 1) {
      if (topDown[targetOffset + x * 4 + 3] > 0) opaquePixels += 1;
    }
  }
  if (opaquePixels < width * height * 0.95) {
    throw new Error(
      `glass-lab-live-frame-not-present:${opaquePixels}/${width * height}`,
    );
  }
  return { width, height, data: topDown };
}

function transparentColor(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "" ||
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    /\/0(?:\.0+)?\)$/.test(normalized)
  );
}

/** Checks the actual material child rather than the cleared optical root. */
export function inspectRuntimeMaterial(
  surface: Element | null,
): RuntimeMaterialInspection {
  const failures: string[] = [];
  const material = surface?.querySelector<HTMLElement>(
    '[data-tahoe-glass-v4-material="true"]',
  );
  const rim = surface?.querySelector<HTMLElement>(
    '[data-tahoe-glass-v4-rim="true"]',
  );
  if (!material) {
    return {
      pass: false,
      backgroundColor: "missing",
      backdropFilter: "missing",
      failures: ["Canonical material element is missing."],
    };
  }
  const computed = getComputedStyle(material);
  const backgroundColor = computed.backgroundColor;
  const backdropFilter =
    computed.backdropFilter ||
    computed.getPropertyValue("-webkit-backdrop-filter") ||
    "none";
  if (transparentColor(backgroundColor)) {
    failures.push("Computed material body is transparent.");
  }
  if (!backdropFilter.includes("blur(")) {
    failures.push("Computed material has no backdrop blur.");
  }
  if (!rim) failures.push("Directional rim element is missing.");
  return {
    pass: failures.length === 0,
    backgroundColor,
    backdropFilter,
    failures,
  };
}

/** Verifies that B, M and R declare the same deterministic owned source. */
export function inspectRuntimeSourceParity(
  root: ParentNode,
  scene: GlassLabSceneFixture,
): RuntimeSourceParityInspection {
  const failures: string[] = [];
  for (const mode of ["bare", "material", "refraction"] as const) {
    const stage = root.querySelector<HTMLElement>(
      `[data-testid="glass-lab-v4-capture-${mode}"]`,
    );
    if (!stage) {
      failures.push(`${mode} stage is missing.`);
      continue;
    }
    if (stage.dataset.labScene !== scene.id) {
      failures.push(`${mode} stage scene id does not match ${scene.id}.`);
    }
    if (stage.dataset.labSource !== scene.src) {
      failures.push(`${mode} stage source does not match ${scene.src}.`);
    }
    if (stage.dataset.labFit !== scene.fit) {
      failures.push(`${mode} stage fit does not match ${scene.fit}.`);
    }
    const expectedPosition = scene.position.join(",");
    if (stage.dataset.labPosition !== expectedPosition) {
      failures.push(`${mode} stage position does not match ${expectedPosition}.`);
    }
  }
  return { pass: failures.length === 0, failures };
}
