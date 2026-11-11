/** Explicitly applied, bounded film editorial maintenance. Default is zero-network dry run. */
import { applyMode, database, fingerprint, generateFilm, numericOption, readCheckpoints, saveCheckpoint, settleCheckpoint, OperatorError } from './operator-openai.mjs';
export const CATEGORIES = [
  'Critically-Acclaimed Mind-Bending Sci-Fi', 'Visually Striking Emotional Dramas',
  'Gritty Heist & Crime Thrillers', 'Suspenseful Psychological Mysteries',
  'Epic Historical Period Pieces', 'Heartfelt Coming-of-Age Tales',
  'Surreal & Left-of-Center Cinema', 'Dark Comedies & Sharp Satire',
  'Riveting Global Documentaries', 'Classic Masterpieces of World Cinema',
  'Intense Action, War & Adventure', 'Prestige Television & Miniseries',
  'Nostalgic Cult Classics', 'Japanese Anime',
];
const FIELDS = 'id,title,year,director,description,categories';
function filmFilter(film) {
  // Include current authored fields in the PATCH predicate. A concurrent edit
  // turns this into zero matched rows instead of overwriting the newer text.
  const conditions = Object.entries(film).filter(([key]) => FIELDS.split(',').includes(key)).map(([key, value]) => {
    if (value === null) return `${key}=is.null`;
    const encoded = Array.isArray(value) ? `{${value.map(item => `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}` : String(value);
    return `${key}=eq.${encodeURIComponent(encoded)}`;
  });
  return conditions.join('&');
}
async function commitFilm(receipt) {
  await settleCheckpoint(receipt);
  const result = await database(`razinflix_films?${filmFilter(receipt.source)}&select=id`, { method: 'PATCH', body: receipt.update, headers: { Prefer: 'return=representation' } });
  if (!Array.isArray(result) || result.length !== 1) throw new OperatorError('operator_film_changed_or_write_unconfirmed');
  await saveCheckpoint(receipt.requestId, { requestId: receipt.requestId, kind: 'film', state: 'committed', filmId: receipt.source.id, operation: receipt.operation, sourceAfterHash: fingerprint({ ...receipt.source, ...receipt.update }) });
}
export async function maintainFilms(operation) {
  if (!['categories', 'descriptions', 'cleanup'].includes(operation)) throw new OperatorError('invalid_film_operation');
  const limit = numericOption('--limit', 25, 500);
  if (!applyMode()) {
    console.log(JSON.stringify({ dryRun: true, operation, maximumFilms: limit, providerRequests: 0, databaseWrites: 0, applyFlag: '--apply', preserves: ['New', 'Japanese Anime'] }));
    return;
  }
  for (const receipt of await readCheckpoints('film')) if (receipt.operation === operation) await commitFilm(receipt);
  const films = await database(`razinflix_films?select=${FIELDS}&order=id.asc&limit=${limit}`);
  if (!Array.isArray(films)) throw new OperatorError('operator_film_source_contract_rejected');
  const counts = new Map();
  if (operation === 'cleanup') {
    for (let offset = 0; offset < 100000; offset += 1000) {
      const rows = await database(`razinflix_films?select=categories&order=id.asc&limit=1000&offset=${offset}`);
      if (!Array.isArray(rows)) throw new OperatorError('operator_film_counts_invalid');
      for (const row of rows) for (const category of row.categories || []) counts.set(category, (counts.get(category) || 0) + 1);
      if (rows.length < 1000) break;
      if (offset === 99000) throw new OperatorError('operator_film_counts_review_required');
    }
  }
  const completed = await readCheckpoints('film', 'committed');
  let updated = 0, skipped = 0;
  for (const film of films) {
    if (completed.some(receipt => receipt.operation === operation && receipt.sourceAfterHash === fingerprint(film))) { skipped++; continue; }
    if ((film.categories || []).some(category => ['New', 'Japanese Anime'].includes(category))) { skipped++; continue; }
    if (operation === 'descriptions' && String(film.description || '').length > 250) { skipped++; continue; }
    if (operation === 'cleanup' && film.categories?.length && film.categories.every(category => CATEGORIES.includes(category) && (counts.get(category) || 0) >= 5)) { skipped++; continue; }
    let update, requestId, actualMicros;
    if (operation !== 'descriptions' && (['Hayao Miyazaki', 'Isao Takahata', 'Katsuhiro Otomo'].includes(film.director) || ['Akira', 'Perfect Blue', 'Ghost in the Shell'].includes(film.title))) {
      update = { categories: ['Japanese Anime'] };
      requestId = (await import('node:crypto')).randomUUID();
    } else {
      const schema = operation === 'descriptions'
        ? { type: 'object', additionalProperties: false, properties: { description: { type: 'string' } }, required: ['description'] }
        : { type: 'object', additionalProperties: false, properties: { category: { type: 'string', enum: CATEGORIES } }, required: ['category'] };
      const prompt = operation === 'descriptions'
        ? `Write a faithful atmospheric 2-3 sentence film description. No invented claims, title/year/director repetition or markdown. Return JSON {"description":"..."}. Film metadata: ${JSON.stringify(film)}`
        : `Choose exactly one allowed cinematic category for this film. Preserve known facts. Return JSON {"category":"..."}. Allowed categories: ${JSON.stringify(CATEGORIES)}. Film metadata: ${JSON.stringify(film)}`;
      const result = await generateFilm(film, operation, prompt, schema);
      requestId = result.requestId;
      actualMicros = result.actualMicros;
      if (operation === 'descriptions') {
        if (Object.keys(result.value).join(',') !== 'description' || typeof result.value.description !== 'string' || result.value.description.trim().length < 40 || result.value.description.length > 1600) throw new OperatorError('operator_film_contract_rejected');
        update = { description: result.value.description.trim() };
      } else {
        if (Object.keys(result.value).join(',') !== 'category' || !CATEGORIES.includes(result.value.category)) throw new OperatorError('operator_film_contract_rejected');
        update = { categories: [result.value.category] };
      }
    }
    const receipt = { requestId, kind: 'film', state: 'generated', operation, source: film, sourceHash: fingerprint(film), update, ...(actualMicros === undefined ? {} : { actualMicros }) };
    await saveCheckpoint(requestId, receipt);
    await commitFilm(receipt);
    updated++;
    console.log(JSON.stringify({ operation, updated, skipped }));
  }
  console.log(JSON.stringify({ operation, updated, skipped, noAutomaticRetries: true }));
}
