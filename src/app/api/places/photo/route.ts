import { assertSameOrigin } from "@/lib/server/permissions";

const MAX_URL_LENGTH = 8_192;
const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RASTER_CONTENT_TYPES = new Map([
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function isPhotoApiHost(hostname: string) {
  return hostname === "places.googleapis.com" || hostname === "maps.googleapis.com";
}

function isGooglePhotoHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "places.googleapis.com" ||
    normalized === "maps.googleapis.com" ||
    normalized === "lh3.googleusercontent.com" ||
    normalized.endsWith(".googleusercontent.com") ||
    normalized.endsWith(".ggpht.com")
  );
}

function isResourceSegment(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 && decoded.length <= 4_096 && decoded !== "." && decoded !== ".."
      && !/[\s\\/%?#\u0000-\u001f\u007f]/u.test(decoded);
  } catch {
    return false;
  }
}

function hasPhotoParameters(url: URL) {
  const isNew = url.hostname === "places.googleapis.com";
  if (isNew) {
    const parts = url.pathname.split("/");
    if (parts.length !== 7 || parts[1] !== "v1" || parts[2] !== "places"
      || parts[4] !== "photos" || parts[6] !== "media"
      || !isResourceSegment(parts[3]) || !isResourceSegment(parts[5])) return false;
  } else if (url.pathname !== "/maps/api/place/photo") return false;

  const dimensions = isNew ? ["maxWidthPx", "maxHeightPx"] : ["maxwidth", "maxheight"];
  const allowed = new Set(["key", ...dimensions, ...(isNew ? ["skipHttpRedirect"] : ["photo_reference", "photoreference"])]);
  for (const name of url.searchParams.keys()) {
    if (!allowed.has(name) || url.searchParams.getAll(name).length !== 1) return false;
  }
  if (!url.searchParams.get("key")) return false;
  if (!dimensions.some(name => url.searchParams.has(name))) return false;
  for (const name of dimensions) {
    const value = url.searchParams.get(name);
    if (value !== null && (!/^[1-9]\d{0,3}$/.test(value) || Number(value) > (isNew ? 4_800 : 1_600))) return false;
  }
  if (isNew) return !url.searchParams.has("skipHttpRedirect") || url.searchParams.get("skipHttpRedirect") === "false";
  const references = [url.searchParams.get("photo_reference"), url.searchParams.get("photoreference")].filter(value => value !== null);
  return references.length === 1 && references[0]!.length > 0 && references[0]!.length <= 4_096
    && !/[\u0000-\u001f\u007f]/u.test(references[0]!);
}

function validatedPhotoUrl(value: string | null) {
  if (!value || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !isGooglePhotoHost(url.hostname)
    ) {
      return null;
    }
    // A photo key must never turn this proxy into a general Maps/Places API client.
    if (isPhotoApiHost(url.hostname) && !hasPhotoParameters(url)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function configuredPhotoApi() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (!key || site.protocol !== "https:" || site.username || site.password || site.port
      || !["nsso.me", "www.nsso.me"].includes(site.hostname) || site.pathname !== "/" || site.search || site.hash) return null;
    return { key, referer: `${site.origin}/` };
  } catch {
    return null;
  }
}

function rasterContentType(value: string | null) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() || "";
  return RASTER_CONTENT_TYPES.has(normalized) ? normalized : null;
}

function photoError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function fetchWithValidatedRedirects(source: URL, signal: AbortSignal, apiReferer?: string) {
  let current = source;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    // `current` is validated before every network request, including redirects.
    const validatedCurrent = validatedPhotoUrl(current.href);
    if (!validatedCurrent) throw new Error("Invalid photo redirect URL");
    signal.throwIfAborted();

    const response = await fetch(validatedCurrent, {
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
        // The configured website restriction applies only to the initial API hop.
        // Never copy a caller Referer, cookies or this header to Google's image CDN.
        ...(redirectCount === 0 && isPhotoApiHost(validatedCurrent.hostname) && apiReferer ? { Referer: apiReferer } : {}),
      },
      cache: "no-store",
    });

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location || redirectCount === MAX_REDIRECTS) {
      await response.body?.cancel();
      throw new Error("Photo redirect limit exceeded");
    }

    const redirected = validatedPhotoUrl(new URL(location, validatedCurrent).href);
    await response.body?.cancel();
    if (!redirected || isPhotoApiHost(redirected.hostname)) throw new Error("Invalid photo redirect URL");
    current = redirected;
  }

  throw new Error("Photo redirect limit exceeded");
}

async function readBodyWithLimit(response: Response) {
  if (!response.body) return null;

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body.cancel();
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) return null;
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Keeps Google Places media same-origin so the Tahoe image compositor can
 * sample the exact pixels shown in the detail and lightbox scenes. The proxy
 * is deliberately restricted to Google's photo delivery hosts.
 */
export async function GET(request: Request) {
  try { assertSameOrigin(request); }
  catch { return photoError("Photo requests must come from this site", 403); }

  const source = validatedPhotoUrl(new URL(request.url).searchParams.get("url"));
  if (!source) {
    return photoError("Invalid Google Places photo URL", 400);
  }

  const apiConfig = isPhotoApiHost(source.hostname) ? configuredPhotoApi() : null;
  if (isPhotoApiHost(source.hostname)) {
    if (!apiConfig) return photoError("Google Places photos are temporarily unavailable", 503);
    if (source.searchParams.get("key") !== apiConfig.key) return photoError("Invalid Google Places photo URL", 400);
  }

  try {
    const response = await fetchWithValidatedRedirects(
      source,
      AbortSignal.any([request.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      apiConfig?.referer,
    );
    const contentType = rasterContentType(response.headers.get("content-type"));
    if (!response.ok || !contentType) {
      await response.body?.cancel();
      return photoError("Google Places photo unavailable", 502);
    }

    const body = await readBodyWithLimit(response);
    if (!body) {
      return photoError("Google Places photo unavailable", 502);
    }

    const extension = RASTER_CONTENT_TYPES.get(contentType) || "img";
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `inline; filename="place-photo.${extension}"`,
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return photoError("Google Places photo unavailable", 502);
  }
}
