/** Server-only, fixed-origin OpenAI transport. No SDK retries or alternate providers. */
export const OPENAI_TEXT_MODEL = 'gpt-6-luna';
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;
export type OpenAIUsage = { input_tokens?: number; output_tokens?: number };
type Message = { role: 'user' | 'assistant'; content: string };
type Tool = { name: string; description?: string; parameters?: Record<string, unknown> };
type Options = { system: string; messages: Message[]; maxOutputTokens: number; tools?: Tool[]; schema?: Record<string, unknown> };
type Reply = { status?: string; usage?: OpenAIUsage; output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
// OpenAI documents these as billing/spend failures, distinct from ordinary429.
// Keep only allowlisted codes; never expose an upstream message or body.
// https://developers.openai.com/api/docs/guides/error-codes (checked2026-11-10).
const ACCOUNT_BILLING_CODES = new Set(['insufficient_quota', 'credit_balance_exhausted',
  'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']);
const MAX_ERROR_BYTES = 16_384;
const ERROR_BODY_TIMEOUT_MS = 1_000;

function billingCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') return;
  return ACCOUNT_BILLING_CODES.has(error.code) ? error.code : undefined;
}
export function isOpenAIAccountFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('provider' in error) || error.provider !== 'openai' || !('status' in error)) return false;
  return [401, 402, 403].includes(error.status as number) || error.status === 429 && !!billingCode(error);
}

function discardBody(response: Response) {
  // An authoritative HTTP error must survive failed or hanging cleanup.
  try { void response.body?.cancel().catch(() => undefined); } catch { /* No upstream content is logged. */ }
}
async function responseBillingCode(response: Response): Promise<string | undefined> {
  let cleanupReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = performance.now() + ERROR_BODY_TIMEOUT_MS;
  try {
    const reader = response.body?.getReader();
    if (!reader) return;
    cleanupReader = reader;
    const bytes = await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = []; let length = 0;
        while (true) {
          if (performance.now() >= deadline) throw new Error('Error body deadline');
          const part = await reader.read();
          if (part.done) break;
          if (!part.value.byteLength) continue;
          length += part.value.byteLength;
          if (length > MAX_ERROR_BYTES) throw new Error('Error body bound exceeded');
          chunks.push(part.value);
        }
        const result = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
        return result;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Error body deadline')), ERROR_BODY_TIMEOUT_MS); }),
    ]);
    return billingCode(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))?.error);
  } catch { return undefined; }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    try { void cleanupReader?.cancel().catch(() => undefined); } catch { /* Preserve the status. */ }
    try { cleanupReader?.releaseLock(); } catch { /* A failed reader cannot hide the status. */ }
  }
}

