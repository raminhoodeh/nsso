// Add source text only; OpenAI vectors belong to the separately versioned index.
import { ingestSources } from './operator-ingestion.mjs';
import { reportFailure } from './operator-openai.mjs';
ingestSources({ csvOnly: true, includeRecord: true }).catch(reportFailure);
