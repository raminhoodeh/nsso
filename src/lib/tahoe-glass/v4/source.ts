import { TAHOE_V4_DEFAULT_SOURCE_TIMEOUT_MS } from "./constants";
import type {
  TahoeV4ImageSceneSource,
  TahoeV4SceneSource,
  TahoeV4VideoSceneSource,
} from "./types";

export type TahoeV4ResolvedPixelSource =
  | HTMLImageElement
  | HTMLVideoElement;

function abortError(): Error {
  return new Error("tahoe-v4-source-resolution-aborted");
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function waitForResolver<T>(
  resolve: () => T | null,
  signal?: AbortSignal,
  timeoutMs = TAHOE_V4_DEFAULT_SOURCE_TIMEOUT_MS,
): Promise<T> {
  const immediate = resolve();
  if (immediate) return immediate;
  ensureNotAborted(signal);

  return new Promise<T>((resolveValue, reject) => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      if (signal?.aborted) {
        cleanup();
        reject(abortError());
        return;
      }
      const value = resolve();
      if (value) {
        cleanup();
        resolveValue(value);
        return;
      }
      if (performance.now() - started >= timeoutMs) {
        cleanup();
        reject(new Error("tahoe-v4-source-timeout"));
      }
    }, 50);
    const aborted = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      window.clearInterval(timer);
      signal?.removeEventListener("abort", aborted);
    };
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

async function waitForImage(
  image: HTMLImageElement,
  signal?: AbortSignal,
  timeoutMs = TAHOE_V4_DEFAULT_SOURCE_TIMEOUT_MS,
): Promise<HTMLImageElement> {
  if (image.complete && image.naturalWidth > 0) {
    if (typeof image.decode === "function") await image.decode().catch(() => undefined);
    return image;
  }
  ensureNotAborted(signal);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("tahoe-v4-image-source-timeout"));
    }, timeoutMs);
    const loaded = () => {
      cleanup();
      resolve(image);
    };
    const failed = () => {
      cleanup();
      reject(new Error("tahoe-v4-image-source-failed"));
    };
    const aborted = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
    };
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

async function resolveImage(
  source: TahoeV4ImageSceneSource,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<HTMLImageElement> {
  if (source.getElement) {
    const element = await waitForResolver(
      source.getElement,
      signal,
      timeoutMs,
    );
    return waitForImage(element, signal, timeoutMs);
  }
  if (!source.src) throw new Error("tahoe-v4-image-source-required");
  const image = new Image();
  image.crossOrigin = source.crossOrigin ?? "anonymous";
  image.decoding = "async";
  const loaded = waitForImage(image, signal, timeoutMs);
  image.src = source.src;
  return loaded;
}

async function resolveVideo(
  source: TahoeV4VideoSceneSource,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<HTMLVideoElement> {
  const video = await waitForResolver(source.getElement, signal, timeoutMs);
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return video;
  }
  ensureNotAborted(signal);
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("tahoe-v4-video-source-timeout"));
    }, timeoutMs ?? TAHOE_V4_DEFAULT_SOURCE_TIMEOUT_MS);
    const ready = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
      cleanup();
      resolve(video);
    };
    const failed = () => {
      cleanup();
      reject(new Error("tahoe-v4-video-source-failed"));
    };
    const aborted = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
    };
    video.addEventListener("loadeddata", ready);
    video.addEventListener("canplay", ready);
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

export async function resolveTahoeV4PixelSource(
  source: TahoeV4SceneSource,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<TahoeV4ResolvedPixelSource | null> {
  switch (source.kind) {
    case "clouds":
    case "material-only":
      return null;
    case "image":
      return resolveImage(source, signal, timeoutMs);
    case "video":
      return resolveVideo(source, signal, timeoutMs);
  }
}

export function tahoeV4PixelSourceDimensions(
  source: TahoeV4ResolvedPixelSource,
): readonly [width: number, height: number] {
  if (source instanceof HTMLVideoElement) {
    return [source.videoWidth || 1, source.videoHeight || 1];
  }
  if (source instanceof HTMLImageElement) {
    return [
      source.naturalWidth || source.width || 1,
      source.naturalHeight || source.height || 1,
    ];
  }
  return [1, 1];
}
