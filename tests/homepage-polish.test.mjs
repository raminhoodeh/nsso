import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const load = filename => ts.createSourceFile(filename, readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const opening = node => ts.isJsxElement(node) ? node.openingElement : node
const tag = (node, source) => opening(node).tagName.getText(source)
function attributes(node, source) {
    return new Map(opening(node).attributes.properties.filter(ts.isJsxAttribute).map(attribute => {
        const value = attribute.initializer
        return [attribute.name.getText(source), !value ? true : ts.isStringLiteral(value) ? value.text : ts.isJsxExpression(value) ? value.expression?.getText(source) : value.getText(source)]
    }))
}
function elements(node) {
    const found = []
    function visit(child) {
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) found.push(child)
        ts.forEachChild(child, visit)
    }
    visit(node)
    return found
}
function text(node) {
    const parts = []
    function visit(child) {
        if (ts.isJsxText(child)) parts.push(child.text)
        else if (ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression)) parts.push(child.expression.text)
        else ts.forEachChild(child, visit)
    }
    visit(node)
    return parts.join(' ').replace(/\s+/g, ' ').trim()
}
function marked(source, name) {
    const matches = elements(source).filter(node => attributes(node, source).get(name) === 'true')
    assert.equal(matches.length, 1, `Expected one ${name} landmark`)
    return matches[0]
}
const home = load('src/app/page.tsx')

test('opening words stay in one plain, white, in-flow typographic hero, outside the cards and claim form', () => {
    const hero = marked(home, 'data-home-hero')
    const classes = attributes(hero, home).get('className') || ''
    assert.doesNotMatch(classes, /(?:^|\s)(?:[^\s:]+:)*(?:bg-|border(?:-|\s)|rounded-|shadow-|backdrop-|fixed\b|absolute\b)/)
    const descendants = elements(hero)
    assert.equal(descendants.filter(node => /(?:Glass|Panel|HomeProfileClaim|HomeProfileDemo)/.test(tag(node, home))).length, 0)
    assert.ok(descendants.some(node => /(?:^|\s)text-white(?:\s|$)/.test(attributes(node, home).get('className') || '')) || /(?:^|\s)text-white(?:\s|$)/.test(classes), 'Opening typography must remain white on the scene.')
    assert.equal(descendants.filter(node => tag(node, home) === 'h1').length, 1)
    const copy = text(hero)
    let cursor = -1
    for (const word of ['Clarify', 'Organise', 'Future-Proof Yourself', 'Present', 'Discover']) {
        const next = copy.indexOf(word)
        assert.ok(next > cursor, `Missing or reordered opening word: ${word}`)
        cursor = next
    }
})

test('the shared sign-in material is a pure visual wrapper with a uniform, contour-free light panel', () => {
    const panel = load('src/components/ui/LightGlassPanel.tsx')
    const surfaces = elements(panel).filter(node => tag(node, panel) === 'TahoeBackdropSurface')
    assert.equal(surfaces.length, 1)
    const props = attributes(surfaces[0], panel)
    for (const [name, value] of [['variant', 'card'], ['radius', '40'], ['tone', 'dark'], ['displacementProfile', 'prism-top'], ['materialLighting', 'uniform'], ['data-light-glass-panel', 'true']]) {
        assert.equal(props.get(name), value, name)
    }
    assert.doesNotMatch(panel.text, /(?:createClient|useRouter|useSearchParams|localStorage|sessionStorage|fetch\()/)
    const auth = load('src/components/auth/AuthPageShell.tsx')
    assert.equal(tag(marked(auth, 'data-auth-card'), auth), 'LightGlassPanel')
})

test('one light intro contains the heading, inline demo, then both approved body paragraphs', () => {
    const intro = marked(home, 'data-home-intro')
    assert.equal(tag(intro, home), 'LightGlassPanel')
    const children = elements(intro)
    const tagline = children.find(node => /^h[1-6]$|^p$/.test(tag(node, home)) && text(node) === 'The most beautiful way to present yourself online')
    const title = children.find(node => tag(node, home) === 'h2' && text(node) === 'All of you. All in one place.')
    const demos = children.filter(node => tag(node, home) === 'HomeProfileDemo')
    const story = marked(home, 'data-home-story')
    assert.ok(tagline && title)
    assert.equal(demos.length, 1)
    assert.ok(title.pos < tagline.pos && tagline.pos < demos[0].pos && demos[0].pos < story.pos)
    assert.ok(story.pos > intro.pos && story.end < intro.end, 'Body copy must stay inside the same intro panel.')
    const paragraphs = elements(story).filter(node => tag(node, home) === 'p')
    assert.equal(paragraphs.length, 2)
    assert.match(text(paragraphs[0]), /nsso stands for "new sovereign self online"/)
    assert.match(text(paragraphs[0]), /link-in-bio tool, professional Resumé, and personal shop/)
    assert.match(text(paragraphs[0]), /turn your followers into customers/)
    assert.match(text(paragraphs[1]), /nsso embodies a vision to revolutionize/)
    assert.match(text(paragraphs[1]), /work, passions, and aspirations - in one holistic place/)
    assert.doesNotMatch(attributes(story, home).get('className') || '', /\btext-white(?:\/|\b)/)
    assert.equal(elements(home).filter(node => tag(node, home) === 'HomeProfileDemo').length, 1, 'Moving the preview must not duplicate its media playback.')
})

test('one claim form follows the intro under the concise story heading instead of living in the hero', () => {
    const intro = marked(home, 'data-home-intro')
    const heading = elements(home).find(node => tag(node, home) === 'h2' && text(node) === 'Your whole story in one profile')
    const claims = elements(home).filter(node => tag(node, home) === 'HomeProfileClaim')
    assert.ok(heading)
    assert.equal(claims.length, 1)
    assert.ok(intro.end < heading.pos && heading.end < claims[0].pos)
    assert.doesNotMatch(home.text, /Your whole story starts with one profile|Choose your profile name ↑/)
})

test('supporting homepage cards share the light language and preserve a filled, dark-label end CTA', () => {
    const panels = elements(home).filter(node => tag(node, home) === 'LightGlassPanel')
    assert.ok(panels.length >= 3, 'Intro, Monetise and Example Profile must use the same shared panel.')
    assert.equal(elements(home).filter(node => tag(node, home) === 'ProfileGlassCard').length, 0, 'The public identity-product profile renderer is not the homepage light-material contract.')
    const cta = marked(home, 'data-home-create-profile')
    assert.ok(cta)
    assert.equal(tag(cta, home), 'TahoeGlassSurface')
    assert.equal(text(cta), 'Create your nsso profile')
    const props = attributes(cta, home)
    assert.equal(props.get('as'), 'a')
    assert.equal(props.get('variant'), 'button')
    assert.equal(props.get('tone'), 'dark')
    assert.equal(props.get('semanticTint'), 'light')
    assert.ok(Number(props.get('semanticTintOpacity')) > 0, 'The final CTA must retain an explicit material fill.')
})
