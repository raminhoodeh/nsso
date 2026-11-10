/** Resumable versioned index migration. Original text/metadata/old vectors stay intact. */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { applyMode, embeddings, numericOption, readCheckpoints, reportFailure, rpc, saveCheckpoint, settleCheckpoint, OperatorError } from './operator-openai.mjs';

export async function commitReceipt(receipt) {
  if (!Array.isArray(receipt?.rows) || receipt.rows.length < 1 || receipt.rows.length > 128 || new Set(receipt.rows.map(row => row?.id)).size !== receipt.rows.length) throw new OperatorError('operator_index_receipt_contract_rejected');
  await settleCheckpoint(receipt);
  let committed = 0;
  // Use smaller SQL transactions under the API role deadline. The full generated
  // receipt stays intact until every chunk is acknowledged, so recovery repeats
  // only the same hash-checked upserts and never asks the provider again.
  for (let offset = 0; offset < receipt.rows.length; offset += 32) {
    const rows = receipt.rows.slice(offset, offset + 32).map(({ id, content_hash, embedding }) => ({ id, content_hash, embedding }));
    const result = await rpc('commit_nsso_openai_index_batch', { p_rows: rows });
    if (!Number.isSafeInteger(result?.committed) || result.committed !== rows.length) throw new OperatorError('operator_index_commit_unconfirmed');
    committed += result.committed;
  }
  await saveCheckpoint(receipt.requestId, { requestId: receipt.requestId, kind: 'index', state: 'committed', submitted: receipt.rows.length, committed });
  return committed;
}
export async function backfill({ apply = applyMode(), maxBatches = numericOption('--max-batches', 1000, 10000), after = null } = {}) {
  const afterFlag = process.argv.indexOf('--after');
  if (after === null && afterFlag >= 0) after = process.argv[afterFlag + 1];
  if (after !== null && (typeof after !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(after))) throw new OperatorError('invalid_backfill_cursor');
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, providerRequests: 0, databaseWrites: 0, target: 'agent_knowledge_openai_v1', model: 'text-embedding-3-small', dimensions: 1536, batchMaximum: 128, applyFlag: '--apply' }));
    return { rows: 0, batches: 0 };
  }
  let committed = 0;
  // A previous successful paid response is committed from its protected receipt;
  // recovery does not repeat the provider request or spend again.
  for (const receipt of await readCheckpoints('index')) committed += await commitReceipt(receipt);
  let batches = 0;
  for (; batches < maxBatches; batches++) {
    const rows = await rpc('nsso_openai_index_batch', { p_after: after, p_limit: 128 });
    if (!Array.isArray(rows)) throw new OperatorError('operator_index_source_contract_rejected');
    if (!rows.length) break;
    if (rows.some(row => !/^[a-f0-9]{32}$/i.test(row.content_hash) || typeof row.id !== 'string' || typeof row.content !== 'string')) throw new OperatorError('operator_index_source_contract_rejected');
    // Byte ceilings guarantee the documented 8192 per-input /300k per-request
    // token limits without truncating, pooling or changing original source text.
    let group = [], bytes = 0;
    for (const row of rows) {
      const size = Buffer.byteLength(row.content, 'utf8');
      if (group.length && bytes + size > 250_000) {
        committed += await commitReceipt(await embeddings(group)); group = []; bytes = 0;
      }
      group.push(row); bytes += size;
    }
    if (group.length) committed += await commitReceipt(await embeddings(group));
    console.log(JSON.stringify({ kind: 'openai-index-progress', completedBatches: batches + 1, committedRows: committed }));
  }
  console.log(JSON.stringify({ kind: 'openai-index-checkpoint', completedBatches: batches, committedRows: committed, boundedStop: batches === maxBatches, rangeOnly: after !== null }));
  return { rows: committed, batches };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) backfill().catch(reportFailure);
