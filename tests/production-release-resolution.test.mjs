import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProductionRelease } from '../scripts/security/resolve-production-release.mjs'

const repository = 'https://api.github.com/repos/raminhoodeh/nsso'
const token = 'synthetic-release-monitor-token'
const shaA = 'a'.repeat(40)
const shaB = 'b'.repeat(40)
const shaC = 'c'.repeat(40)
const creator = { login: 'vercel[bot]', id: 35613825, type: 'Bot' }
const time = (day) => `2026-11-${String(day).padStart(2, '0')}T12:00:00Z`

function deployment(id, sha = shaA, extra = {}) {
    return {
        id, sha, environment: 'Production', transient_environment: false, production_environment: false,
        creator: { ...creator }, created_at: time(1), repository_url: repository,
        url: `${repository}/deployments/${id}`, statuses_url: `${repository}/deployments/${id}/statuses`, ...extra,
    }
}
function status(deploymentId, id, extra = {}) {
    return {
        id, state: 'success', environment: 'Production', creator: { ...creator }, created_at: time(2),
        repository_url: repository, deployment_url: `${repository}/deployments/${deploymentId}`,
        url: `${repository}/deployments/${deploymentId}/statuses/${id}`,
        environment_url: 'https://nsso-live-a1b2c3-ramin-hoodehs-projects.vercel.app', ...extra,
    }
}
const json = (body, options) => new Response(JSON.stringify(body), options)

function fixture({ deployments = [deployment(1)], statuses = { 1: [status(1, 11)] }, mainSha = shaB, branch, comparison, override } = {}) {
    const calls = []
    const fetchImpl = async (url, options) => {
        const parsed = new URL(url)
        assert.equal(parsed.origin, 'https://api.github.com')
        assert.ok(parsed.pathname.startsWith('/repos/raminhoodeh/nsso/'))
        assert.equal(options.method, 'GET')
        assert.equal(options.redirect, 'error')
        assert.equal(options.headers.Authorization, `Bearer ${token}`)
        assert.equal(options.headers.Accept, 'application/vnd.github+json')
        assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10')
        assert.ok(options.signal instanceof AbortSignal)
        assert.equal(options.body, undefined)
        assert.ok(!url.includes(token))
        calls.push({ url, options })
        const custom = await override?.(parsed, options)
        if (custom !== undefined) return custom
        if (parsed.pathname === '/repos/raminhoodeh/nsso/deployments') {
            assert.equal(parsed.searchParams.get('environment'), 'Production')
            assert.equal(parsed.searchParams.get('per_page'), '20')
            assert.equal(parsed.searchParams.get('page'), '1')
            return json(deployments)
        }
        const match = parsed.pathname.match(/^\/repos\/raminhoodeh\/nsso\/deployments\/(\d+)\/statuses$/)
        if (match) {
            assert.equal(parsed.searchParams.get('per_page'), '100')
            assert.equal(parsed.searchParams.get('page'), '1')
            return json(statuses[match[1]] ?? [])
        }
        if (parsed.pathname === '/repos/raminhoodeh/nsso/branches/main') {
            return json(branch ?? { name: 'main', protected: true, commit: { sha: mainSha } })
        }
        const compare = parsed.pathname.match(/^\/repos\/raminhoodeh\/nsso\/compare\/([a-f0-9]{40})\.\.\.([a-f0-9]{40})$/)
        if (compare) {
            assert.equal(compare[2], mainSha)
            return json(comparison ?? {
                status: compare[1] === mainSha ? 'identical' : 'ahead',
                base_commit: { sha: compare[1] }, merge_base_commit: { sha: compare[1] },
                ahead_by: compare[1] === mainSha ? 0 : 3, behind_by: 0,
            })
        }
        assert.fail('Unexpected synthetic GitHub endpoint')
    }
    return { calls, fetchImpl, resolve: () => resolveProductionRelease({ token, fetchImpl }) }
}

test('resolves the production status SHA independently of newer protected main', async () => {
    const f = fixture()
    assert.deepEqual(await f.resolve(), { sha: shaA, deploymentId: 1, statusId: 11, statusCreatedAt: time(2) })
    assert.equal(f.calls.length, 4)
    assert.ok(f.calls.some(({ url }) => url.includes(`/compare/${shaA}...${shaB}`)))
    assert.ok(f.calls.every(({ url }) => !url.includes('/api/health')))
})

test('accepts identical protected-main ancestry and production_environment:false', async () => {
    const f = fixture({ mainSha: shaA })
    assert.equal((await f.resolve()).sha, shaA)
})

test('an older deployment re-promoted by a newer status wins over deployment creation order', async () => {
    const f = fixture({
        deployments: [deployment(20, shaB, { created_at: time(8) }), deployment(1, shaC)],
        statuses: { 20: [status(20, 200, { created_at: time(9) })], 1: [status(1, 500, { created_at: time(10) })] },
    })
    assert.deepEqual(await f.resolve(), { sha: shaC, deploymentId: 1, statusId: 500, statusCreatedAt: time(10) })
})

