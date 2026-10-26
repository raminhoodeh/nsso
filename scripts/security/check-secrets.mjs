import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function secretKinds(text) {
    const kinds = []
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) kinds.push('private-key')
    if (/AIza[A-Za-z0-9_-]{35}/.test(text)) kinds.push('google-api-key')
    if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})/.test(text)) kinds.push('github-token')
    if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}/.test(text)) kinds.push('provider-key')
    for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g)) {
        try { if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString()).role === 'service_role') kinds.push('supabase-service-key') } catch { /* Not a JWT. */ }
    }
    return [...new Set(kinds)]
}
export async function scanTracked(repo) {
    const files = execFileSync('git',['ls-files','-z'],{cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean)
    const findings = []
    for (const file of files) {
        let data
        try { data = await readFile(resolve(repo,file)) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
        if (data.includes(0) || data.length > 20*1024*1024) continue
        const kinds = secretKinds(data.toString('utf8'))
        if (kinds.length) findings.push({file,kinds}) // Never print a matched credential.
    }
    return findings
}
if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
    const repo = resolve(fileURLToPath(new URL('../..',import.meta.url)))
    const findings = await scanTracked(repo)
    if (findings.length) { console.error(JSON.stringify({code:'SECRET_SCAN_FAILED',findings}));process.exitCode=1 }
    else console.log('Tracked text secret scan passed; no credential values logged.')
}
