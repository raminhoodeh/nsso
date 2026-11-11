// Safe compatibility alias: clearing original knowledge is permanently refused.
import { backfill } from './reembed-openai-index.mjs';
import { OperatorError, reportFailure } from './operator-openai.mjs';
if (process.argv.some(argument => /^--(?:clear|delete|truncate)(?:=|$)/.test(argument))) {
  reportFailure(new OperatorError('destructive_reingestion_retired'));
} else {
  backfill().catch(reportFailure);
}
