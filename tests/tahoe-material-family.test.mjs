import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function loadSurface(filename, dependencies) {
    const result = ts.transpileModule(readFileSync(path.join(root, filename), 'utf8'), {
        fileName: filename,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
        },
    })
    const compiled = { exports: {} }
    new Function('require', 'module', 'exports', result.outputText)(
        name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
        compiled, compiled.exports,
    )
    return compiled.exports
}

const EngineContext = React.createContext(null)
const DirectBoundaryContext = React.createContext(false)
const activeDiagnostics = {
    status: 'active', backend: 'svg', source: 'fixture-scene', reducedMotion: false,
}
const dependencies = {
    '@/components/providers/TahoeGlassProvider': {
        TahoeGlassEngineContext: EngineContext,
        useTahoeGlassDiagnostics: () => React.useContext(EngineContext)?.diagnostics ?? activeDiagnostics,
    },
    '@/components/ui/tahoe-glass/TahoeGlassBoundaryContext': {
        TahoeGlassDirectBackdropBoundaryContext: DirectBoundaryContext,
    },
    '@/lib/utils': { cn: (...values) => values.filter(value => typeof value === 'string').join(' ') },
    '@/lib/tahoe-glass/constants': { TAHOE_DISPLACEMENT_SCALE: 35, TAHOE_SPECULAR_SHADOW: 'none' },
    '@/lib/tahoe-glass/optics': {},
    '@/lib/tahoe-glass/nav-owned-scene-webgl': {},
    '@/lib/tahoe-glass/nav-platform': {},
    '@/lib/tahoe-glass/chrome-policy': { supportsChromeGlassGeometry: () => true },
    // Rendering routing fixture only: browser capability and pixel behavior
    // remain browser-test responsibilities.
    './ChromeGlassOptics': {
        useChromeGlassOptics: (_ref, eligible) => ({ enabled: eligible, ready: eligible, layers: null }),
    },
}
dependencies['./SuppliedGlassReadability'] = loadSurface('src/components/ui/tahoe-glass/SuppliedGlassReadability.tsx', dependencies)
dependencies['@/components/ui/apple-tahoe-liquid-glass-button'] = loadSurface('src/components/ui/apple-tahoe-liquid-glass-button.tsx', dependencies)
const { TahoeGlassSurface } = loadSurface('src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', dependencies)
const { TahoeBackdropSurface } = loadSurface('src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx', dependencies)

function renderWithFamily(Component, props = {}, materialFamily = 'supplied', diagnostics = activeDiagnostics) {
    function BoundaryProbe() {
        return React.createElement('span', { 'data-direct-boundary': String(React.useContext(DirectBoundaryContext)) })
    }
    return renderToStaticMarkup(React.createElement(EngineContext.Provider, {
        value: { materialFamily, diagnostics },
    }, React.createElement(Component, props, React.createElement(BoundaryProbe))))
}

test('the separate reading layer is limited to dark copy on the supplied active WebGL path', () => {
    for (const Component of [TahoeGlassSurface, TahoeBackdropSurface]) {
        for (const [status, backend] of [['active', 'svg'], ['active', 'webgl'], ['fallback', 'css-blur'], ['fallback', 'solid']]) {
            const diagnostics = { ...activeDiagnostics, status, backend }
            const html = renderWithFamily(Component, { tone: 'dark' }, 'supplied', diagnostics)
            assert.equal((html.match(/data-tahoe-control-readability="true"/g) || []).length, status === 'active' && backend === 'webgl' ? 1 : 0)
            assert.equal((html.match(/data-supplied-glass-layer=/g) || []).length, 2)
        }
        const candidate = renderWithFamily(Component, { tone: 'dark' }, 'candidate', { ...activeDiagnostics, backend: 'webgl' })
        assert.doesNotMatch(candidate, /data-tahoe-control-readability=/)
    }
})