test('sorts unsorted status metadata and uses numeric status ID to break timestamp ties', async () => {
    const f = fixture({
        deployments: [deployment(1), deployment(2, shaC)],
        statuses: {
            1: [status(1, 10, { created_at: time(1) }), status(1, 30, { created_at: time(3) })],
            2: [status(2, 40, { created_at: time(3) })],
        },
    })
    assert.equal((await f.resolve()).deploymentId, 2)
})

for (const state of ['failure', 'error', 'pending', 'queued', 'in_progress', 'inactive']) {
    test(`skips a deployment whose latest status is ${state}, without resurrecting its old success`, async () => {
        const f = fixture({
            deployments: [deployment(2, shaC), deployment(1)],
            statuses: { 1: [status(1, 11)], 2: [status(2, 21), status(2, 22, { state, created_at: time(4) })] },
        })
        assert.equal((await f.resolve()).deploymentId, 1)
    })
}

test('never treats an older trusted status as current when the latest status has an untrusted producer', async () => {
    const f = fixture({ statuses: { 1: [status(1, 11), status(1, 12, { created_at: time(4), creator: { ...creator, id: 123 } })] } })
    await assert.rejects(f.resolve(), /no approved successful production deployment/)
})

for (const [label, extra] of [
    ['preview', { environment: 'Preview' }],
    ['transient', { transient_environment: true }],
    ['missing non-transient proof', { transient_environment: undefined }],
    ['wrong bot ID', { creator: { ...creator, id: 123 } }],
    ['wrong bot login', { creator: { ...creator, login: 'someone-else[bot]' } }],
    ['wrong producer type', { creator: { ...creator, type: 'User' } }],
    ['another repository', { repository_url: 'https://api.github.com/repos/raminhoodeh/another' }],
]) {
    test(`excludes ${label} deployment metadata`, async () => {
        const f = fixture({ deployments: [deployment(9, shaC, extra), deployment(1)] })
        assert.equal((await f.resolve()).deploymentId, 1)
        assert.ok(!f.calls.some(({ url }) => url.includes('/deployments/9/statuses')))
    })
}

for (const environmentUrl of [
    'https://nsso.me', 'https://www.nsso.me/', 'https://nsso-live-123abc-ramin-hoodehs-projects.vercel.app/',
]) {
    test(`accepts the exact approved production environment URL ${environmentUrl}`, async () => {
        const f = fixture({ statuses: { 1: [status(1, 11, { environment_url: environmentUrl })] } })
        assert.equal((await f.resolve()).sha, shaA)
    })
}

for (const environmentUrl of [
    'http://nsso.me', 'https://evil.example', 'https://other-project-123-ramin-hoodehs-projects.vercel.app',
    'https://nsso-live-123-another-team.vercel.app', 'https://nsso.me.evil.example',
    'https://user:password@nsso.me', 'https://nsso.me/?x=1', 'https://nsso.me/#fragment',
    'https://nsso.me/preview', 'https://nsso.me:444', 'https://nsso.me/?', 'https://nsso.me/\n',
]) {
    test(`rejects an unapproved or non-canonical environment URL ${JSON.stringify(environmentUrl)}`, async () => {
        const f = fixture({ statuses: { 1: [status(1, 11, { environment_url: environmentUrl })] } })
        await assert.rejects(f.resolve(), /no approved successful production deployment/)
    })
}

for (const extra of [
    { environment: 'Preview' }, { creator: { ...creator, id: 123 } },
    { deployment_url: `${repository}/deployments/123` }, { repository_url: 'https://api.github.com/repos/other/nsso' },
    { url: `${repository}/deployments/1/statuses/999` }, { environment_url: undefined },
]) {
    test(`requires latest status provenance ${JSON.stringify(extra)}`, async () => {
        const f = fixture({ statuses: { 1: [status(1, 11, extra)] } })
        await assert.rejects(f.resolve(), /no approved successful production deployment/)
    })
}

test('missing token or invalid caller inputs fail before any request, without learning from environment', async () => {
    let calls = 0
    for (const badToken of [undefined, null, '', 1, 'has spaces', 'bad\r\nheader', 'x'.repeat(4097)]) {
        await assert.rejects(resolveProductionRelease({ token: badToken, fetchImpl: () => { calls++; throw Error('should not run') } }), /caller-supplied GitHub token/)
    }
    await assert.rejects(resolveProductionRelease({ token, fetchImpl: null }), /fetch implementation/)
    assert.equal(calls, 0)
})

test('missing deployments or success evidence fail closed', async () => {
    for (const options of [{ deployments: [] }, { statuses: {} }, { statuses: { 1: [status(1, 11, { state: 'failure' })] } }]) {
        await assert.rejects(fixture(options).resolve(), /no approved successful production deployment/)
    }
})

test('rejects malformed and oversized deployment metadata', async () => {
    for (const deployments of [
        {}, [null], [deployment(0)], [deployment(1, 'a'.repeat(39))], [deployment(1, 'A'.repeat(40))], [deployment(1, [shaA])],
        [deployment(1, shaA, { created_at: '2026-02-30T12:00:00Z' })], [deployment(1), deployment(1)],
        Array.from({ length: 21 }, (_, index) => deployment(index + 1)),
    ]) await assert.rejects(fixture({ deployments }).resolve(), /invalid|duplicate/)
})

