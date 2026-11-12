import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { resolveProductionRelease } from './resolve-production-release.mjs'

function smokeRelease(release) {
    const env = { ...process.env, NSSO_EXPECTED_REVISION: release.sha }
    // Public smoke requests do not need the deployment-metadata token.
    delete env.GH_TOKEN
    delete env.GITHUB_TOKEN
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./smoke-production.mjs', import.meta.url))], {
        env,
        stdio: 'inherit',
        // Preserve all five existing 20-second route budgets plus startup.
        timeout: 110_000,
    })
    if (result.error || result.status !== 0) throw new Error('Production route, security or revision check failed')
}

export async function runProductionMonitor({ resolveRelease, smoke = smokeRelease, log = console.log }) {
    const expected = await resolveRelease()
    log(JSON.stringify({ source: 'vercel-production-deployment', ...expected }))
    try {
        await smoke(expected)
        return expected
    } catch (error) {
        // A deployment can finish between metadata lookup and the health GET.
        // Retry once only if the independently verified production SHA changed.
        const current = await resolveRelease()
        if (current.sha === expected.sha) throw error
        log(JSON.stringify({ event: 'production-changed-during-check', previous: expected.sha, ...current }))
        await smoke(current)
        return current
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await runProductionMonitor({
            resolveRelease: () => resolveProductionRelease({ token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN }),
        })
    } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}
