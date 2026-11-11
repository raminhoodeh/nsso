import { ingestSources } from './operator-ingestion.mjs';
import { reportFailure } from './operator-openai.mjs';
ingestSources().catch(reportFailure);