test('rejects malformed, duplicate and truncated status histories', async () => {
    for (const statuses of [
        {}, [null], [status(1, 0)], [status(1, 11, { created_at: 'tomorrow' })],
        [status(1, 11, { state: 'unknown' })], [status(1, 11), status(1, 11)],
        Array.from({ length: 101 }, (_, index) => status(1, index + 1)),
    ]) await assert.rejects(fixture({ statuses: { 1: statuses } }).resolve(), /invalid|duplicate/)
    const paginated = fixture({ override: (url) => url.pathname.endsWith('/statuses')
        ? json([status(1, 11)], { headers: { Link: `<${repository}/deployments/1/statuses?page=2>; rel="next"` } }) : undefined })
    await assert.rejects(paginated.resolve(), /truncated deployment statuses/)
})

test('allows the full 20-record deployment window and reads at most 20 status histories in parallel', async () => {
    let active = 0
    let peak = 0
    const deployments = Array.from({ length: 20 }, (_, index) => deployment(index + 1))
    const statuses = Object.fromEntries(deployments.map(({ id }) => [id, [status(id, id + 100)]]))
    const f = fixture({ deployments, statuses, override: async (url) => {
        if (url.pathname.endsWith('/statuses')) {
            peak = Math.max(peak, ++active)
            await new Promise((resolve) => setTimeout(resolve, 5))
            active--
        }
        if (url.pathname === '/repos/raminhoodeh/nsso/deployments') return json(deployments, {
            headers: { Link: `<${repository}/deployments?page=2>; rel="next"` },
        })
    } })
    assert.equal((await f.resolve()).statusId, 120)
    assert.equal(f.calls.length, 23)
    assert.equal(peak, 20)
    assert.ok(f.calls.every(({ url }) => new URL(url).searchParams.get('page') !== '2'))
})

for (const branch of [
    {}, { name: 'preview', protected: true, commit: { sha: shaB } },
    { name: 'main', protected: false, commit: { sha: shaB } },
    { name: 'main', protected: true, commit: { sha: 'short' } },
    { name: 'main', protected: true, commit: { sha: [shaB] } },
]) {
    test(`requires a captured protected main branch ${JSON.stringify(branch)}`, async () => {
        await assert.rejects(fixture({ branch }).resolve(), /protected main approval is unconfirmed/)
    })
}

for (const comparison of [
    {}, { status: 'behind', base_commit: { sha: shaA }, merge_base_commit: { sha: shaA }, ahead_by: 0, behind_by: 1 },
    { status: 'diverged', base_commit: { sha: shaA }, merge_base_commit: { sha: shaC }, ahead_by: 1, behind_by: 1 },
    { status: 'ahead', base_commit: { sha: shaA }, merge_base_commit: { sha: shaC }, ahead_by: 1, behind_by: 0 },
    { status: 'ahead', base_commit: { sha: shaC }, merge_base_commit: { sha: shaA }, ahead_by: 1, behind_by: 0 },
    { status: 'identical', base_commit: { sha: shaA }, merge_base_commit: { sha: shaA }, ahead_by: 0, behind_by: 0 },
]) {
    test(`rejects unapproved or inconsistent ancestry ${JSON.stringify(comparison)}`, async () => {
        await assert.rejects(fixture({ comparison }).resolve(), /not approved by protected main ancestry/)
    })
}

test('sanitizes HTTP, transport, redirect and JSON errors without returning tokens or response bodies', async () => {
    const marker = `private response containing ${token}`
    const cases = [
        { expected: /deployments HTTP 403/, response: new Response(marker, { status: 403 }) },
        { expected: /request failed/, throws: new Error(marker) },
        { expected: /invalid deployments JSON/, response: new Response(marker, { status: 200 }) },
        { expected: /invalid deployments response/, response: { status: 200, redirected: true, headers: new Headers(), json: async () => [] } },
    ]
    for (const row of cases) {
        const f = fixture({ override: () => { if (row.throws) throw row.throws; return row.response } })
        await assert.rejects(f.resolve(), (error) => {
            assert.match(error.message, row.expected)
            assert.ok(!error.message.includes(token))
            assert.equal(error.cause, undefined)
            return true
        })
    }
})

test('a status lookup HTTP failure fails the whole resolution rather than trusting another old success', async () => {
    const f = fixture({ deployments: [deployment(1), deployment(2)], override: (url) => url.pathname.includes('/deployments/2/statuses')
        ? new Response(token, { status: 404 }) : undefined })
    await assert.rejects(f.resolve(), /deployment statuses HTTP 404/)
})

test('the five-second request deadline also bounds a fetch implementation that ignores abort', { timeout: 7_000 }, async () => {
    const started = Date.now()
    let signal
    await assert.rejects(resolveProductionRelease({ token, fetchImpl: async (_url, options) => {
        signal = options.signal
        return new Promise(() => {})
    } }), /deployments request timed out/)
    assert.equal(signal.aborted, true)
    assert.ok(Date.now() - started < 6_500)
})
