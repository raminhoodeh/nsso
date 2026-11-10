/** Source-only additive ingestion; versioned OpenAI backfill runs separately. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { applyMode, database, fingerprint, numericOption, OperatorError } from './operator-openai.mjs';

export async function ingestSources({ csvOnly = false, filmOnly = false, includeRecord = false } = {}) {
  const directory = path.resolve(process.env.NSSO_CONTEXT_DIR || 'nsso agent context database');
  const apply = applyMode();
  const limit = numericOption('--limit', 100000, 100000);
  let names;
  try { names = await fs.readdir(directory); } catch (error) {
    if (!apply && error.code === 'ENOENT') { console.log(JSON.stringify({ dryRun: true, sourceDirectoryPresent: false, providerRequests: 0, databaseWrites: 0, applyFlag: '--apply' })); return; }
    throw new OperatorError('operator_source_directory_unavailable');
  }
  const files = names.filter(name => filmOnly ? name === 'nsso Database - Film List.csv' : name.endsWith('.csv') || (!csvOnly && name.endsWith('.md'))).sort();
  let proposed = 0, inserted = 0, duplicates = 0;
  for (const name of files) {
    const source = await fs.readFile(path.join(directory, name), 'utf8');
    const records = name.endsWith('.csv') ? parse(source, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) : source.split(/\n(?=#{1,3}\s)/).filter(chunk => chunk.trim().length > 20);
    for (const record of records) {
      if (proposed >= limit) break;
      const text = typeof record === 'string' ? record.trim() : Object.entries(record).filter(([key, value]) => key.trim() && value != null && String(value).trim() && String(value).trim().toLowerCase() !== 'login:').map(([key, value]) => `${key}: ${value}`).join('\n');
      if (!text.trim()) continue;
      const content = `Source: ${name}\n${typeof record === 'string' ? '\n' : ''}${text}`;
      const metadata = { source: name, ...(includeRecord && typeof record === 'object' ? record : {}) };
      proposed++;
      if (!apply) continue;
      if (Buffer.byteLength(content, 'utf8') > 8000) throw new OperatorError('source_row_requires_chunk_review');
      // Stable source identity avoids duplicates after interruption; original
      // source rows are never cleared, replaced, or given incompatible vectors.
      const existing = await database(`agent_knowledge?select=id&content=eq.${encodeURIComponent(content)}&limit=1`);
      if (!Array.isArray(existing)) throw new OperatorError('operator_source_lookup_invalid');
      if (existing.length) { duplicates++; continue; }
      await database('agent_knowledge', { method: 'POST', body: { id: `${fingerprint(content).slice(0,8)}-${fingerprint(content).slice(8,12)}-${fingerprint(content).slice(12,16)}-${fingerprint(content).slice(16,20)}-${fingerprint(content).slice(20,32)}`, content, metadata: { ...metadata, operator_source_hash: fingerprint(content) }, embedding: null }, headers: { Prefer: 'return=minimal' } });
      inserted++;
    }
    if (proposed >= limit) break;
  }
  console.log(JSON.stringify({ dryRun: !apply, sourceFiles: files.length, proposedRows: proposed, insertedRows: inserted, duplicatesSkipped: duplicates, providerRequests: 0, legacyVectorsWritten: 0, nextStep: 'node scripts/reembed-openai-index.mjs --apply' }));
}
