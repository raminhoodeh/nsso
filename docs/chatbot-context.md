# Chatbot Context Ingestion

The Deity assistant uses Supabase as its runtime knowledge store. Local CSV and Markdown source files are used only when rebuilding or refreshing that knowledge base.

## Private source files

The source folder `nsso agent context database/` is intentionally gitignored. It can contain scraped pages, contact lists, research notes, and other private or licensed material that should not be published in this repository.

For local ingestion, either keep the private folder at the project root:

```bash
./nsso agent context database/
```

or set a custom path in `.env.local`:

```bash
NSSO_CONTEXT_DIR=/absolute/path/to/private/context
```

## Scripts

The ingestion scripts read `.env.local`, connect to Supabase with `SUPABASE_SERVICE_ROLE_KEY`, generate embeddings with Gemini, and write records into `agent_knowledge`.

Common scripts:

- `scripts/ingest-context.ts` ingests all CSV files in `NSSO_CONTEXT_DIR`.
- `scripts/clear-and-reingest.ts` clears `agent_knowledge` and rebuilds it from the private context folder.
- `scripts/ingest-films.ts` ingests only `nsso Database - Film List.csv`.
- `scripts/ingest-database.ts` can ingest CSV and Markdown files from `NSSO_CONTEXT_DIR`.

Because these scripts use service-role access, run them only from a trusted local environment.
