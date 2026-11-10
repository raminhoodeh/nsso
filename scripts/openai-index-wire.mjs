/** Fixed 1536-dimensional operator wire formats; checkpoints remain numeric arrays. */
const DIMENSIONS = 1536;
const BYTES = DIMENSIONS * 4;
const BASE64_CHARACTERS = BYTES / 3 * 4;

export function decodeBase64Embedding(value) {
  // 6,144 bytes need 8,192 canonical base64 characters and no padding. Buffer's
  // permissive decoder alone would silently accept whitespace/truncated input.
  if (typeof value !== 'string' || value.length !== BASE64_CHARACTERS || !/^[A-Za-z0-9+/]+$/.test(value)) throw new TypeError('Invalid embedding encoding');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== BYTES || bytes.toString('base64') !== value) throw new TypeError('Invalid embedding encoding');
  const vector = Array.from({ length: DIMENSIONS }, (_, index) => bytes.readFloatLE(index * 4));
  if (!vector.every(Number.isFinite) || !vector.some(component => component !== 0)) throw new TypeError('Invalid embedding vector');
  return vector;
}

export function float32Decimal(value) {
  if (!Number.isFinite(value)) throw new TypeError('Invalid vector component');
  const f = Math.fround(value);
  if (!Number.isFinite(f) || (f === 0 && value !== 0)) throw new TypeError('Vector component outside float32 range');
  // Nine significant digits preserve every finite binary32 value. JSONB
  // normalizes signed zero, as with the previous JSON number wire path.
  return Object.is(f, -0) ? '-0' : String(Number(f.toPrecision(9)));
}

export function encodeIndexCommit(body) {
  if (!body || Object.keys(body).join(',') !== 'p_rows' || !Array.isArray(body.p_rows) || body.p_rows.length < 1 || body.p_rows.length > 128) throw new TypeError('Invalid index commit');
  const rows = Array.from(body.p_rows, row => {
    if (!row || Object.keys(row).sort().join(',') !== 'content_hash,embedding,id' || typeof row.id !== 'string' || typeof row.content_hash !== 'string' || !Array.isArray(row.embedding) || row.embedding.length !== DIMENSIONS) throw new TypeError('Invalid index row');
    const metadata = JSON.stringify({ id: row.id, content_hash: row.content_hash });
    return metadata.slice(0, -1) + ',"embedding":[' + Array.from(row.embedding, float32Decimal).join(',') + ']}';
  });
  return '{"p_rows":[' + rows.join(',') + ']}';
}
