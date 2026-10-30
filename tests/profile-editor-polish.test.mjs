import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { transformSync } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = filename => readFileSync(path.join(root, filename), 'utf8')
const source = filename => ts.createSourceFile(filename, read(filename), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const opening = node => ts.isJsxElement(node) ? node.openingElement : node
const tag = node => opening(node).tagName.getText()
function attribute(node, name) {
    const found = opening(node).attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText() === name)
    return found?.initializer && (ts.isStringLiteral(found.initializer) ? found.initializer.text : found.initializer.getText())
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

test('profile editing copy is warm and concise, with the first-1000 qualification retained', () => {
    const page = source('src/app/dashboard/page.tsx')
    assert.match(page.text, /Hey, wonderful/)
    assert.doesNotMatch(page.text, /Hey, beautiful/)
    assert.match(page.text, /Premium profile access and your nsso\.me URL are currently free for the first 1000 users\./)
    assert.doesNotMatch(page.text, /Add your contact methods and social profiles\./)
    const help = elements(page).filter(node => tag(node) === 'SectionHelp' && attribute(node, 'title') === 'Links')
    assert.equal(help.length, 1)
    assert.match(help[0].getText(), /Where can people find you or your work online\?/)
    const paragraphs = elements(page).filter(node => tag(node) === 'p')
    assert.ok(paragraphs.every(node => !/Where can people find you/.test(node.getText())), 'Links help must not return as a permanent subtitle.')
    const advanced = read('src/app/dashboard/components/AdvancedModeCard.tsx')
    assert.doesNotMatch(advanced, /Manage job titles, qualifications, and projects/)
    assert.doesNotMatch(advanced, /Manage what you offer without opening your experience editor/)
})

test('Links help is a native, named, keyboard-and-touch disclosure over an opaque reading surface', () => {
    const help = source('src/app/dashboard/components/SectionHelp.tsx')
    const buttons = elements(help).filter(node => tag(node) === 'button')
    assert.equal(buttons.length, 1)
    assert.equal(attribute(buttons[0], 'type'), 'button')
    assert.match(attribute(buttons[0], 'aria-label'), /About/)
    assert.ok(attribute(buttons[0], 'aria-describedby'))
    assert.ok(attribute(buttons[0], 'onClick'))
    assert.ok(attribute(buttons[0], 'onFocus'))
    assert.ok(attribute(buttons[0], 'onBlur'))
    assert.match(help.text, /event\.key === 'Escape'/)
    assert.match(help.text, /addEventListener\('pointerdown', dismiss\)/)
    assert.match(help.text, /removeEventListener\('pointerdown', dismiss\)/)
    const tooltips = elements(help).filter(node => attribute(node, 'role') === 'tooltip')
    assert.equal(tooltips.length, 1)
    assert.equal(attribute(tooltips[0], 'popover'), 'manual')
    assert.match(help.text, /createPortal\(/)
    assert.match(help.text, /document\.body/)
    assert.match(help.text, /popup\.showPopover\(\)/)
    assert.match(help.text, /addEventListener\('keydown', dismissWithEscape\)/)
    assert.match(help.text, /removeEventListener\('keydown', dismissWithEscape\)/)
    assert.match(attribute(tooltips[0], 'className'), /LIGHT_PANEL\.surface/)
    assert.match(read('src/components/ui/light-panel.ts'), /surface:\s*'[^']*\bbg-\[#[a-f\d]{6}\]/i, 'The shared reading material must retain an opaque RGB base under its gradient.')
    assert.doesNotMatch(attribute(tooltips[0], 'className'), /\bopacity-/)
})

for (const [kind, filename] of [['link', 'SortableLinkItem.tsx'], ['contact', 'SortableContactItem.tsx']]) {
    test(`${kind} sorting has exactly one native activator and its own sibling delete target above the fields`, () => {
        const file = source(`src/app/dashboard/components/${filename}`)
        const all = elements(file)
        const toolbars = all.filter(node => attribute(node, 'data-sortable-controls') === kind)
        assert.equal(toolbars.length, 1)
        const toolbar = toolbars[0]
        assert.equal(attribute(toolbar, 'onPointerDown'), undefined)
        assert.ok(!opening(toolbar).attributes.properties.some(node => ts.isJsxSpreadAttribute(node)), 'The toolbar must not inherit drag listeners over the delete button.')
        const handles = all.filter(node => attribute(node, 'ref') === '{setActivatorNodeRef}')
        assert.equal(handles.length, 1, 'Avoid duplicate desktop/mobile focusable drag controls.')
        const handle = handles[0]
        assert.equal(tag(handle), 'LightIconButton', 'The ref-forwarding primitive must keep the native drag activator compact and white.')
        assert.equal(attribute(handle, 'type'), 'button')
        assert.match(attribute(handle, 'aria-label'), /Drag to reorder/)
        assert.ok(handle.pos > toolbar.pos && handle.end < toolbar.end)
        const deletion = elements(toolbar).filter(node => tag(node) === 'LightCloseButton')
        assert.equal(deletion.length, 1)
        assert.match(attribute(deletion[0], 'aria-label'), /Remove/)
        assert.match(attribute(deletion[0], 'onClick'), /setConfirmDelete\(true\)/)
        assert.equal(attribute(deletion[0], 'intent'), undefined, 'Row X controls share Deity’s neutral close material.')
        assert.doesNotMatch(toolbar.getText(), /TahoeGlassButton|text-white|text-red-/)
        assert.ok(all.filter(node => tag(node) === 'Input').every(node => node.pos > toolbar.end), 'Input space must not contain a delete action.')
        assert.equal(all.filter(node => tag(node) === 'ConfirmDeleteDialog').length, 1, 'Deletion confirmation and the existing handler remain wired.')
    })
}

test('profile editing and preview share account menus and no route reintroduces bottom navigation', async () => {
    const transformed = transformSync(read('src/lib/tahoe-glass/route-boundaries.ts'), { loader: 'ts', format: 'esm' })
    const routes = await import('data:text/javascript;base64,' + Buffer.from(transformed.code).toString('base64'))
    for (const pathname of ['/dashboard', '/dashboard/', '/dashboard/security', '/dashboard/products/item/sales-page', '/preview', '/preview/']) assert.equal(routes.routeUsesMobileProfileMenu(pathname), true, pathname)
    for (const pathname of ['/film/razinflix', '/dashboard-other', '/']) {
        assert.equal(routes.routeUsesMobileProfileMenu(pathname), false, pathname)
    }
    for (const pathname of ['/', '/admin', '/dashboard/security', '/dashboard/products/item/creator']) assert.equal(routes.routeNeedsGlobalAccountHeader(pathname), true, pathname)
    for (const pathname of ['/preview', '/dashboard', '/deity', '/film/razinflix', '/creator']) assert.equal(routes.routeNeedsGlobalAccountHeader(pathname), false, pathname)
    const navigation = read('src/components/layout/GlobalNavigation.tsx')
    assert.doesNotMatch(navigation, /DashboardBottomNav/)
    assert.match(navigation, /routeNeedsGlobalAccountHeader\(pathname\) && <Header \/>/)
    assert.match(navigation, /usesDashboardSidebar && <DashboardSidebar \/>/)
    const layout = read('src/components/layout/AuthenticatedLayoutWrapper.tsx')
    assert.doesNotMatch(layout, /mobile-bottom-nav-height/)
    assert.match(layout, /aboveBottomNav=\{false\}/)
    const preview = read('src/app/preview/page.tsx')
    assert.match(preview, /<Header username=/)
    assert.doesNotMatch(preview, /NssoTopBar/)
})

test('the profile QR face has a definite Safari-safe square and no visible text chip', () => {
    const qr = source('src/components/ui/ProfileQRCodeToggle.tsx')
    const all = elements(qr)
    const surface = all.find(node => tag(node) === 'TahoeGlassSurface')
    assert.match(attribute(surface, 'contentClassName'), /absolute inset-0/)
    assert.match(attribute(surface, 'aria-label'), /profile photo/)
    assert.ok(attribute(surface, 'onKeyDown'))
    assert.match(qr.text, /!isFlipped && <div/, 'Unmount the photo hint so WebKit cannot composite its glass through the back face.')
    const plate = all.find(node => attribute(node, 'data-profile-qr-plate') === 'true')
    assert.match(attribute(plate, 'className'), /bg-white p-5/)
    assert.equal(attribute(plate, 'aria-hidden'), '{!isFlipped}')
    assert.equal(elements(plate).filter(node => tag(node) === 'QRCodeSVG').length, 1)
    const spans = elements(plate).filter(node => tag(node) === 'span')
    assert.ok(spans.every(node => attribute(node, 'className') === 'sr-only'))
    assert.doesNotMatch(plate.getText(), /Tap for photo/)
})
