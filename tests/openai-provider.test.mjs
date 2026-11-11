import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENAI_TEXT_MODEL, OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_DIMENSIONS,
  OpenAIProviderError, isOpenAIAccountFailure, responseBody, responseInputBound, embedOpenAI, generateOpenAI, streamOpenAI,
} from '../src/lib/deity/openai-provider.ts';

const originalFetch = globalThis.fetch;
let savedEnv;
let calls;
const options = { system: 'Use supplied evidence only.', messages: [{ role: 'user', content: 'Explain the supplied example.' }], maxOutputTokens: 128 };
const usage = { input_tokens: 42, output_tokens: 11, total_tokens: 53 };
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
function message(text = 'A supported answer.') { return { type: 'message', content: [{ type: 'output_text', text }] }; }
function completed(output = [message()]) { return { status: 'completed', output, usage }; }
function event(value, crlf = false) { const newline = crlf ? '\r\n' : '\n'; return `event: ${value.type}${newline}data: ${JSON.stringify(value)}${newline}${newline}`; }
function sse(values, { crlf = false, fragment = 1, tail = '', onCancel } = {}) {
  const source = values.map(value => event(value, crlf)).join('') + tail;
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({
    start(controller) { for (let i = 0; i < bytes.length; i += fragment) controller.enqueue(bytes.slice(i, i + fragment)); controller.close(); },
    cancel() { onCancel?.(); },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}
const terminal = () => ({ type: 'response.completed', response: { status: 'completed', usage } });
async function collect(result) { const chunks = []; for await (const chunk of result.stream) chunks.push(chunk); return chunks; }
function mockFetch(factory) {
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init, body: JSON.parse(init.body) }); return factory(url, init); };
}
beforeEach(() => {
  savedEnv = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, NSSO_AI_ENABLED: process.env.NSSO_AI_ENABLED, OPENAI_BASE_URL: process.env.OPENAI_BASE_URL };
  process.env.OPENAI_API_KEY = 'fixture-credential-cannot-authorize'; process.env.NSSO_AI_ENABLED = 'true';
  process.env.OPENAI_BASE_URL = 'https://untrusted.example';
  calls = [];
  globalThis.fetch = async () => { throw new Error('Unexpected network boundary: tests never access a provider.'); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  delete globalThis.window;
});

test('Responses wire contract uses fixed host, server credential, nonstored default tier and reviewed model', async () => {
  mockFetch(() => json(completed()));
  const result = await generateOpenAI(options);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].init.redirect, 'error'); assert.equal(calls[0].init.headers.Authorization, 'Bearer fixture-credential-cannot-authorize');
  assert.equal(calls[0].body.model, OPENAI_TEXT_MODEL); assert.equal(OPENAI_TEXT_MODEL, 'gpt-6-luna');
  assert.equal(calls[0].body.store, false); assert.equal(calls[0].body.stream, false); assert.equal(calls[0].body.service_tier, 'default');
  assert.deepEqual(calls[0].body.reasoning, { effort: 'none' }); assert.equal(calls[0].body.max_output_tokens, 128);
  assert(calls[0].init.signal instanceof AbortSignal); assert.equal(result.text, 'A supported answer.'); assert.deepEqual(result.usage, usage);
});

test('response token bound covers serialized schema/tool input and UTF-8 bytes', () => {
  const withTools = { ...options, messages: [{ role: 'user', content: '日本語😊' }], tools: [{ name: 'propose', description: 'Prepare a reviewed proposal.', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }], schema: { type: 'object', properties: { answer: { type: 'string' } } } };
  const body = responseBody(withTools);
  assert.equal(body.tools[0].type, 'function'); assert.equal(body.tools[0].name, 'propose'); assert.equal(body.parallel_tool_calls, false);
  assert.equal(body.text.format.type, 'json_schema');
  assert(responseInputBound(withTools) >= Buffer.byteLength(JSON.stringify(body), 'utf8') + 2048);
});

test('disabled, missing-credential and browser execution make no network request', async () => {
  mockFetch(() => json(completed()));
  process.env.NSSO_AI_ENABLED = 'false'; await assert.rejects(generateOpenAI(options), OpenAIProviderError);
  process.env.NSSO_AI_ENABLED = 'true'; delete process.env.OPENAI_API_KEY; await assert.rejects(generateOpenAI(options), OpenAIProviderError);
  process.env.OPENAI_API_KEY = 'fixture-credential-cannot-authorize'; globalThis.window = {};
  await assert.rejects(generateOpenAI(options), /Server-only/); assert.equal(calls.length, 0);
});

test('HTTP account errors preserve status without parsing, exposing or retrying private bodies', async () => {
  const diagnostics = []; const prior = console.error; console.error = (...values) => diagnostics.push(values);
  try {
    for (const status of [401, 402, 403, 429, 503]) {
      mockFetch(() => new Response('PRIVATE_PROVIDER_BODY_FIXTURE', { status }));
      await assert.rejects(generateOpenAI(options), error => error instanceof OpenAIProviderError && error.status === status && !error.message.includes('PRIVATE_PROVIDER'));
    }
    assert.equal(calls.length, 5); assert(!JSON.stringify(diagnostics).includes('PRIVATE_PROVIDER_BODY_FIXTURE'));
    assert(!JSON.stringify(diagnostics).includes('fixture-credential-cannot-authorize'));
  } finally { console.error = prior; }
});

