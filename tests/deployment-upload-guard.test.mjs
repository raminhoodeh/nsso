import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const uploadRules = readFileSync(path.join(root, '.vercelignore'), 'utf8')
const meaningfulRules = text => text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))

test('deployment exclusions retain every private and generated-file protection from .gitignore', () => {
    const gitRules = meaningfulRules(readFileSync(path.join(root, '.gitignore'), 'utf8'))
    const vercelRules = new Set(meaningfulRules(uploadRules))
    for (const rule of gitRules) assert.ok(vercelRules.has(rule), `Missing deployment exclusion or exception: ${rule}`)
})

test('deployment ignore grammar blocks local data without excluding cloud build inputs', t => {
    // The CLI uses gitignore-style rules. Exercise those rules independently of
    // this checkout's .gitignore so its protections cannot hide a missing guard.
    const fixture = mkdtempSync(path.join(tmpdir(), 'nsso-upload-guard-'))
    t.after(() => rmSync(fixture, { recursive: true, force: true }))
    const env = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' }
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_TEMPLATE_DIR']) delete env[name]
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '--quiet'], { cwd: fixture, env })
    writeFileSync(path.join(fixture, '.gitignore'), uploadRules)

    const blocked = [
        'private', 'private/', 'private/test-results/signed-in-session.json', 'private/test-results/mobile.png',
        'nsso agent context database/identity-notes.md', '.env', '.env.local', '.env.production',
        '.env.production.local', 'src/.env.secret', '.mcp.json', 'supabase/.temp/project-ref',
        'test-results/result.json', 'playwright-report/index.html', 'coverage/lcov.info',
        '.next/server/app/index.html', 'out/index.html', 'build/index.js', 'node_modules/pkg/index.js',
        '.pnp', '.pnp.cjs', '.yarn/cache/dependency.zip', '.vercel/project.json', '.git/config',
        '.vscode/settings.json', '.idea/workspace.xml', '.cursor/mcp.json', '.claude/settings.local.json', '.codex/session.json',
        'tmp/screenshot.png', 'temp/browser-state.json', '.tmp/debug.json', 'generated/local-report.json',
        'diagnostic.log', 'nested/diagnostic.log', 'session.tmp', 'draft.bak', '.editor.swp', 'draft~',
        '.DS_Store', 'private-key.pem', '.places-geocode-cache.json', 'npm-debug.log.1', 'yarn-error.log',
        '.pnpm-debug.log.1', 'tsconfig.tsbuildinfo', 'next-env.d.ts', 'check_local.sql', 'test_local.sql',
        'verify_local.sql', 'clear_film_data.sql', 'test_db.js', 'check_models.js', 'update_products_urls.py',
        'src/app/dashboard/page.tsx.backup', 'liquid-glass-js-main/index.js', 'liquid-logo-main/index.js',
        'src/lib/liquid-glass/vendor.js',
    ]
    const required = [
        '.env.example', '.vercelignore', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json',
        'postcss.config.mjs', 'src/app/page.tsx', 'src/app/dashboard/page.tsx', 'src/components/ui/Input.tsx',
        'public/assets/nsso-logo.png', 'public/vendor/vanta-0.5.24/LICENSE', 'public/homepage-video.mp4',
        'public/.well-known/apple-developer-merchantid-domain-association',
        'scripts/security/build-with-csp.mjs', 'scripts/security/check-secrets.mjs',
        'supabase/config.toml', 'supabase/migrations/20261026152224_nsso_retrieval_bounds.sql',
        '.github/workflows/verify.yml', '.yarn/patches/fix.patch', '.yarn/plugins/plugin.cjs',
        '.yarn/releases/yarn.cjs', '.yarn/versions/version.yml',
        ...execFileSync('git', ['ls-files', '-z', '--', 'src', 'public', 'scripts', 'supabase'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean),
    ]
    const candidates = [...new Set([...blocked, ...required])]
    const result = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
        cwd: fixture, env, encoding: 'utf8', input: candidates.join('\0') + '\0',
    })
    assert.ok(result.status === 0 || result.status === 1, result.stderr || 'git check-ignore failed')
    const ignored = new Set(result.stdout.split('\0').filter(Boolean))
    for (const filename of blocked) assert.ok(ignored.has(filename), `Local-only file would be uploaded: ${filename}`)
    for (const filename of required) assert.ok(!ignored.has(filename), `Required cloud build input was excluded: ${filename}`)
})
