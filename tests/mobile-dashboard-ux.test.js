/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const advancedModeSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/dashboard/components/AdvancedModeCard.tsx'),
    'utf8'
)
const paypalEditorSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/payments/PayPalCodeEditor.tsx'),
    'utf8'
)
const productsEditorSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/dashboard/components/ProductsServicesEditor.tsx'),
    'utf8'
)
const bottomNavSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/layout/DashboardBottomNav.tsx'),
    'utf8'
)
const headerSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/layout/Header.tsx'),
    'utf8'
)
const topBarSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/layout/NssoTopBar.tsx'),
    'utf8'
)
const toastSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/ui/Toast.tsx'),
    'utf8'
)
const layoutSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/layout.tsx'),
    'utf8'
)
const globalStylesSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/globals.css'),
    'utf8'
)
const authenticatedLayoutSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/layout/AuthenticatedLayoutWrapper.tsx'),
    'utf8'
)
const dashboardPageSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/dashboard/page.tsx'),
    'utf8'
)

test('experience and products are exclusive sibling accordions', () => {
    assert.match(
        advancedModeSource,
        /type ExpandedPanel = 'experience' \| 'products' \| null/
    )
    assert.match(
        advancedModeSource,
        /const \[expandedPanel, setExpandedPanel\] = useState<ExpandedPanel>\(null\)/
    )
    assert.doesNotMatch(advancedModeSource, /setBackgroundDimmed/)
    assert.doesNotMatch(advancedModeSource, /useUI/)
    assert.match(advancedModeSource, /data-profile-editor-sections="split"/)

    const experienceCard = advancedModeSource.indexOf('data-editor-card="experience"')
    const productsCard = advancedModeSource.indexOf('<ProductsServicesEditor')

    assert.ok(experienceCard >= 0, 'experience editor card is present')
    assert.ok(productsCard > experienceCard, 'the persistent products editor is a later sibling')
    assert.match(productsEditorSource, /data-editor-card="products"/)
    assert.match(advancedModeSource, /'Experience & Education'/)
    assert.match(advancedModeSource, /'Products & Services'/)
    assert.match(advancedModeSource, /data-editor-accordion="experience"/)
    assert.match(advancedModeSource, /data-editor-accordion="products"/)
    assert.match(
        advancedModeSource,
        /setExpandedPanel\(current => current === panel \? null : panel\)/
    )
    assert.match(advancedModeSource, /id=\{`\$\{controls\}-toggle`\}/)
    assert.match(advancedModeSource, /hidden=\{expandedPanel !== 'experience'\}/)
    assert.match(advancedModeSource, /hidden=\{expandedPanel !== 'products'\}/)
    assert.match(advancedModeSource, /aria-labelledby="experience-education-editor-toggle"/)
    assert.match(advancedModeSource, /aria-labelledby="products-services-editor-toggle"/)
})

test('products no longer participate in experience section navigation', () => {
    assert.match(
        advancedModeSource,
        /type ActiveSection = 'experiences' \| 'qualifications' \| 'projects'/
    )
    assert.doesNotMatch(advancedModeSource, /activeSection === 'products'/)
    assert.doesNotMatch(advancedModeSource, /setActiveSection\('products'\)/)

    const experienceCard = advancedModeSource.indexOf('data-editor-card="experience"')
    const productsPanel = advancedModeSource.indexOf('<ProductsServicesEditor', experienceCard)
    const experienceMarkup = advancedModeSource.slice(experienceCard, productsPanel)

    assert.doesNotMatch(experienceMarkup, /renderProducts\(\)/)
    assert.doesNotMatch(experienceMarkup, /Integrate web3 wallet/)
})