test('authoritative account status survives rejecting or hanging body cleanup', async () => {
  for (const status of [401, 402, 403]) for (const hanging of [false, true]) {
    mockFetch(() => new Response(new ReadableStream({ cancel() {
      return hanging ? new Promise(() => {}) : Promise.reject(new Error('PRIVATE_CLEANUP_FIXTURE'));
    } }), { status }));
    await assert.rejects(generateOpenAI(options), error => error instanceof OpenAIProviderError && error.status === status && isOpenAIAccountFailure(error));
  }
  assert.equal(calls.length, 6);
});

for (const code of ['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']) {
  test(`HTTP429 ${code} preserves only an allowlisted billing code without retry`, async () => {
    mockFetch(() => json({ error: { code, type: 'insufficient_quota', message: 'PRIVATE_BILLING_BODY_FIXTURE' } }, 429));
    await assert.rejects(generateOpenAI(options), error => error.status === 429 && error.code === code && isOpenAIAccountFailure(error) && !error.message.includes('PRIVATE_'));
    assert.equal(calls.length, 1);
  });
}

test('ordinary, malformed and oversized429 replies cannot create an account hold or expose bodies', async () => {
  for (const body of [JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), JSON.stringify({ error: { code: 'slow_down' } }),
    '{invalid PRIVATE_BODY_FIXTURE', JSON.stringify({ error: { code: 'PRIVATE_UNKNOWN_CODE' } }),
    JSON.stringify({ error: { code: 'credit_balance_exhausted', message: 'x'.repeat(16_384) } })]) {
    mockFetch(() => new Response(body, { status: 429 }));
    await assert.rejects(generateOpenAI(options), error => error.status === 429 && error.code === 'provider_unavailable' && !isOpenAIAccountFailure(error) && !error.message.includes('PRIVATE_'));
  }
  assert.equal(calls.length, 5);
});

test('a hanging429 error body has a bounded deadline and preserves the HTTP status', { timeout: 5000 }, async () => {
  mockFetch(() => new Response(new ReadableStream({ cancel() { return new Promise(() => {}); } }), { status: 429 }));
  await assert.rejects(generateOpenAI(options), error => error.status === 429 && !isOpenAIAccountFailure(error));
  assert.equal(calls.length, 1);
});

test('zero-byte429 chunks cannot evade the read deadline by starving timers', { timeout: 5000 }, async () => {
  mockFetch(() => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()); } }), { status: 429 }));
  await assert.rejects(generateOpenAI(options), error => error.status === 429 && !isOpenAIAccountFailure(error));
  assert.equal(calls.length, 1);
});

test('a locked429 body cannot hide the authoritative HTTP status', async () => {
  mockFetch(() => { const reply = new Response('{}', { status: 429 }); reply.body.getReader(); return reply; });
  await assert.rejects(generateOpenAI(options), error => error.status === 429 && !isOpenAIAccountFailure(error));
});

for (const status of ['incomplete', 'failed', 'queued', undefined]) {
  test(`nonstream ${status || 'missing'} status is rejected once`, async () => {
    mockFetch(() => json({ ...completed(), status }));
    await assert.rejects(generateOpenAI(options), error => error instanceof OpenAIProviderError && error.code === 'incomplete_response');
    assert.equal(calls.length, 1);
  });
}

test('completed refusal is rejected even if output contains a text part', async () => {
  mockFetch(() => json(completed([{ type: 'message', content: [{ type: 'refusal', refusal: 'PRIVATE_REFUSAL_FIXTURE' }, { type: 'output_text', text: 'A partial text must not override refusal.' }] }])));
  await assert.rejects(generateOpenAI(options), OpenAIProviderError); assert.equal(calls.length, 1);
});

test('SSE parser handles split UTF-8, CRLF, partial JSON, comments and usage completion', async () => {
  mockFetch(() => sse([
    { type: 'response.output_text.delta', delta: 'Hello ' },
    { type: 'response.output_text.delta', delta: 'é😊' }, terminal(),
  ], { crlf: true, fragment: 1, tail: ': keepalive\r\n\r\ndata: [DONE]\r\n\r\n' }));
  const result = await streamOpenAI(options, new AbortController().signal);
  const chunks = await collect(result);
  assert.equal(chunks.map(chunk => chunk.text).join(''), 'Hello é😊'); assert(chunks.every(chunk => chunk.calls.length === 0));
  assert.deepEqual(await result.response, { usage }); assert.equal(calls.length, 1); assert.equal(calls[0].body.stream, true);
});

