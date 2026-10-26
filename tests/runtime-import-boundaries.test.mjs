import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runtimeImports(entrypoints) {
    const seen = new Set()
    const imports = new Set()
    const visit = file => {
        if (seen.has(file)) return
        seen.add(file)
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
        for (const statement of source.statements) {
            if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
            if (!statement.moduleSpecifier || statement.isTypeOnly || statement.importClause?.isTypeOnly) continue
            const name = statement.moduleSpecifier.text
            imports.add(name)
            const localPath = name.startsWith('@/')
                ? path.join(root, 'src', name.slice(2))
                : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
            if (!localPath) continue
            const resolved = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']
                .map(extension => localPath + extension)
                .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
            if (resolved && /\.[jt]sx?$/.test(resolved)) visit(resolved)
        }
    }
    entrypoints.forEach(entrypoint => visit(path.join(root, entrypoint)))
    return [...imports]
}

test('future wallet dependencies stay outside active authentication and global imports', () => {
    const imports = runtimeImports([
        'src/app/layout.tsx',
        'src/app/sign-in/page.tsx',
        'src/app/sign-up/page.tsx',
    ])
    assert.deepEqual(imports.filter(name => /^(wagmi|viem|@solana\/)/.test(name)), [])
})
