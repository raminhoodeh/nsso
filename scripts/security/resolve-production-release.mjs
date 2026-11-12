const apiOrigin = 'https://api.github.com'
const repository = '/repos/raminhoodeh/nsso'
const deploymentLimit = 20
const statusLimit = 100
const requestTimeoutMs = 5_000
const resolutionTimeoutMs = 30_000
const fullSha = /^[a-f0-9]{40}$/
const isSha = (value) => typeof value === 'string' && fullSha.test(value)
const states = new Set(['error', 'failure', 'inactive', 'in_progress', 'queued', 'pending', 'success'])

class ResolutionError extends Error {}
const failure = (message) => new ResolutionError(`Production release resolution failed: ${message}.`)
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const identifier = (value) => Number.isSafeInteger(value) && value > 0
const trustedCreator = (value) => record(value) && value.login === 'vercel[bot]' && value.id === 35613825 && value.type === 'Bot'
const apiUrl = (value, path) => value === `${apiOrigin}${path}`

function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return null
    const parsed = Date.parse(value)
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) return null
    return parsed
}

function approvedEnvironmentUrl(value) {
    if (typeof value !== 'string' || value.length > 256) return false
    try {
        const url = new URL(value)
        const hostAllowed = ['nsso.me', 'www.nsso.me'].includes(url.hostname)
            || /^nsso-live-[a-z0-9]+-ramin-hoodehs-projects\.vercel\.app$/.test(url.hostname)
        return url.protocol === 'https:' && hostAllowed && !url.username && !url.password && !url.port
            && url.pathname === '/' && !url.search && !url.hash
            && (value === url.origin || value === `${url.origin}/`)
    } catch {
        return false
    }
}

function newest(left, right) {
    return right.time - left.time || right.id - left.id
}

/**
 * Resolve the approved production SHA independently of /api/health and main HEAD.
 * This intentionally inspects only the latest 20 Production deployment records;
 * it does not claim exhaustive history beyond that bounded window. An older
 * deployment in the window may win when Vercel posts a newer promotion status.
 * A status history exceeding one 100-row page fails closed rather than guessing.
 */
