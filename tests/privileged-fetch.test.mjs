import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
    return next(specifier, context)
} })
const { createPrivilegedFetch, reportLimiterResultFailure } = await import('../src/lib/server/privileged-fetch.ts')
hook.deregister()
const requestId = 'd27086d4-904f-432a-adb1-fccbd5b839ce'
const secret = 'PRIVATE_KEY_HEADER_BODY_URL_ERROR_CANARY'
const url = 'https://private-host.test/rest/v1/rpc/consume_nsso_request_limit?private=' + secret
function capture(t) {
    const logs = []
    t.mock.method(console, 'warn', (...args) => logs.push(args))
    return logs
}
function assertSafe(logs) {
    const serialized = JSON.stringify(logs)
    assert.equal(serialized.includes(secret), false)
    assert.equal(serialized.includes('private-host.test'), false)
    assert.equal(serialized.includes('Authorization'), false)
}

test('successful privileged fetch is one unchanged attempt, with five-second deadline and no log', async t => {
    const logs = capture(t), response = Response.json({ allowed: true })
    let calls = 0, observed, deadlineMs
    const timeout = AbortSignal.timeout.bind(AbortSignal)
    t.mock.method(AbortSignal, 'timeout', ms => { deadlineMs = ms; return timeout(ms) })
    const transport = createPrivilegedFetch({ requestId }, async (input, init) => { calls++; observed = { input, init }; return response })
    const headers = { Authorization: secret }
    assert.equal(await transport(url, { method: 'POST', headers, body: secret }), response)
    assert.equal(calls, 1)
    assert.equal(deadlineMs, 5000)
    assert.equal(observed.input, url)
    assert.equal(observed.init.headers, headers)
    assert.equal(observed.init.body, secret)
    assert.ok(observed.init.signal instanceof AbortSignal)
    assert.deepEqual(await response.json(), { allowed: true })
    assert.deepEqual(logs, [])
})

test('upstream HTTP503 is not retried or consumed and logs only whitelisted metadata', async t => {
    const logs = capture(t), response = Response.json({ message: secret }, { status: 503 })
    let calls = 0
    const transport = createPrivilegedFetch({ requestId }, async () => { calls++; return response })
    assert.equal(await transport(url), response)
    assert.equal(calls, 1)
    assert.equal(response.bodyUsed, false)
    assert.deepEqual(await response.json(), { message: secret })
    assert.equal(logs.length, 1)
    const details = logs[0][1]
    assert.equal(details.requestId, requestId)
    assert.equal(details.operation, 'runtime_limiter')
    assert.equal(details.failure, 'upstream_http')
    assert.equal(details.upstreamStatus, 503)
    assert.equal(details.deadlineAborted, false)
    assert.ok(Number.isInteger(details.elapsedMs) && details.elapsedMs >= 0)
    assertSafe(logs)
})

test('network failure preserves original exception and allowlisted cause without retry or PII', async t => {
    const logs = capture(t)
    const error = new TypeError(secret, { cause: Object.assign(new Error(secret), { code: 'EAI_AGAIN', private: secret }) })
    let calls = 0
    const transport = createPrivilegedFetch({ requestId }, async () => { calls++; throw error })
    await assert.rejects(transport(url, { headers: { Authorization: secret }, body: secret }), actual => actual === error)
    assert.equal(calls, 1)
    assert.equal(logs[0][1].errorName, 'TypeError')
    assert.equal(logs[0][1].causeCode, 'EAI_AGAIN')
    assert.equal(logs[0][1].failure, 'transport')
    assert.equal(logs[0][1].upstreamStatus, null)
    assertSafe(logs)
})

test('deadline classification remains exactly five seconds and throws the original failure', async t => {
    const logs = capture(t), deadline = new AbortController()
    let calls = 0, deadlineMs
    t.mock.method(AbortSignal, 'timeout', ms => { deadlineMs = ms; return deadline.signal })
    const transport = createPrivilegedFetch({ requestId }, async (_, init) => {
        calls++
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    })
    const pending = transport(url)
    const error = new DOMException(secret, 'TimeoutError')
    deadline.abort(error)
    await assert.rejects(pending, actual => actual === error)
    assert.equal(calls, 1)
    assert.equal(deadlineMs, 5000)
    assert.equal(logs[0][1].deadlineAborted, true)
    assert.equal(logs[0][1].callerAborted, false)
    assert.equal(logs[0][1].failure, 'deadline')
    assert.equal(logs[0][1].errorName, 'TimeoutError')
    assertSafe(logs)
})

for (const form of ['init', 'request']) test(`caller cancellation from ${form} is preserved without retry`, async t => {
    const logs = capture(t), caller = new AbortController()
    const reason = new DOMException(secret, 'AbortError')
    let calls = 0
    const transport = createPrivilegedFetch({ requestId }, async (_, init) => {
        calls++
        if (init.signal.aborted) throw init.signal.reason
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    })
    const pending = form === 'request' ? transport(new Request(url, { signal: caller.signal })) : transport(url, { signal: caller.signal })
    caller.abort(reason)
    await assert.rejects(pending, actual => actual === reason)
    assert.equal(calls, 1)
    assert.equal(logs[0][1].deadlineAborted, false)
    assert.equal(logs[0][1].callerAborted, true)
    assert.equal(logs[0][1].failure, 'caller_cancelled')
    assertSafe(logs)
})

test('unknown exception names/codes/destinations and invalid correlation values never enter logs', async t => {
    const logs = capture(t)
    const error = { name: secret, message: secret, stack: secret, cause: { code: secret, message: secret } }
    const transport = createPrivilegedFetch({ requestId: secret }, async () => { throw error })
    await assert.rejects(transport('https://private-host.test/' + secret), actual => actual === error)
    assert.equal(logs[0][1].operation, 'other')
    assert.equal(logs[0][1].errorName, 'UnknownError')
    assert.equal(logs[0][1].causeCode, 'NONE')
    assert.equal(Object.hasOwn(logs[0][1], 'requestId'), false)
    assertSafe(logs)
})

test('logger failure cannot turn failure into success or change original exception identity', async t => {
    t.mock.method(console, 'warn', () => { throw new Error('logger failed') })
    const error = new TypeError(secret)
    const transport = createPrivilegedFetch({ requestId }, async () => { throw error })
    await assert.rejects(transport(url), actual => actual === error)
    const response = new Response(secret, { status: 503 })
    assert.equal(await createPrivilegedFetch({ requestId }, async () => response)(url), response)
})

test('SDK error and malformed results use fixed labels and never serialize their payload', t => {
    const logs = capture(t)
    reportLimiterResultFailure({ requestId }, performance.now(), true, 503)
    reportLimiterResultFailure({ requestId }, performance.now(), false, secret)
    assert.deepEqual(logs.map(([, item]) => item.failure), ['rpc_error', 'malformed_result'])
    assert.deepEqual(logs.map(([, item]) => item.upstreamStatus), [503, null])
    assert.ok(logs.every(([, item]) => item.deadlineAborted === null && item.errorName === 'RpcError'))
    assertSafe(logs)
})
