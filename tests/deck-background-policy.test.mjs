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
const read = filename => readFileSync(path.join(root, filename), 'utf8')

function loadTypeScript(filename, dependencies = {}) {
    const result = ts.transpileModule(read(filename), {
        fileName: filename,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
        },
    })
    const compiledModule = { exports: {} }
    new Function('require', 'module', 'exports', result.outputText)(
        name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
        compiledModule, compiledModule.exports,
    )
    return compiledModule.exports
}

const routes = loadTypeScript('src/lib/tahoe-glass/route-boundaries.ts')
const deck = loadTypeScript('src/lib/deck-background.ts')

test('identity, public profiles and profile preview retain the animated source', () => {
    for (const pathname of [
        '/', '/sign-in', '/sign-up', '/preview',
        '/ramin', '/john', '/fixture-profile', '/fixture_with_underscores',
    ]) {
        assert.equal(routes.routeUsesDeckBackground(pathname), false, pathname)
        if (pathname !== '/') assert.equal(routes.routeUsesDeckBackground(`${pathname}/`), false, `${pathname}/`)
    }
})

test('application pages never masquerade as public profiles and nested tools use the deck', () => {
    for (const pathname of [
        '/admin', '/deity', '/earnings', '/news/feed', '/reset-password', '/set-password',
        '/products/fixture-offering', '/dashboard', '/dashboard/security',
        '/dashboard/products/fixture-offering/creator', '/ramin/privacy',
        '/film/razinflix', '/places/dubai',
    ]) {
        assert.equal(routes.routeUsesDeckBackground(pathname), true, pathname)
        assert.equal(routes.routeUsesDeckBackground(`${pathname}/`), true, `${pathname}/`)
    }
})

test('Dreamsea identity and diagnostic demos remain unchanged', () => {
    for (const pathname of [
        '/dreamsea', '/dreamsea/privacy', '/dreamsea/prompts',
        '/glass-reference', '/glass-candidate',
    ]) assert.equal(routes.routeUsesDeckBackground(pathname), false, pathname)
    assert.equal(routes.routeOwnsTahoeScene('/film/razinflix'), true)
    assert.equal(routes.routeOwnsTahoeScene('/places/dubai'), true)
    assert.equal(routes.routeOwnsTahoeScene('/dreamsea/privacy'), true)
})

function renderEnvironment(pathname) {
    let vantaRenders = 0
    let providerProps
    const { default: Environment } = loadTypeScript('src/components/providers/NSSOTahoeGlassEnvironment.tsx', {
        'next/navigation': { usePathname: () => pathname },
        '@/components/VantaBackground': {
            __esModule: true,
            default: () => { vantaRenders += 1; return React.createElement('div', { 'data-fixture-vanta': true }) },
        },
        '@/components/providers/TahoeGlassProvider': {
            TahoeGlassProvider: props => {
                providerProps = props
                return React.createElement('section', { 'data-fixture-provider': true }, props.scene, props.children)
            },
        },
        '@/components/ui/DimmingOverlay': { __esModule: true, default: () => null },
        '@/lib/tahoe-glass/route-boundaries': routes,
        '@/lib/deck-background': deck,
    })
    const html = renderToStaticMarkup(React.createElement(Environment, null, React.createElement('main', null, 'Preserved page content')))
    return { html, providerProps, vantaRenders }
}

test('cold static routes do not mount Vanta and feed identical original pixels to the glass renderer', () => {
    for (const pathname of ['/admin', '/deity', '/earnings', '/products/fixture-offering', '/dashboard', '/dashboard/security', '/dashboard/products/fixture-offering/creator']) {
        const { html, providerProps, vantaRenders } = renderEnvironment(pathname)
        assert.equal(vantaRenders, 0, pathname)
        assert.match(html, /data-nsso-deck-background="true"/)
        assert.match(html, /Preserved page content/)
        assert.equal(providerProps.sourceLabel, 'nsso-deck-blue')
        assert.equal(providerProps.sceneStyle.backgroundColor, '#43628c')
        assert.equal(providerProps.webglSource, deck.DECK_BACKGROUND_IMAGE_SOURCE)
        assert.equal(providerProps.webglSource.kind, 'image')
        assert.equal(providerProps.webglSource.fit, 'cover')
        assert.equal(providerProps.webglSource.src, deck.DECK_BACKGROUND_ASSET)
        assert.equal(providerProps.scene.props.style.backgroundImage, `url('${deck.DECK_BACKGROUND_ASSET}')`)
        assert.doesNotMatch(html, /siri-gradient|vanta-bg|<script/)
    }
})

test('excluded profile routes still mount their source and route-owned tools are not wrapped twice', () => {
    for (const pathname of ['/', '/sign-in', '/sign-up', '/preview', '/fixture-profile', '/glass-candidate', '/dreamsea/prompts']) {
        const { html, providerProps, vantaRenders } = renderEnvironment(pathname)
        assert.equal(vantaRenders, 1, pathname)
        assert.equal(providerProps.sourceLabel, 'vanta-clouds')
        assert.equal(providerProps.webglSource.kind, 'canvas')
        assert.doesNotMatch(html, /data-nsso-deck-background/)
    }
    for (const pathname of ['/film/razinflix', '/places/dubai', '/dreamsea/privacy']) {
        const { html, providerProps, vantaRenders } = renderEnvironment(pathname)
        assert.equal(vantaRenders, 0, pathname)
        assert.equal(providerProps, undefined)
        assert.equal(html, '<main>Preserved page content</main>')
    }
})

test('profile editor keeps the static deck across its query views without changing profile preview', () => {
    // usePathname excludes query strings, so changing dashboard views must not
    // reintroduce the cloud source or change the shared provider identity.
    for (const url of ['/dashboard', '/dashboard/', '/dashboard?view=profile', '/dashboard?view=my-nsso', '/dashboard?view=earnings', '/dashboard?claim=fixture-profile']) {
        const pathname = new URL(url, 'https://nsso.test').pathname
        assert.equal(routes.routeUsesDeckBackground(pathname), true, url)
        const { html, providerProps, vantaRenders } = renderEnvironment(pathname)
        assert.equal(vantaRenders, 0, url)
        assert.match(html, /data-nsso-deck-background="true"/)
        assert.equal(providerProps.webglSource, deck.DECK_BACKGROUND_IMAGE_SOURCE)
        assert.equal(providerProps.sourceLabel, 'nsso-deck-blue')
    }
    assert.equal(routes.routeUsesDeckBackground('/preview'), false)
    assert.equal(routes.routeUsesDeckBackground('/fixture-profile'), false)
})

test('route changes do not key and remount the shared provider or page content', () => {
    const source = ts.createSourceFile('NSSOTahoeGlassEnvironment.tsx', read('src/components/providers/NSSOTahoeGlassEnvironment.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let providerCount = 0
    function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const keys = node.attributes.properties.filter(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'key')
            assert.equal(keys.length, 0, 'Neither shared provider nor page content may acquire a route-derived key.')
            if (node.tagName.getText(source) === 'TahoeGlassProvider') providerCount += 1
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    assert.equal(providerCount, 1)
})
