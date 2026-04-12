# Database Schema & Storage Logic

## 1. Supabase Postgres Arrays
The foundational store for RazinFlix runs on a single structured table: `razinflix_films`.
```sql
create table razinflix_films (
    id bigint primary key generated always as identity,
    title text not null,
    year text,
    director text,
    rating text,
    poster text,          -- Remote TMDB URL or local Supabase storage link
    description text,     -- 2-3 sentence Gemini GenAI outputs
    trailer_key text,     -- 11-character YouTube video ID
    categories text[]     -- Postgres String Array natively driving Next.js map() algorithms
);
```

## 2. Next.js Edge Runtime Serialization Bypass
When an admin users uploads new poster `File` objects through the `MovieModal.tsx` edit panel, the data is pushed onto a Vercel Edge API Route (`/api/razinflix/update`).
- Because Next.js Edge runtime frequently mangles binary blobs when directly passing `.get('file')`, we map the `File` object using `await file.arrayBuffer()` natively.
- The route invokes `Buffer.from(arrayBuffer)` and sequentially hands it off to `@supabase/storage-js`.
- If the `razinflix-media` bucket doesn't exist, the API dynamically provisions it instantly with `createBucket`.