test('core shared surface metadata distinguishes supplied optics from the candidate override', () => {
    const supplied = renderWithFamily(TahoeGlassSurface)
    assert.match(supplied, /data-tahoe-material-family="supplied"/)
    assert.match(supplied, /data-tahoe-optical-engine="supplied-shared"/)
    assert.match(supplied, /data-tahoe-material-implementation="supplied-original"/)
    assert.doesNotMatch(supplied, /data-tahoe-chromium-optics=/)

    const candidate = renderWithFamily(TahoeGlassSurface, { materialFamily: 'candidate' })
    assert.match(candidate, /data-tahoe-material-family="candidate"/)
    assert.match(candidate, /data-tahoe-optical-engine="candidate-chromium"/)

    const candidateFallback = renderWithFamily(TahoeGlassSurface, { materialFamily: 'candidate', variant: 'pill' })
    assert.match(candidateFallback, /data-tahoe-material-family="candidate"/)
    assert.match(candidateFallback, /data-tahoe-optical-engine="candidate-shared-fallback"/)
    assert.match(candidateFallback, /data-tahoe-material-implementation="derived"/)
    assert.doesNotMatch(candidateFallback, /data-tahoe-optical-engine="supplied-shared"/)
})

test('supplied panes leave nested native lenses on the one shared renderer', () => {
    const html = renderWithFamily(TahoeBackdropSurface, { displacementProfile: 'prism-top' })
    assert.match(html, /data-tahoe-optical-engine="supplied-shared"/)
    assert.match(html, /data-tahoe-direct-backdrop-enabled="false"/)
    assert.match(html, /data-direct-boundary="false"/)
    assert.match(html, /data-tahoe-refraction-backend="svg-owned-scene"/)
    assert.match(html, /data-tahoe-refraction-scope="owned-scene-only"/)
    assert.match(html, /data-tahoe-displacement-profile="prism-top"/)
    assert.doesNotMatch(html, /<svg|<canvas/)
})

test('navbar retains the explicit candidate path until its supplied override is selected', () => {
    const candidate = renderWithFamily(TahoeBackdropSurface, { as: 'header' })
    assert.match(candidate, /^<header/)
    assert.match(candidate, /data-tahoe-material-family="candidate"/)
    assert.match(candidate, /data-tahoe-optical-engine="candidate-chromium"/)
    assert.match(candidate, /data-tahoe-material-implementation="derived"/)
    assert.doesNotMatch(candidate, /data-supplied-glass-layer=/)
    assert.match(candidate, /data-direct-boundary="true"/)

    const supplied = renderWithFamily(TahoeBackdropSurface, { as: 'header', materialFamily: 'supplied' })
    assert.match(supplied, /data-tahoe-optical-engine="supplied-shared"/)
    assert.match(supplied, /data-direct-boundary="false"/)
})

test('legacy hosts keep their candidate selection and unhosted surfaces identify material fallback', () => {
    const candidate = renderToStaticMarkup(React.createElement(EngineContext.Provider, {
        value: { diagnostics: activeDiagnostics },
    }, React.createElement(TahoeGlassSurface)))
    assert.match(candidate, /data-tahoe-optical-engine="candidate-chromium"/)

    const fallback = renderToStaticMarkup(React.createElement(TahoeGlassSurface, { materialFamily: 'supplied' }))
    assert.match(fallback, /data-tahoe-material-family="supplied"/)
    assert.match(fallback, /data-tahoe-optical-engine="material-only"/)
})

test('supplied surfaces use one original coat and rim across renderer modes without dropping semantic tint', () => {
    for (const Component of [TahoeGlassSurface, TahoeBackdropSurface]) {
        for (const [status, backend, expectedMode, coatBackground] of [
            ['active', 'svg', 'svg', 'color-mix(in srgb, white 25%, transparent)'],
            ['active', 'webgl', 'webgl', 'transparent'],
            ['fallback', 'css-blur', 'blur', 'color-mix(in srgb, white 25%, transparent)'],
            ['fallback', 'solid', 'solid', 'Canvas'],
        ]) {
            const html = renderWithFamily(Component, { semanticTint: 'light', semanticTintOpacity: 0.06 }, 'supplied', {
                ...activeDiagnostics, status, backend,
            })
            assert.match(html, new RegExp(`data-tahoe-material-mode="${expectedMode}"`))
            assert.equal((html.match(/data-supplied-glass-layer="coat"/g) ?? []).length, 1)
            assert.equal((html.match(/data-supplied-glass-layer="rim"/g) ?? []).length, 1)
            assert.ok(html.includes(`background:${coatBackground};`), `${Component.displayName}: ${expectedMode}`)
            assert.match(html, /data-tahoe-glass-tint="light"/)
            assert.match(html, /opacity:0.06/)
            assert.match(html, /relative z-20/)
        }
    }
})
