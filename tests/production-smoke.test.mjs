import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const script = new URL('../scripts/security/smoke-production.mjs', import.meta.url).href
const promoted = '1234567890abcdef1234567890abcdef12345678'
function run({ expected = promoted, deployed = promoted, health = 'ok' } = {}) {
    const fixture = `
        const calls = [];
        globalThis.fetch = async (url, options) => {
            const path = new URL(url).pathname;
            calls.push(path);
            if (options.redirect !== 'error') throw new Error('Smoke redirects must fail closed');
            return new Response(path === '/api/health' ? JSON.stringify({status:${JSON.stringify(health)},revision:${JSON.stringify(deployed)}}) : 'Synthetic public response', {headers:{'x-content-type-options':'nosniff','content-security-policy':"script-src 'self'"}});
        };
        try { await import(${JSON.stringify(script)}); }
        catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
        finally { console.log('FIXTURE_REQUESTS=' + JSON.stringify(calls)); }
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', fixture], {
        env: { PATH: process.env.PATH, ...(expected === null ? {} : { NSSO_EXPECTED_REVISION: expected }) },
        encoding: 'utf8',
    })
    assert.equal(result.error, undefined)
    const requests = JSON.parse(result.stdout.split('\n').find(line => line.startsWith('FIXTURE_REQUESTS=')).slice('FIXTURE_REQUESTS='.length))
    return { ...result, requests }
}

test('production smoke refuses a missing or malformed promoted revision before any HTTP request', () => {
    for (const expected of [null, '', 'abc123', 'A'.repeat(40), promoted + '\n']) {
        const result = run({ expected })
        assert.equal(result.status, 1)
        assert.match(result.stderr, /exact promoted production commit SHA/)
        assert.deepEqual(result.requests, [])
    }
})
test('an otherwise healthy deployment with a different valid commit SHA fails production monitoring', () => {
    const result = run({ deployed: 'abcdef1234567890abcdef1234567890abcdef12' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Unexpected deployed revision/)
    assert.equal(result.requests.at(-1), '/api/health')
})
test('only the promoted revision with healthy security posture passes all public route checks', () => {
    const result = run()
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.requests, ['/', '/ramin', '/film/razinflix', '/places/dubai', '/api/health'])
    const unhealthy = run({ health: 'unavailable' })
    assert.equal(unhealthy.status, 1)
    assert.match(unhealthy.stderr, /Release\/schema health unconfirmed/)
})
