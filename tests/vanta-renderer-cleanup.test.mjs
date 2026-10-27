import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual component's effect teardown, not a second implementation
// of it. Real-browser tests separately prove disposal of the captured renderer,
// empty GPU resource caches, and a distinct rendering context on profile return.
const source = readFileSync(new URL('../src/components/VantaBackground.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('VantaBackground.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const cleanups = []
function visit(node) {
    if (ts.isArrowFunction(node) && ts.isBlock(node.body) && node.body.getText(ast).includes('effect.destroy()') && node.body.statements.some(statement =>
        ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
            declaration.name.getText(ast) === 'effect' && declaration.initializer?.getText(ast) === 'vantaEffect.current',
        ),
    )) cleanups.push(node.getText(ast))
    ts.forEachChild(node, visit)
}
visit(ast)
assert.equal(cleanups.length, 1, 'Exactly one owned Vanta initialization teardown must exist')
const javascript = ts.transpileModule(`const release = ${cleanups[0]}; release`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

function fixture({ destroyError = false, disposeError = false, rendererPresent = true, effectPresent = true } = {}) {
    const calls = []
    const renderer = {
        dispose() { calls.push('dispose'); if (disposeError) throw new Error('Synthetic renderer disposal failure') },
        forceContextLoss() { calls.push('lose-context') },
    }
    const vantaEffect = { current: null }
    const effect = {
        renderer: rendererPresent ? renderer : undefined,
        req: 17,
        afterRender() { throw new Error('A removed source must never publish another frame') },
        destroy() {
            assert.equal(this.afterRender, undefined)
            assert.equal(vantaEffect.current, null)
            assert(calls.includes('cancel-frame:17'))
            calls.push('destroy')
            this.renderer = null // The pinned vendor discards this reference.
            if (destroyError) throw new Error('Synthetic vendor destruction failure')
        },
    }
    vantaEffect.current = effectPresent ? effect : null
    const pausedForReducedMotionRef = { current: true }
    const resumeAfterCurrentFrameRef = { current: true }
    const listener = () => {}
    const release = vm.runInNewContext(javascript, {
        initTimer: 42,
        loadListeners: [{ script: { removeEventListener(event, callback) { assert.equal(event, 'load'); assert.equal(callback, listener); calls.push('remove-script-listener') } }, listener }],
        onCanvasChangeRef: { current(canvas) { assert.equal(canvas, null); calls.push('clear-source') } },
        pausedForReducedMotionRef, resumeAfterCurrentFrameRef, vantaEffect,
        window: {
            clearTimeout(timer) { calls.push(`clear-timer:${timer}`) },
            cancelAnimationFrame(frame) { calls.push(`cancel-frame:${frame}`) },
        },
    })
    return { release, calls, renderer, effect, vantaEffect, pausedForReducedMotionRef, resumeAfterCurrentFrameRef }
}

test('Vanta teardown stops callbacks and RAF before destroying and releasing only its captured renderer', () => {
    const state = fixture()
    state.release()
    assert.deepEqual(state.calls, ['clear-timer:42', 'remove-script-listener', 'clear-source', 'cancel-frame:17', 'destroy', 'dispose'])
    assert.equal(state.effect.renderer, null)
    assert.equal(state.vantaEffect.current, null)
    assert.equal(state.pausedForReducedMotionRef.current, false)
    assert.equal(state.resumeAfterCurrentFrameRef.current, false)
})

test('a vendor destruction failure still disposes the captured owned renderer', () => {
    const state = fixture({ destroyError: true })
    assert.throws(state.release, /Synthetic vendor destruction failure/)
    assert.deepEqual(state.calls.slice(-2), ['destroy', 'dispose'])
    assert.equal(state.vantaEffect.current, null)
})

test('a renderer disposal failure clears component ownership without forcing synchronous driver loss', () => {
    const state = fixture({ disposeError: true })
    assert.throws(state.release, /Synthetic renderer disposal failure/)
    assert.deepEqual(state.calls.slice(-2), ['destroy', 'dispose'])
    assert.equal(state.vantaEffect.current, null)
    assert(!state.calls.includes('lose-context'))
})

test('teardown tolerates a partially initialized effect without a renderer', () => {
    const state = fixture({ rendererPresent: false })
    state.release()
    assert.equal(state.vantaEffect.current, null)
    assert.equal(state.calls.at(-1), 'destroy')
    assert(!state.calls.includes('dispose'))
    assert(!state.calls.includes('lose-context'))
})

test('teardown clears timers, script listeners and canvas ownership even if initialization never completed', () => {
    const state = fixture({ effectPresent: false })
    state.release()
    assert.deepEqual(state.calls, ['clear-timer:42', 'remove-script-listener', 'clear-source'])
    assert.equal(state.pausedForReducedMotionRef.current, false)
    assert.equal(state.resumeAfterCurrentFrameRef.current, false)
})
