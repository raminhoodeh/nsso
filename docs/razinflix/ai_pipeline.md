# Gemini AI Categorization & Enrichment Pipeline

## 1. System Objective
A backend node architecture designed to independently crawl the film database and enforce high-fidelity metadata standards.

## 2. Execution Scripts
Located within `/scripts/`, these execute via `ts-node` or `tsx` utilizing the `@google/generative-ai` SDK (`gemini-2.5-flash`).

### `enrich-descriptions.ts`
- **Goal**: Replaces short standard CSV descriptions with deeply atmospheric, emotionally evocative 3-sentence cinematic summaries.
- **Logistics**: Operates in multi-batch queues of 5, pushing independent updates concurrently to bypass aggressive throttling on the v1beta endpoint. Checks for existing long strings (`>250 chars`) to automatically skip parsing.

### `enrich-categories.ts`
- **Goal**: Scrapes the new atmospheric descriptions to group films into a rigid pool of 13 "Netflix-style" categories (`Epic Historical Period Pieces`, `Mind-Bending Sci-Fi`, etc.)
- **Overrides**: Implements hard-coded bypass logic explicitly isolating `Japanese Anime` based on historical directors (Hayao Miyazaki, Isao Takahata) or precise titles (Akira, Ghost in the Shell), ensuring anime films are never mapped into Western structural clusters.
- **Output Validation**: String purification algorithms strip standard LLM generation artifacts (leading stars, bullet points, residual quotation wrappers) before converting the output back into a PostgreSQL array.