test('mobile navigation immediately precedes the active experience editor', () => {
    const experienceCard = advancedModeSource.indexOf('data-editor-card="experience"')
    const productsPanel = advancedModeSource.indexOf('<ProductsServicesEditor', experienceCard)
    const experienceMarkup = advancedModeSource.slice(experienceCard, productsPanel)
    const tabList = experienceMarkup.indexOf('role="tablist"')
    const tabPanel = experienceMarkup.indexOf('role="tabpanel"')

    assert.ok(tabList >= 0, 'compact section chooser is present')
    assert.ok(tabPanel > tabList, 'active editor follows the chooser')
    assert.match(
        experienceMarkup,
        /scrollbar-hide flex gap-2 overflow-x-auto[^"\n]*md:flex-col/
    )
    const roomyMobileTabs = experienceMarkup.match(
        /className="min-h-11 shrink-0 px-5 py-2\.5 md:w-full md:px-4 md:py-3"/g
    ) || []
    assert.equal(roomyMobileTabs.length, 3, 'tabs keep natural width and breathing room in the horizontal scroller')
    assert.doesNotMatch(experienceMarkup, /min-w-\[84px\] flex-1 shrink-0/)
})

test('experience tabs expose complete relationships and roving keyboard navigation', () => {
    for (const section of ['experiences', 'qualifications', 'projects']) {
        assert.match(advancedModeSource, new RegExp(`id="experience-tab-${section}"`))
        assert.match(advancedModeSource, new RegExp(`aria-controls="experience-${section}-panel"`))
        assert.match(advancedModeSource, new RegExp(`id="experience-${section}-panel"`))
        assert.match(advancedModeSource, new RegExp(`aria-labelledby="experience-tab-${section}"`))
        assert.match(
            advancedModeSource,
            new RegExp(`tabIndex=\\{activeSection === '${section}' \\? 0 : -1\\}`)
        )
        assert.match(
            advancedModeSource,
            new RegExp(`handleSectionTabKeyDown\\(event, '${section}'\\)`)
        )
    }

    assert.match(advancedModeSource, /event\.key === 'ArrowRight'/)
    assert.match(advancedModeSource, /event\.key === 'ArrowLeft'/)
    assert.match(advancedModeSource, /event\.key === 'ArrowDown'/)
    assert.match(advancedModeSource, /event\.key === 'ArrowUp'/)
    assert.match(advancedModeSource, /event\.key === 'Home'/)
    assert.match(advancedModeSource, /event\.key === 'End'/)
    assert.match(advancedModeSource, /sectionTabRefs\.current\[nextSection\]\?\.focus\(\)/)
})

test('advanced editor drag handles are native focusable keyboard controls', () => {
    const sortableItemStart = advancedModeSource.indexOf('function SortableItem')
    const sortableItemEnd = advancedModeSource.indexOf('export default function AdvancedModeCard')
    const sortableItemMarkup = advancedModeSource.slice(sortableItemStart, sortableItemEnd)

    assert.doesNotMatch(sortableItemMarkup, /<TahoeGlassSurface[^>]*\{\.\.\.attributes\}/)
    assert.match(sortableItemMarkup, /children\(\{ attributes, listeners, setActivatorNodeRef \}\)/)

    const handles = advancedModeSource.match(
        /<button\s+ref=\{setActivatorNodeRef\}\s+type="button"\s+\{\.\.\.attributes\}\s+\{\.\.\.listeners\}[\s\S]*?aria-label="Drag to reorder (?:experience|qualification|project)"/g
    ) || []
    assert.equal(handles.length, 3)
    assert.match(advancedModeSource, /focus-visible:ring-2 focus-visible:ring-white\/80/)
})

test('mobile form fields avoid the old nested padding gutter', () => {
    assert.match(advancedModeSource, /p-3 md:p-4/)
    assert.match(advancedModeSource, /grid gap-3 md:gap-4 md:pl-8/)
    assert.match(advancedModeSource, /p-3 md:max-h-\[800px\] md:overflow-y-auto md:p-10/)
    assert.match(advancedModeSource, /md:min-h-\[600px\]/)
    assert.doesNotMatch(advancedModeSource, /className="relative min-h-\[600px\]/)
    assert.doesNotMatch(advancedModeSource, /max-h-\[240px\]/)
    assert.doesNotMatch(advancedModeSource, /className="relative group p-4"/)
    assert.doesNotMatch(advancedModeSource, /className="grid gap-4 pl-8"/)
    assert.doesNotMatch(advancedModeSource, /touchAction: 'none'/)
    assert.match(advancedModeSource, /touch-none cursor-grab/)
})

test('mobile advanced editors reserve writing room without changing desktop density', () => {
    const stackedYearRows = advancedModeSource.match(
        /grid grid-cols-1 gap-3 min-\[480px\]:grid-cols-2 md:gap-4/g
    ) || []
    assert.equal(stackedYearRows.length, 2, 'experience and qualification years stack on narrow phones')

    const sectionHeaders = advancedModeSource.match(
        /grid grid-cols-\[minmax\(0,1fr\)_44px\] items-start gap-3/g
    ) || []
    assert.equal(sectionHeaders.length, 3, 'editor headings cannot squeeze their add buttons')
    assert.match(advancedModeSource, /py-2\.5 md:py-2/)
    assert.match(advancedModeSource, /min-h-\[88px\] resize-none md:min-h-\[60px\]/)

    assert.match(productsEditorSource, /min-h-\[160px\]/)
    assert.match(paypalEditorSource, /min-h-\[112px\] resize-none[^"\n]*md:min-h-\[80px\]/)
    assert.match(paypalEditorSource, /text-base font-mono[^"\n]*md:text-xs/)

    assert.match(productsEditorSource, /className="h-11 w-14 shrink-0 p-0"/)
    assert.equal((productsEditorSource.match(/<Toggle checked=/g) || []).length, 3, 'all product switches share the 44px mobile target')
    assert.match(productsEditorSource, /Upload image for/)
})

test('the split products card retains its existing CRUD and editor paths', () => {
    assert.match(productsEditorSource, /createEntity\('product'/)
    assert.match(productsEditorSource, /patchEntity\('product'/)
    assert.match(productsEditorSource, /removeEntity\('product'/)
    assert.match(productsEditorSource, /<ConfirmDeleteDialog/)
    assert.match(productsEditorSource, /<ImageCropperModal/)
    assert.match(productsEditorSource, /<PayPalCodeEditor/)
    assert.doesNotMatch(productsEditorSource, /name:\s*'New Product'/)
    assert.match(productsEditorSource, /Add to public profile/)
})

test('the bottom bar shares the header backdrop engine and owns real safe-area space', () => {
    assert.match(bottomNavSource, /<TahoeBackdropSurface/)
    assert.doesNotMatch(bottomNavSource, /<TahoeGlassSurface/)
    assert.doesNotMatch(bottomNavSource, /<TahoeGlassButton/)
    assert.match(bottomNavSource, /semanticTint="dark"/)
    assert.match(bottomNavSource, /semanticTintOpacity=\{0\.42\}/)
    assert.match(bottomNavSource, /displacementProfile="prism-bottom"/)
    assert.match(bottomNavSource, /materialLighting="uniform"/)
    assert.match(bottomNavSource, /data-mobile-nav-material="dark-refractive"/)
    assert.match(bottomNavSource, /contentClassName="w-full bg-\[#080c14\]\/40"/)
    assert.match(bottomNavSource, /border-white\/10 bg-black\/\[0\.12\]/)
    assert.match(bottomNavSource, /text-white\/80/)
    assert.doesNotMatch(bottomNavSource, /pb-safe/)
    assert.match(bottomNavSource, /--mobile-bottom-safe-space/)
    assert.match(bottomNavSource, /env\(safe-area-inset-left\)/)
    assert.match(bottomNavSource, /env\(safe-area-inset-right\)/)
    assert.match(bottomNavSource, /z-\[5000\]/)
    assert.match(bottomNavSource, /\{item\.label\}/)
    assert.match(bottomNavSource, /h-14 w-full/)
    assert.match(layoutSource, /viewportFit: "cover"/)
    assert.match(globalStylesSource, /--mobile-bottom-safe-space: max\(8px, env\(safe-area-inset-bottom\)\)/)
    assert.match(globalStylesSource, /--mobile-bottom-nav-height:/)
    assert.match(authenticatedLayoutSource, /--mobile-bottom-nav-height/)
})

test('mobile header and dashboard content fit narrow and notched viewports', () => {
    assert.match(headerSource, /<NssoTopBar/)
    assert.match(headerSource, /className=\{NSSO_TOPBAR_CONTENT_CLASS\}/)
    assert.match(topBarSource, /displacementProfile="prism-top"/)
    assert.match(topBarSource, /materialLighting="uniform"/)
    assert.match(topBarSource, /h-\[calc\(88px\+env\(safe-area-inset-top\)\)\]/)
    assert.match(topBarSource, /pl-\[max\(12px,env\(safe-area-inset-left\)\)\]/)
    assert.match(topBarSource, /pr-\[max\(12px,env\(safe-area-inset-right\)\)\]/)
    assert.match(headerSource, /min-\[360px\]:hidden[^>]*>Preview</)
    assert.match(headerSource, /hidden min-\[360px\]:inline[^>]*>Preview Profile</)
    assert.match(headerSource, /min-\[360px\]:hidden[^>]*>Copy URL</)
    assert.match(headerSource, /hidden min-\[360px\]:inline[^>]*>Copy profile URL</)
    assert.match(headerSource, /gap-2 min-\[360px\]:gap-3/)
    assert.match(dashboardPageSource, /pt-\[calc\(120px\+env\(safe-area-inset-top\)\)\]/)
    assert.match(dashboardPageSource, /pl-\[max\(16px,env\(safe-area-inset-left\)\)\]/)
    assert.match(dashboardPageSource, /pr-\[max\(16px,env\(safe-area-inset-right\)\)\]/)
})

test('the profile bio provides four times the mobile writing capacity', () => {
    const bioMarker = dashboardPageSource.indexOf('data-mobile-bio-field="expanded"')
    const bioFieldStart = dashboardPageSource.lastIndexOf('<TahoeGlassField', bioMarker)
    const bioFieldEnd = dashboardPageSource.indexOf('</TahoeGlassField>', bioFieldStart)
    const bioFieldMarkup = dashboardPageSource.slice(bioFieldStart, bioFieldEnd)

    assert.ok(bioMarker >= 0 && bioFieldStart >= 0, 'the expanded mobile bio field is present')
    assert.match(
        bioFieldMarkup,
        /controlClassName="min-h-\[384px\][^"\n]*md:min-h-0"/
    )
    assert.match(bioFieldMarkup, /rows=\{4\}/, 'desktop keeps the existing four-row intrinsic size')
})

test('profile Ask Deity controls have clear field spacing and compact chrome', () => {
    const profileFieldsStart = dashboardPageSource.indexOf('{/* Profile Fields */}')
    const profileFieldsEnd = dashboardPageSource.indexOf('{/* Free profile URL */}', profileFieldsStart)
    const profileFieldsMarkup = dashboardPageSource.slice(profileFieldsStart, profileFieldsEnd)

    assert.ok(profileFieldsStart >= 0 && profileFieldsEnd > profileFieldsStart)
    assert.equal(
        (profileFieldsMarkup.match(/className="mb-3 ml-1 flex items-center justify-between gap-3"/g) || []).length,
        2,
        'Headline and Bio each reserve space between their action and field'
    )
    assert.equal(
        (profileFieldsMarkup.match(/className="min-h-11 min-w-11 px-1\.5 py-0\.5"/g) || []).length,
        2,
        'both field actions keep a 44px target with reduced internal padding'
    )
    assert.doesNotMatch(profileFieldsMarkup, /-my-2/)
})

test('nested dashboard cards use one concentric radius system', () => {
    assert.equal(
        ((advancedModeSource + productsEditorSource).match(/radius="var\(--editor-card-radius\)"/g) || []).length,
        2,
        'both expanded editor shells use the responsive radius token'
    )
    assert.equal(
        (advancedModeSource.match(/radius="var\(--editor-aside-radius\)"/g) || []).length,
        1,
        'the unchanged experience menu retains its corner-aware radius'
    )
    assert.equal(
        (advancedModeSource.match(/\[--editor-aside-radius:28px_28px_0px_0px\]/g) || []).length,
        1
    )
    assert.equal(
        (advancedModeSource.match(/md:\[--editor-aside-radius:40px_0px_0px_40px\]/g) || []).length,
        1
    )
    assert.doesNotMatch(advancedModeSource, /rounded-\[28px\][^"\n]*md:rounded-\[40px\]/)
    assert.match(dashboardPageSource, /radius="var\(--profile-card-radius\)"/)
    assert.match(dashboardPageSource, /\[--profile-card-radius:32px\]/)
    assert.match(dashboardPageSource, /sm:\[--profile-card-radius:40px\]/)

    assert.doesNotMatch(productsEditorSource, /<PlannedFeature/)
    assert.match(productsEditorSource, /aria-controls="offerings-coming-soon"/)
    assert.match(productsEditorSource, /id="offerings-coming-soon"/)
    assert.match(productsEditorSource, /Coming soon/)
})

test('mobile notifications clear the bottom bar and use an opaque readable token', () => {
    assert.match(
        toastSource,
        /bottom-\[calc\(var\(--mobile-bottom-nav-height\)\+12px\)\]/
    )
    assert.match(toastSource, /w-\[calc\(100%_-_2rem\)\]/)
    assert.match(toastSource, /z-\[9999\]/)
    assert.match(toastSource, /bg-\[#11161d\]/)
    assert.doesNotMatch(toastSource, /TahoeGlassSurface/)
})

test('the mobile account drawer is a readable light safe-area sheet with robust scroll locking', () => {
    assert.match(headerSource, /bg-black\/70/)
    assert.match(headerSource, /data-mobile-account-menu="true"[^\n]*bg-\[#e3e7ed\]/)
    assert.match(headerSource, /data-mobile-account-menu="true"[^\n]*text-slate-950/)
    assert.match(headerSource, /env\(safe-area-inset-top\)/)
    assert.match(headerSource, /env\(safe-area-inset-bottom\)/)
    assert.match(headerSource, /body\.style\.position = 'fixed'/)
    assert.match(headerSource, /root\.style\.overflow = 'hidden'/)
    assert.match(headerSource, /window\.scrollTo\(scrollX, scrollY\)/)
    assert.match(headerSource, /preventBodyScroll=\{false\}/)

    const dialogStart = headerSource.indexOf('id="mobile-account-menu"')
    const dialogEnd = headerSource.indexOf('{/* Mobile - Not logged in', dialogStart)
    const drawerMarkup = headerSource.slice(dialogStart, dialogEnd)
    assert.doesNotMatch(drawerMarkup, /<TahoeGlassSurface/)
    assert.match(drawerMarkup, /<MobileMenuNavigation/)
    assert.match(headerSource, /MENU_ROW_CLASS = '[^'\n]*min-h-12/)
})
