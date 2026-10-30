import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { buildSync } from 'esbuild'
import ts from 'typescript'

const providerPath = 'src/components/providers/TahoeGlassProvider.tsx'
const source = readFileSync(providerPath, 'utf8')
const tree = ts.createSourceFile(providerPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function findNode(predicate) {
    let result
    function visit(node) {
        if (!result && predicate(node)) result = node
        ts.forEachChild(node, visit)
    }
    visit(tree)
    assert(result, 'Production provider contract was not found')
    return result
}

const registration = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === 'registerSurface')
const fieldKey = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === 'fieldKey')
const fieldGeneration = findNode(node => ts.isIfStatement(node) && node.expression.getText(tree) === '!runtime.field || runtime.fieldKey !== fieldKey')
const opticsBundle = buildSync({
    entryPoints: ['src/lib/tahoe-glass/optics.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', target: 'node24',
}).outputFiles[0].text
const cacheBundle = buildSync({ entryPoints: ['src/lib/tahoe-glass/field-cache.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text

function harness() {
    const registry = new Map()
    const renders = []
    let generatedFields = 0
    const opticsContext = vm.createContext({
        module: { exports: {} },
        document: {
            createElement(type) {
                assert.equal(type, 'canvas')
                generatedFields++
                return {
                    getContext() {
                        return {
                            createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) } },
                            putImageData() {},
                        }
                    },
                }
            },
        },
    })
    vm.runInContext(opticsBundle, opticsContext)
    const cacheContext = vm.createContext({ module: { exports: {} } })
    vm.runInContext(cacheBundle, cacheContext)
    const context = vm.createContext({
        React: { useCallback: callback => callback },
        registryRef: { current: registry },
        surfaceResizeObserverRef: { current: null },
        intersectionObserverRef: { current: null },
        diagnosticsRef: { current: {} },
        writeSurfaceDiagnostics() {}, refreshCounts() {},
        requestRender(reason) { renders.push(reason) },
        createTahoeDisplacementField: opticsContext.module.exports.createTahoeDisplacementField,
        fieldCacheRef: { current: new cacheContext.module.exports.TahoeDisplacementFieldCache() },
    })
    // Execute the actual production registration callback, cache key, and
    // generation branch. Only React scheduling and the canvas sink are mocked.
    const executable = ts.transpileModule(`
        const registerSurface = ${registration.initializer.getText(tree)};
        function renderField(runtime, fieldDpr = 1) {
            const rect = runtime.rect;
            const fieldKey = ${fieldKey.initializer.getText(tree)};
            ${fieldGeneration.getText(tree)}
            return runtime.field;
        }
        ({ registerSurface, renderField });
    `, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText
    const api = vm.runInContext(executable, context)
    return { ...api, registry, renders, generatedFields: () => generatedFields }
}

function measure(runtime) {
    runtime.rect = { width: 342, height: 830 }
    return runtime
}

function assertUniform(field, pixel) {
    for (let offset = 0; offset < field.data.length; offset += 4) {
        assert.deepEqual(Array.from(field.data.slice(offset, offset + 4)), pixel)
    }
}

test('unconfigured provider surfaces retain the existing convex field and defaults', () => {
    const app = harness()
    app.registerSurface('legacy-card', {})
    const runtime = measure(app.registry.get('legacy-card'))
    assert.equal(runtime.displacementProfile, 'convex')
    assert.equal(runtime.refractive, true)
    assert.equal(runtime.continuous, false)
    assert.equal(runtime.priority, null)
    const field = app.renderField(runtime, 0.25)
    const middle = (Math.floor(field.pixelHeight / 2) * field.pixelWidth + Math.floor(field.pixelWidth / 2)) * 4
    assert.equal(field.data[middle + 3], 255)
    assert.equal(field.data[3], 0)
    assert(field.data.some((channel, index) => index % 4 < 2 && channel !== 128), 'The default convex bend must not be flattened')
})

test('explicit auth prism survives provider fallback as a contour-free field', () => {
    const app = harness()
    app.registerSurface('auth-card', {}, { displacementProfile: 'prism-top' })
    const runtime = measure(app.registry.get('auth-card'))
    const field = app.renderField(runtime, 0.25)
    assertUniform(field, [128, 144, 128, 255])
    assert(runtime.fieldKey.endsWith(':prism-top'))
    assert.equal(app.renderField(runtime, 0.25), field, 'Stable profile/geometry must reuse its field')
    assert.equal(app.generatedFields(), 1)
})

test('changing only the profile invalidates registration and cached field', () => {
    const app = harness()
    const element = {}
    app.registerSurface('card', element, { continuous: true, priority: 7, refractive: false })
    const runtime = measure(app.registry.get('card'))
    const convex = app.renderField(runtime, 0.25)
    runtime.drawn = true
    app.registerSurface('card', element, { continuous: true, priority: 7, refractive: false, displacementProfile: 'prism-bottom' })
    assert.equal(app.registry.get('card'), runtime)
    assert.equal(runtime.fieldKey, '')
    assert.equal(runtime.drawn, false)
    assert.equal(runtime.continuous, true)
    assert.equal(runtime.priority, 7)
    assert.equal(runtime.refractive, false)
    assert.equal(app.renders.at(-1), 'surface-options-change')
    const prism = app.renderField(runtime, 0.25)
    assert.notEqual(prism, convex)
    assertUniform(prism, [128, 112, 128, 255])
    assert.equal(app.generatedFields(), 2)
    const renderCount = app.renders.length
    app.registerSurface('card', element, { continuous: true, priority: 7, refractive: false, displacementProfile: 'prism-bottom' })
    assert.equal(app.renders.length, renderCount, 'Identical registration must not schedule a repaint')
    app.registerSurface('card', element)
    assert.equal(runtime.displacementProfile, 'convex')
    assert.deepEqual(Array.from(app.renderField(runtime, 0.25).data), Array.from(convex.data), 'Returning to defaults must restore the exact legacy field')
})

test('provider paint signatures distinguish optical profiles at unchanged geometry', () => {
    const signature = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === 'nextPaintSignature')
    const executable = ts.transpileModule(`(paintEntries) => ${signature.initializer.getText(tree)}`, {
        compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const createSignature = vm.runInNewContext(executable)
    const entry = { runtime: { id: 'same-card', refractive: true, opacity: 1, displacementProfile: 'convex' }, priority: 0, stackingChain: [] }
    const before = createSignature([entry])
    entry.runtime.displacementProfile = 'prism-top'
    assert.notEqual(createSignature([entry]), before)
})

test('shared geometry never aliases distinct fractional dimensions or DPR that share legacy rounded keys', () => {
    const app = harness()
    app.registerSurface('first', {})
    app.registerSurface('second', {})
    const first = measure(app.registry.get('first'))
    const second = measure(app.registry.get('second'))
    first.rect.width = 342.001
    second.rect.width = 342.004
    const firstField = app.renderField(first, 0.7499)
    const secondField = app.renderField(second, 0.7501)
    assert.equal(first.fieldKey, second.fieldKey, 'The old per-surface keys deliberately collide in this regression')
    assert.notEqual(firstField, secondField)
    assert.equal(firstField.cssWidth, 342.001)
    assert.equal(secondField.cssWidth, 342.004)
    assert.equal(firstField.dpr, 0.7499)
    assert.equal(secondField.dpr, 0.7501)
    assert.equal(app.generatedFields(), 2)
})
