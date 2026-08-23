import { NextRequest, NextResponse } from "next/server";

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
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function rasterContentType(value: string | null) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() || "";
  return RASTER_CONTENT_TYPES.has(normalized) ? normalized : null;
}

function photoError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function fetchWithValidatedRedirects(source: URL, signal: AbortSignal) {
  let current = source;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    // `current` is validated before every network request, including redirects.
    const validatedCurrent = validatedPhotoUrl(current.href);
    if (!validatedCurrent) throw new Error("Invalid photo redirect URL");

    const response = await fetch(validatedCurrent, {
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
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
    if (!redirected) throw new Error("Invalid photo redirect URL");
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
export async function GET(request: NextRequest) {
  const source = validatedPhotoUrl(request.nextUrl.searchParams.get("url"));
  if (!source) {
    return photoError("Invalid Google Places photo URL", 400);
  }

  try {
    const response = await fetchWithValidatedRedirects(
      source,
      AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