export async function resolveProductionRelease({ token, fetchImpl = fetch } = {}) {
    if (typeof token !== 'string' || !token || token.length > 4096 || /\s|[\u0000-\u001f\u007f]/.test(token)) {
        throw failure('a caller-supplied GitHub token is required')
    }
    if (typeof fetchImpl !== 'function') throw failure('a fetch implementation is required')

    const overall = new AbortController()
    const overallTimer = setTimeout(() => overall.abort(), resolutionTimeoutMs)
    async function get(path, label) {
        const controller = new AbortController()
        const signal = AbortSignal.any([overall.signal, controller.signal])
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
        let onAbort
        const aborted = new Promise((_, reject) => {
            onAbort = () => reject(failure(`${label} request timed out`))
            signal.addEventListener('abort', onAbort, { once: true })
            if (signal.aborted) onAbort()
        })
        try {
            const operation = (async () => {
                const response = await fetchImpl(`${apiOrigin}${path}`, {
                    method: 'GET',
                    redirect: 'error',
                    signal,
                    headers: {
                        Accept: 'application/vnd.github+json',
                        Authorization: `Bearer ${token}`,
                        'X-GitHub-Api-Version': '2026-03-10',
                        'User-Agent': 'nsso-production-release/1',
                    },
                })
                if (!response || !Number.isInteger(response.status) || typeof response.json !== 'function'
                    || typeof response.headers?.get !== 'function' || response.redirected
                    || (response.url && response.url !== `${apiOrigin}${path}`)) {
                    throw failure(`invalid ${label} response`)
                }
                if (response.status !== 200) {
                    const status = response.status >= 100 && response.status <= 599 ? response.status : 'invalid'
                    throw failure(`${label} HTTP ${status}`)
                }
                let data
                try { data = await response.json() } catch { throw failure(`invalid ${label} JSON`) }
                return { data, link: response.headers.get('link') || '' }
            })()
            return await Promise.race([operation, aborted])
        } catch (error) {
            if (error instanceof ResolutionError) throw error
            throw failure(signal.aborted ? `${label} request timed out` : `${label} request failed`)
        } finally {
            clearTimeout(timer)
            signal.removeEventListener('abort', onAbort)
            controller.abort()
        }
    }

    try {
        const { data: deployments } = await get(`${repository}/deployments?environment=Production&per_page=${deploymentLimit}&page=1`, 'deployments')
        if (!Array.isArray(deployments) || deployments.length > deploymentLimit) throw failure('invalid deployments data')
        const candidates = []
        const deploymentIds = new Set()
        for (const deployment of deployments) {
            if (!record(deployment)) throw failure('invalid deployment metadata')
            if (deployment.environment !== 'Production' || deployment.transient_environment !== false || !trustedCreator(deployment.creator)) continue
            if (!identifier(deployment.id) || !isSha(deployment.sha) || timestamp(deployment.created_at) === null) {
                throw failure('invalid deployment metadata')
            }
            if (deploymentIds.has(deployment.id)) throw failure('duplicate deployment metadata')
            deploymentIds.add(deployment.id)
            const path = `${repository}/deployments/${deployment.id}`
            if (!apiUrl(deployment.repository_url, repository) || !apiUrl(deployment.url, path)
                || !apiUrl(deployment.statuses_url, `${path}/statuses`)) continue
            candidates.push({ ...deployment, time: timestamp(deployment.created_at) })
        }
        candidates.sort(newest)
        // At most 20 parallel authenticated GETs; every request/body has a 5s
        // deadline and the whole resolver also has an independent 30s deadline.
        const successful = (await Promise.all(candidates.map(async (deployment) => {
            const path = `${repository}/deployments/${deployment.id}`
            const { data: statuses, link } = await get(`${path}/statuses?per_page=${statusLimit}&page=1`, 'deployment statuses')
            if (!Array.isArray(statuses) || statuses.length > statusLimit) throw failure('invalid deployment statuses data')
            if (/rel\s*=\s*(?:"[^"]*\bnext\b[^"]*"|next(?:\s|$))/i.test(link)) throw failure('truncated deployment statuses data')
            const ids = new Set()
            const ordered = statuses.map((status) => {
                if (!record(status) || !identifier(status.id) || timestamp(status.created_at) === null || !states.has(status.state)) {
                    throw failure('invalid deployment status metadata')
                }
                if (ids.has(status.id)) throw failure('duplicate deployment status metadata')
                ids.add(status.id)
                return { ...status, time: timestamp(status.created_at) }
            }).sort(newest)
            const latest = ordered[0]
            if (!latest || latest.state !== 'success' || latest.environment !== 'Production' || !trustedCreator(latest.creator)) return null
            if (!apiUrl(latest.repository_url, repository) || !apiUrl(latest.deployment_url, path)
                || !apiUrl(latest.url, `${path}/statuses/${latest.id}`) || !approvedEnvironmentUrl(latest.environment_url)) return null
            return { sha: deployment.sha, deploymentId: deployment.id, id: latest.id, time: latest.time, createdAt: latest.created_at }
        }))).filter(Boolean).sort(newest)
        const selected = successful[0]
        if (!selected) throw failure('no approved successful production deployment in the latest 20 records')

        const { data: main } = await get(`${repository}/branches/main`, 'protected main')
        if (!record(main) || main.name !== 'main' || main.protected !== true || !record(main.commit) || !isSha(main.commit.sha)) {
            throw failure('protected main approval is unconfirmed')
        }
        const { data: comparison } = await get(`${repository}/compare/${selected.sha}...${main.commit.sha}?per_page=1`, 'main ancestry')
        if (!record(comparison) || !['identical', 'ahead'].includes(comparison.status)
            || comparison.base_commit?.sha !== selected.sha || comparison.merge_base_commit?.sha !== selected.sha
            || comparison.behind_by !== 0 || !Number.isSafeInteger(comparison.ahead_by) || comparison.ahead_by < 0
            || (comparison.status === 'identical' && (comparison.ahead_by !== 0 || main.commit.sha !== selected.sha))
            || (comparison.status === 'ahead' && (comparison.ahead_by === 0 || main.commit.sha === selected.sha))) {
            throw failure('production commit is not approved by protected main ancestry')
        }
        return { sha: selected.sha, deploymentId: selected.deploymentId, statusId: selected.id, statusCreatedAt: selected.createdAt }
    } finally {
        clearTimeout(overallTimer)
        overall.abort()
    }
}