test('streamed function arguments are parsed only at the done event and preserve tool identity', async () => {
  mockFetch(() => sse([
    { type: 'response.output_item.added', item: { id: 'fc-fixture', type: 'function_call', name: 'update_profile_field' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc-fixture', delta: '{"target":' },
    { type: 'response.function_call_arguments.done', item_id: 'fc-fixture', arguments: '{"target":"bio","value":"Reviewed proposal"}' }, terminal(),
  ], { fragment: 7 }));
  const result = await streamOpenAI(options, new AbortController().signal);
  assert.deepEqual(await collect(result), [{ text: '', calls: [{ name: 'update_profile_field', args: { target: 'bio', value: 'Reviewed proposal' } }] }]);
  assert.deepEqual(await result.response, { usage });
});

for (const type of ['response.refusal.done', 'response.incomplete', 'response.failed', 'error']) {
  test(`partial SSE then ${type} rejects completion without replay`, async () => {
    mockFetch(() => sse([{ type: 'response.output_text.delta', delta: 'Partial output' }, { type }], { fragment: 2 }));
    const result = await streamOpenAI(options, new AbortController().signal); const chunks = [];
    await assert.rejects(async () => { for await (const chunk of result.stream) chunks.push(chunk); }, OpenAIProviderError);
    await assert.rejects(result.response, OpenAIProviderError); assert.equal(chunks[0].text, 'Partial output'); assert.equal(calls.length, 1);
  });
}

test('billing failure after partial SSE output remains a typed account hold without replay', async () => {
  for (const terminal of [{ type: 'error', code: 'credit_balance_exhausted', message: 'PRIVATE_BODY_FIXTURE' },
    { type: 'response.failed', response: { error: { code: 'project_spend_limit_exceeded', message: 'PRIVATE_BODY_FIXTURE' } } }]) {
    mockFetch(() => sse([{ type: 'response.output_text.delta', delta: 'Partial output' }, terminal]));
    const result = await streamOpenAI(options, new AbortController().signal); const chunks = [];
    await assert.rejects(async () => { for await (const chunk of result.stream) chunks.push(chunk); }, isOpenAIAccountFailure);
    await assert.rejects(result.response, isOpenAIAccountFailure);
    assert.equal(chunks[0].text, 'Partial output');
  }
  assert.equal(calls.length, 2);
});

test('SSE billing failure reaches the caller even if terminal cleanup never resolves', { timeout: 5000 }, async () => {
  mockFetch(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(event({ type: 'error', code: 'credit_balance_exhausted' }))); },
    cancel() { return new Promise(() => {}); },
  }), { headers: { 'content-type': 'text/event-stream' } }));
  const result = await streamOpenAI(options, new AbortController().signal);
  await assert.rejects(collect(result), isOpenAIAccountFailure);
  await assert.rejects(result.response, isOpenAIAccountFailure);
  assert.equal(calls.length, 1);
});

test('interrupted stream and malformed tool arguments cannot report successful completion', async () => {
  for (const events of [[{ type: 'response.output_text.delta', delta: 'Partial output' }], [{ type: 'response.function_call_arguments.done', name: 'update_profile_field', arguments: '{invalid' }]]) {
    mockFetch(() => sse(events));
    const result = await streamOpenAI(options, new AbortController().signal);
    await assert.rejects(collect(result)); await assert.rejects(result.response);
  }
  assert.equal(calls.length, 2);
});

test('abort propagates to a pending SSE body, rejects completion and performs no retry', async () => {
  const controller = new AbortController(); let streamController;
  mockFetch((_url, init) => {
    const stream = new ReadableStream({ start(value) { streamController = value; } });
    init.signal.addEventListener('abort', () => streamController.error(init.signal.reason), { once: true });
    return new Response(stream);
  });
  const result = await streamOpenAI(options, controller.signal); const pending = collect(result);
  controller.abort(new DOMException('Synthetic cancellation', 'AbortError'));
  await assert.rejects(pending, error => error.name === 'AbortError'); await assert.rejects(result.response, error => error.name === 'AbortError');
  assert.equal(calls.length, 1);
});

test('embedding contract fixes model and dimension and rejects malformed/nonfinite vectors', async () => {
  const valid = Array(OPENAI_EMBEDDING_DIMENSIONS).fill(0.01);
  mockFetch(() => json({ data: [{ embedding: valid }], usage: { prompt_tokens: 2, total_tokens: 2 } }));
  assert.deepEqual(await embedOpenAI('Synthetic input'), valid);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/embeddings'); assert.equal(calls[0].body.model, OPENAI_EMBEDDING_MODEL);
  assert.equal(calls[0].body.dimensions, 1536); assert.equal(calls[0].body.encoding_format, 'float');
  for (const embedding of [[], Array(768).fill(0.1), [...valid.slice(0, -1), null]]) {
    mockFetch(() => json({ data: [{ embedding }] })); await assert.rejects(embedOpenAI('Synthetic input'), error => error.code === 'invalid_embedding');
  }
  const before = calls.length; await assert.rejects(embedOpenAI('x'.repeat(22_001)), error => error.code === 'embedding_input_too_large'); assert.equal(calls.length, before);
});
