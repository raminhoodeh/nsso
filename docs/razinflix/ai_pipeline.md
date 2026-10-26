# RazinFlix Film Enrichment Pipeline

## Objective

The add-film workflow accepts only a title and an optional four-digit release year. It prioritises correctness over silently saving partial or incorrect records: a film is written only after RazinFlix has resolved a high-confidence canonical release, a TMDB poster, and a playable YouTube trailer.

## Resolution Pipeline

### 1. Input Normalisation

RazinFlix preserves the user's wording while generating conservative fallback queries. Generic suffixes such as `movie`, `film`, and `trailer` are removed only for fallback searches, so `Crystal Triangle movie` can resolve to `Crystal Triangle` without breaking real titles such as `Scary Movie`.

If the title is shared by multiple releases, the request is rejected with candidate suggestions and the user is asked for the release year. RazinFlix does not guess between remakes.

### 2. Canonical TMDB Match

The resolver searches each title variant with and without the supplied year, deduplicates TMDB results, and scores every candidate using:

- exact, prefix, token-overlap, and edit-distance title similarity;
- exact or near release-year agreement;
- poster availability;
- a small popularity and vote-count tie-breaker.

Low-confidence and ambiguous matches are rejected. The winning TMDB movie ID then becomes the source of truth for the canonical title, original title, release year, overview, rating, genres, countries, credits, alternate titles, posters, and linked videos.

### 3. Poster Selection

Posters come from the resolved TMDB movie record, not from a text-image search. The selector ranks TMDB's primary and alternate posters by language, community rating, resolution, and theatrical poster aspect ratio. Placeholder images are never saved.

### 4. Trailer Resolution

Trailer resolution uses three guarded stages:

1. **TMDB videos:** Prefer playable YouTube trailers already attached to the canonical TMDB movie ID. This is the most precise source because the video-to-film relationship has already been curated.
2. **YouTube Data API:** When TMDB has no usable video, search with the canonical and shortest alternate titles. Results are restricted to embeddable videos, expanded to multiple candidates, validated through `videos.list`, and ranked by title similarity, year, trailer wording, channel, duration, and negative terms such as `review`, `reaction`, `full movie`, and `fan made`.
3. **Google Custom Search:** An optional final fallback searches only YouTube watch pages, extracts real video IDs, scores them using the same rules, and verifies availability through YouTube oEmbed.

The old implementation reused the Gemini key for YouTube and Google Search. Those APIs can have different enablement and key restrictions, so the new pipeline uses dedicated credentials.

### 5. Metadata and Category

TMDB supplies the factual metadata. Gemini may rewrite the verified TMDB overview without adding facts and selects one RazinFlix category. If Gemini is unavailable or returns invalid JSON, the original overview and a deterministic genre-based category are used. Japanese animation is categorised deterministically from TMDB's country and animation genre metadata.

### 6. Strict Write Gate and Repair

No database write occurs until the canonical film, poster, and playable trailer have all passed validation. Errors include machine-readable codes and candidate suggestions rather than being converted into empty fields.

Before inserting, RazinFlix compares the canonical and alternate titles against same-year records. Re-adding a previously incomplete entry updates that record in place, which repairs records such as `crystal triangle movie (1987)` without creating duplicates.

## Required Environment Variables

- `TMDB_API_KEY`: TMDB v3 API key used for movie matching and canonical metadata.
- `GOOGLE_GENERATIVE_AI_API_KEY`: Gemini key used only for grounded description formatting and category selection.
- `YOUTUBE_API_KEY`: Dedicated Google Cloud key with YouTube Data API v3 enabled. This provides the highest-coverage trailer fallback.
- `GOOGLE_SEARCH_API_KEY`: Optional dedicated key with Custom Search JSON API enabled.
- `GOOGLE_SEARCH_ENGINE_ID`: Optional programmable search-engine ID paired with `GOOGLE_SEARCH_API_KEY`.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only key used for film inserts and repairs.

The YouTube and Google Search keys should be restricted to their respective APIs. A Gemini-only key must not be reused for either service.

## Verification

Run the focused regression suite from the app directory:

```bash
node --experimental-strip-types --test scripts/test-razinflix-enrichment.mjs
```

The suite includes a live, read-only TMDB check proving that `crystal triangle movie (1987)` resolves to TMDB movie `69840`, poster `iZv6QX67sB4FUcplRhGK1fb996g.jpg`, director Seiji Okuda, and YouTube trailer `99YuIQFIKwE`.
