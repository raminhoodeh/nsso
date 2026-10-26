const expectedRevision = process.env.NSSO_EXPECTED_REVISION
if (!/^[a-f0-9]{40}$/.test(expectedRevision || '')) throw new Error('Set NSSO_EXPECTED_REVISION to the exact promoted production commit SHA.')
const origin = new URL(process.env.NSSO_SMOKE_ORIGIN || 'https://www.nsso.me')
if (origin.protocol !== 'https:' || !['www.nsso.me','nsso.me'].includes(origin.hostname) || origin.username || origin.password) throw new Error('Smoke checks require the nsso production origin')
const paths = ['/', '/ramin', '/film/razinflix', '/places/dubai', '/api/health']
for (const path of paths) {
    const start = Date.now()
    const response = await fetch(new URL(path,origin),{signal:AbortSignal.timeout(20_000),redirect:'error',headers:{'User-Agent':'nsso-release-health/1'}})
    if (response.status!==200) throw new Error(`Public availability failed for ${path}: ${response.status}`)
    if (response.headers.get('x-content-type-options')!=='nosniff') throw new Error(`Header verification failed for ${path}`)
    if (!response.headers.has('content-security-policy')) throw new Error(`Enforced CSP missing for ${path}`)
    if (path==='/api/health') {
        const health=await response.json()
        if (health.status!=='ok' || !/^[a-f0-9]{40}$/.test(health.revision)) throw new Error('Release/schema health unconfirmed')
        if (health.revision!==expectedRevision) throw new Error('Unexpected deployed revision')
    } else await response.body?.cancel()
    console.log(JSON.stringify({path,status:response.status,durationMs:Date.now()-start}))
}
