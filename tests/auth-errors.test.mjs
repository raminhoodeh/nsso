import test from 'node:test'
import assert from 'node:assert/strict'
import { isTransientAuthError } from '../src/lib/auth-errors.ts'

test('only established credential failures become logout decisions; throttling and unavailable responses stay retryable', () => {
    for (const status of [undefined, 0, -1, NaN, 429, 500, 503]) assert.equal(isTransientAuthError({ status }), true, String(status))
    for (const status of [400, 401, 403, 422]) assert.equal(isTransientAuthError({ status }), false, String(status))
    assert.equal(isTransientAuthError(null), false)
    assert.equal(isTransientAuthError(undefined), false)
})
