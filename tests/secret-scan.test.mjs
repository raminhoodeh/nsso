import test from 'node:test'
import assert from 'node:assert/strict'
import {secretKinds} from '../scripts/security/check-secrets.mjs'
test('secret scanning rejects private keys and service JWTs without rejecting public anon fixtures',()=>{
    const jwt = role => [Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({role})).toString('base64url'),'fixture_signature'].join('.')
    assert.deepEqual(secretKinds(jwt('service_role')),['supabase-service-key'])
    assert.deepEqual(secretKinds(jwt('anon')),[])
    assert.deepEqual(secretKinds('-----BEGIN '+'PRIVATE KEY-----'),['private-key'])
    assert.deepEqual(secretKinds('AI'+'za'+'x'.repeat(35)),['google-api-key'])
    assert.deepEqual(secretKinds('gh'+'p_'+'x'.repeat(36)),['github-token'])
})
