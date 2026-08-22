import { NextRequest, NextResponse } from "next/server";

const MAX_URL_LENGTH = 8_192;

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
    if (url.protocol !== "https:" || !isGooglePhotoHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Keeps Google Places media same-origin so the Tahoe image compositor can
 * sample the exact pixels shown in the detail and lightbox scenes. The proxy
 * is deliberately restricted to Google's photo delivery hosts.
 */
export async function GET(request: NextRequest) {
  const source = validatedPhotoUrl(request.nextUrl.searchParams.get("url"));
  if (!source) {
    return NextResponse.json({ error: "Invalid Google Places photo URL" }, { status: 400 });
  }

  const response = await fetch(source, {
    redirect: "follow",
    next: { revalidate: 86_400 },
  });
  const finalUrl = validatedPhotoUrl(response.url);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !finalUrl || !contentType.toLowerCase().startsWith("image/") || !response.body) {
    return NextResponse.json({ error: "Google Places photo unavailable" }, { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
