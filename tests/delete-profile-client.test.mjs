import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
async function load(flag) {
    const result = await build({ absWorkingDir: root, entryPoints: ['src/lib/delete-profile-client.ts'], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'process.env.NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED': flag } })
    return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
}

test('deletion drain builds hide the action only for explicit false; local/default and enabled builds remain available', async () => {
    assert.equal((await load('"false"')).isAccountDeletionAvailable(), false)
    assert.equal((await load('"true"')).isAccountDeletionAvailable(), true)
    assert.equal((await load('undefined')).isAccountDeletionAvailable(), true)
})

test('deletion intent stays in memory for retries and changes when a different account confirms', async () => {
    const client = await load('undefined')
    const first = client.getProfileDeleteIntent('account-a')
    assert.match(first, /^[0-9a-f-]{36}$/)
    assert.equal(client.getProfileDeleteIntent('account-a'), first)
    assert.notEqual(client.getProfileDeleteIntent('account-b'), first)
})

test('profile deletion sends a bodyless actor-and-intent bound request and rejects a foreign receipt', async () => {
    const { deleteOwnProfile } = await load('undefined')
    const requests = []
    const send = async (path, init) => { requests.push({ path, ...init }); return Response.json({ deleted: true, accountId: 'actor', operationId: 'intent' }) }
    await deleteOwnProfile('actor', 'intent', new AbortController().signal, send)
    assert.equal(requests[0].path, '/api/profile')
    assert.equal(requests[0].method, 'DELETE')
    assert.equal(requests[0].body, undefined)
    assert.deepEqual(requests[0].headers, { 'X-Nsso-Account': 'actor', 'X-Nsso-Delete-Intent': 'intent' })
    await assert.rejects(deleteOwnProfile('actor', 'different-intent', new AbortController().signal, send), /Deletion could not be confirmed/)
})
