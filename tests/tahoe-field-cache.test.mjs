import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { buildSync } from 'esbuild'

const source = buildSync({ entryPoints: ['src/lib/tahoe-glass/field-cache.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text
const context = vm.createContext({ module: { exports: {} } })
vm.runInContext(source, context)
const { TahoeDisplacementFieldCache } = context.module.exports
const field = (width, height = 1) => ({ pixelWidth: width, pixelHeight: height, canvas: { width, height }, data: new Uint8ClampedArray(width * height * 4) })

test('identical immutable fields are shared without rerunning the pixel factory', () => {
    const cache = new TahoeDisplacementFieldCache()
    let calls = 0
    const create = () => { calls++; return field(4) }
    const first = cache.getOrCreate('width:height:dpr:convex', create)
    assert.equal(cache.getOrCreate('width:height:dpr:convex', create), first)
    assert.equal(calls, 1)
    assert.equal(cache.size, 1)
})

test('pixel and entry budgets evict least recently used fields without mutating live references', () => {
    const cache = new TahoeDisplacementFieldCache(2, 5)
    const first = cache.getOrCreate('a', () => field(2))
    cache.getOrCreate('b', () => field(2))
    assert.equal(cache.getOrCreate('a', () => assert.fail('a should be retained')), first)
    cache.getOrCreate('c', () => field(3))
    assert.equal(cache.size, 2)
    assert.equal(cache.pixels, 5)
    let generatedB = false
    cache.getOrCreate('b', () => { generatedB = true; return field(1) })
    assert.equal(generatedB, true)
    assert.ok(cache.size <= 2 && cache.pixels <= 5)
    assert.deepEqual(first.canvas, { width: 2, height: 1 })
    assert.equal(first.data.length, 8)
})

test('failed and oversized generations do not consume retained memory or poison retries', () => {
    const cache = new TahoeDisplacementFieldCache(4, 4)
    assert.equal(cache.getOrCreate('missing', () => null), null)
    assert.equal(cache.size, 0)
    const huge = cache.getOrCreate('large', () => field(9))
    assert.equal(huge.pixelWidth, 9)
    assert.equal(cache.size, 0)
    assert.equal(cache.pixels, 0)
    assert.equal(cache.getOrCreate('missing', () => field(2)).pixelWidth, 2)
    assert.equal(cache.size, 1)
})

test('provider disposal clears both budgets and another provider never inherits its fields', () => {
    const firstProvider = new TahoeDisplacementFieldCache()
    const first = firstProvider.getOrCreate('same-shape', () => field(2))
    firstProvider.clear()
    assert.equal(firstProvider.size, 0)
    assert.equal(firstProvider.pixels, 0)
    assert.notEqual(firstProvider.getOrCreate('same-shape', () => field(2)), first)
    const nextProvider = new TahoeDisplacementFieldCache()
    assert.notEqual(nextProvider.getOrCreate('same-shape', () => field(2)), first)
})
