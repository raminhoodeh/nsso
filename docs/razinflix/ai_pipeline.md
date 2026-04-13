# Gemini AI Categorization & Enrichment Pipeline

## 1. System Objective
A backend architecture designed to completely automate and enforce high-fidelity metadata formatting organically—utilizing Google Generative AI (Gemini 2.5 Flash), Google Cloud Vision OCR, and the YouTube Data API v3 dynamically.

## 2. Ingestion Engine Pipeline (`/api/razinflix/add`)
When an Admin adds a film, the pipeline fires 3 core asynchronous tasks:

### 1. YouTube Trailer Resolution
- Hits the **YouTube Data API v3** querying for `{Title} {Year} official trailer -review -reaction` to isolate studio-verified trailers instantly, natively populating the `trailer_key`.

### 2. Google Vision API OCR Parsing
- Checks TMDB poster payload using Google Cloud Vision REST. Runs `TEXT_DETECTION` to semantically evaluate whether the English-text `Title` actually appears physically written inside the `.jpg` poster image matrix, guaranteeing high-resolution native English posters and explicitly skipping blank generic TMDB artwork.

### 3. Gemini 2.5 Flash Autonomous Taxonomic Grounding
- Overrides and deprecates TMDB's generic genres entirely.
- Executes `gemini-2.5-flash` natively to synthetically evaluate the film title and exact TMDB description, explicitly generating an atmospheric 2-sentence structural plot.
- Synthesizes and grounds the results perfectly into one of the **14 specific RazinFlix Categories**, generating zero "Recently Added" generic taxonomies. 

## 3. Dedicated Scripts (`/scripts/`)
- **`cleanup-categories.mjs`**: Autonomous Node pipeline built with Gemini 2.5 Flash that reads arbitrary or abandoned Postgres categories, selects the closest taxonomic fit out of our predefined list of 14, and dynamically patches (`POST`) the database records back to full health.
- **`resolve_dups.py`**: Local backend script executing `SequenceMatcher` Levenshtein-distance fuzzing and token overlap checks. Detects rogue duplicates directly against the Supabase POSTGREST tables. It evaluates identical string matches (e.g. `Bladerunner 2049` vs `Blade Runner 2049`) and dynamically scrubs the poorest resolution database entry via data-quality scoring equations (Poster validation + description string lengths).
