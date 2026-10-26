import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedClientRead } from '../src/lib/client-read.ts'

test('a stalled read fails within its deadline even when the transport ignores abort', async () => {
    let observed
    const pending = boundedClientRead(signal => { observed = signal; return new Promise(() => {}) }, { timeoutMs: 20 })
    await assert.rejects(pending, { name: 'TimeoutError' })
    assert.equal(observed.aborted, true)
})

test('the deadline covers response decoding after headers arrived', async () => {
    const pending = boundedClientRead(async () => {
        const response = { ok: true, json: () => new Promise(() => {}) }
        return response.json()
    }, { timeoutMs: 20 })
    await assert.rejects(pending, { name: 'TimeoutError' })
})

test('caller cancellation releases a stalled read and a pre-canceled read never starts', async () => {
    const controller = new AbortController()
    let calls = 0, observed
    const read = signal => { calls++; observed = signal; return new Promise(() => {}) }
    const pending = boundedClientRead(read, { signal: controller.signal, timeoutMs: 500 })
    await Promise.resolve()
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(observed.aborted, true)
    await assert.rejects(boundedClientRead(read, { signal: controller.signal }), { name: 'AbortError' })
    assert.equal(calls, 1)
})

test('successful reads retain their result and do not get aborted by a discarded timeout', async () => {
    let observed
    const result = await boundedClientRead(async signal => { observed = signal; return { account: 'synthetic' } }, { timeoutMs: 10 })
    assert.deepEqual(result, { account: 'synthetic' })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(observed.aborted, false)
})