export class OpenAIProviderError extends Error {
  readonly provider = 'openai';
  status: number;
  code: string;
  constructor(status: number, code = 'provider_unavailable') { super('AI provider request failed'); this.status = status; this.code = code; }
}
function headers() {
  if (typeof window !== 'undefined') throw new Error('Server-only AI transport');
  const key = process.env.OPENAI_API_KEY;
  if (!key || process.env.NSSO_AI_ENABLED !== 'true') throw new OpenAIProviderError(503, 'provider_not_configured');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
export function responseBody(options: Options, stream = false) {
  return { model: OPENAI_TEXT_MODEL, instructions: options.system, input: options.messages,
    max_output_tokens: options.maxOutputTokens, store: false, stream, service_tier: 'default', reasoning: { effort: 'none' },
    ...(options.tools?.length ? { tools: options.tools.map(tool => ({ type: 'function', ...tool, strict: false })), parallel_tool_calls: false } : {}),
    ...(options.schema ? { text: { format: { type: 'json_schema', name: 'nsso_result', schema: options.schema, strict: false } } } : {}),
  };
}
/** UTF-8 bytes plus message/tool framing is a conservative text-token ceiling. */
export function responseInputBound(options: Options) { return Buffer.byteLength(JSON.stringify(responseBody(options)), 'utf8') + 2048; }
async function post(path: 'responses' | 'embeddings', body: unknown, signal: AbortSignal) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal, redirect: 'error' });
  if (!response.ok) {
    const code = response.status === 429 ? await responseBillingCode(response) : undefined;
    discardBody(response);
    throw new OpenAIProviderError(response.status, code);
  }
  return response;
}
export async function embedOpenAI(text: string, signal = AbortSignal.timeout(10_000)) {
  if (!text || Buffer.byteLength(text, 'utf8') > 22_000) throw new OpenAIProviderError(413, 'embedding_input_too_large');
  const response = await post('embeddings', { model: OPENAI_EMBEDDING_MODEL, input: text, dimensions: OPENAI_EMBEDDING_DIMENSIONS, encoding_format: 'float' }, signal);
  const value = await response.json();
  const vector = value?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== OPENAI_EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) throw new OpenAIProviderError(502, 'invalid_embedding');
  return vector as number[];
}
export async function generateOpenAI(options: Options, signal = AbortSignal.timeout(25_000)) {
  const response = await post('responses', responseBody(options), signal);
  const reply = await response.json() as Reply;
  if (reply.output?.some(item => item.content?.some(part => part.type === 'refusal'))) throw new OpenAIProviderError(502, 'provider_refusal');
  if (reply.status !== 'completed') throw new OpenAIProviderError(502, 'incomplete_response');
  const text = reply.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join('') || '';
  if (!text.trim()) throw new OpenAIProviderError(502, 'empty_or_refused_response');
  return { text, usage: reply.usage };
}
export async function streamOpenAI(options: Options, signal: AbortSignal) {
  const response = await post('responses', responseBody(options, true), signal);
  if (!response.body) throw new OpenAIProviderError(502);
  let resolve!: (value: { usage?: OpenAIUsage }) => void;
  let reject!: (error: unknown) => void;
  const finished = new Promise<{ usage?: OpenAIUsage }>((ok, no) => { resolve = ok; reject = no; });
  // Observe the terminal promise even if consumer cancellation stops iteration first.
  void finished.catch(() => undefined);
  async function* chunks() {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '', completed = false;
    const calls = new Map<string, string>();
    try {
      while (true) {
        signal.throwIfAborted();
        const part = await reader.read();
        buffer += decoder.decode(part.value, { stream: !part.done });
        buffer = buffer.replace(/\r\n/g, '\n');
        if (buffer.length > 256_000) throw new OpenAIProviderError(502, 'stream_event_too_large');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          const value = JSON.parse(data);
          if (value.type === 'response.output_item.added' && value.item?.type === 'function_call') calls.set(value.item.id, value.item.name);
          if (value.type === 'response.output_text.delta') yield { text: String(value.delta || ''), calls: [] as Array<{ name: string; args: unknown }> };
          if (value.type === 'response.function_call_arguments.done') {
            const name = value.name || calls.get(value.item_id);
            if (!name) throw new OpenAIProviderError(502, 'invalid_tool_event');
            yield { text: '', calls: [{ name, args: JSON.parse(value.arguments) }] };
          }
          if (value.type === 'response.completed') { completed = true; resolve({ usage: value.response?.usage }); }
          if (['error', 'response.failed', 'response.incomplete', 'response.refusal.done'].includes(value.type)) {
            const code = billingCode(value.error ?? value.response?.error ?? value);
            throw new OpenAIProviderError(code ? 429 : 502, code ?? 'incomplete_or_refused_response');
          }
        }
        if (part.done) break;
      }
      if (!completed) throw new OpenAIProviderError(502, 'interrupted_response');
    } catch (error) { reject(error); throw error; }
    finally {
      // Terminal errors must reach the caller's durable hold/settlement path
      // even when the underlying stream refuses or never finishes cleanup.
      try { void reader.cancel().catch(() => undefined); } catch { /* Preserve the terminal error. */ }
      try { reader.releaseLock(); } catch { /* Cleanup never replaces the terminal error. */ }
    }
  }
  return { stream: chunks(), response: finished };
}
