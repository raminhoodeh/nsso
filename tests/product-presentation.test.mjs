import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '../urls' && context.parentURL === new URL('../src/lib/payments/product-presentation.ts', import.meta.url).href) {
        return next(new URL('../src/lib/urls.ts', import.meta.url).href, context)
    }
    return next(specifier, context)
} })
const { purchaseButtonLabel, productPurchaseButtonLabel, productCheckoutVisibility, isCourseMarketplaceUrl } = await import('../src/lib/payments/product-presentation.ts')
hooks.deregister()

test('download, signup and booking destinations get clear action labels without a sales-page hop', () => {
    for (const [url, label] of [
        ['https://apps.apple.com/gb/app/dreamsea/id6761101193', 'Download on the App Store'],
        ['https://apps.apple.com/app/id12345?source=nsso', 'Download on the App Store'],
        ['https://www.nsso.me/sign-up', 'Sign up to nsso'],
        ['https://nsso.me/sign-up/?source=profile', 'Sign up to nsso'],
        ['https://calendar.app.google/Synthetic123', 'Book a call'],
        ['https://calendar.google.com/calendar/appointments/schedules/synthetic', 'Book a call'],
        ['https://calendly.com/synthetic-person/30min', 'Book a call'],
        ['https://www.calendly.com/synthetic-person', 'Book a call'],
    ]) {
        assert.equal(purchaseButtonLabel(url), label, url)
        assert.equal(productPurchaseButtonLabel({ purchase_link: url }, url), label)
        assert.deepEqual(productCheckoutVisibility({ purchase_link: url, purchase_link_active: true }).purchaseUrls, [url])
    }
})

test('action defaults require genuine host, page and secure endpoint boundaries', () => {
    for (const url of [
        'https://apps.apple.com.attacker.test/gb/app/name/id123', 'https://apps.apple.com/gb/',
        'https://apps.apple.com/gb/app/name', 'https://apple.com/gb/app/name/id123',
        'https://apps.apple.com:8443/gb/app/name/id123', 'http://apps.apple.com/gb/app/name/id123',
        'https://nsso.me.attacker.test/sign-up', 'https://fake.nsso.me/sign-up',
        'https://nsso.me/sign-in', 'https://www.nsso.me/sign-up-other', 'https://nsso.me:8443/sign-up',
        'https://calendar.app.google.attacker.test/synthetic', 'https://calendar.app.google/',
        'https://calendar.google.com/calendar/u/0/r', 'https://calendly.com/', 'https://calendly.com/blog/article',
        'https://calendly.com/pricing', 'https://calendly.com/app/login', 'https://calendly.com.attacker.test/user/call',
        'https://seller.example/?next=https://www.nsso.me/sign-up',
    ]) assert.equal(purchaseButtonLabel(url), 'View purchase page', url)
})

test('optional per-destination labels are plain bounded text, reset to automatic, and never authorize a URL', () => {
    const primary = 'https://apps.apple.com/gb/app/synthetic/id12345'
    const secondary = 'https://www.nsso.me/sign-up'
    const product = { purchase_link: primary, secondary_purchase_link: secondary, purchase_button_label: '  Get the app  ', secondary_purchase_button_label: 'Create your profile' }
    assert.equal(productPurchaseButtonLabel(product, primary), 'Get the app')
    assert.equal(productPurchaseButtonLabel(product, secondary), 'Create your profile')
    for (const empty of ['', '   ', null, undefined]) assert.equal(purchaseButtonLabel(primary, empty), 'Download on the App Store')
    for (const invalid of [123, {}, 'x'.repeat(61), 'bad\nlabel', 'bad\tlabel', 'bad\u007flabel']) assert.equal(purchaseButtonLabel(primary, invalid), 'Download on the App Store')
    assert.equal(purchaseButtonLabel(primary, 'x'.repeat(60)), 'x'.repeat(60))
    assert.equal(purchaseButtonLabel(primary, '<img onerror="alert(1)">'), '<img onerror="alert(1)">', 'Rendering must treat custom copy as text, not HTML')
    assert.equal(purchaseButtonLabel('javascript:alert(1)', 'Download now'), 'View purchase page')
    assert.deepEqual(productCheckoutVisibility({ ...product, purchase_link_active: false, paypal_active: true }), { purchaseUrl: null, purchaseUrls: [], paypal: true })
    const duplicate = { ...product, purchase_link: ' HTTPS://APPS.APPLE.COM:443/gb/app/synthetic/id12345 ', secondary_purchase_link: primary }
    assert.equal(productPurchaseButtonLabel(duplicate, primary), 'Get the app', 'Duplicate URLs retain primary text precedence')
    assert.equal(productPurchaseButtonLabel({ ...product, purchase_link: 'javascript:alert(1)' }, secondary), 'Create your profile')
    assert.equal(productPurchaseButtonLabel(product, 'https://other.example/checkout'), 'View purchase page', 'Labels cannot attach to unrelated destinations')
})

test('Etsy purchase labels follow the actual website hostname across valid web URLs', () => {
    for (const url of [
        'https://etsy.com/listing/12345/item',
        'https://www.etsy.com/shop/SyntheticShop?ref=fixture#reviews',
        'https://synthetic.etsy.com/a',
        'https://shop.synthetic.etsy.com/a',
        'HTTPS://WWW.ETSY.COM/listing/123?shop=shop.myshopify.com',
        'http://www.etsy.com:8080/listing/123',
        '  https://www.etsy.com/listing/123  ',
    ]) assert.equal(purchaseButtonLabel(url), 'Buy on Etsy', url)
})

test('Shopify labels recognize hosted shop subdomains without inferring custom-domain providers', () => {
    for (const url of [
        'https://synthetic-shop.myshopify.com/products/guide',
        'https://www.synthetic-shop.myshopify.com/products/guide?ref=etsy.com',
        'HTTP://SYNTHETIC-SHOP.MYSHOPIFY.COM:8080/cart#checkout',
    ]) assert.equal(purchaseButtonLabel(url), 'Buy on Shopify', url)
    for (const url of ['https://myshopify.com/', 'https://www.shopify.com/', 'https://shopify.com/', 'https://synthetic-custom-shop.example/products/guide']) {
        assert.equal(purchaseButtonLabel(url), 'View purchase page', url)
    }
})

test('lookalike hosts, paths, queries and credentials cannot claim another checkout provider', () => {
    for (const url of [
        'https://notetsy.com/listing/123',
        'https://etsy.com.attacker.example/listing/123',
        'https://attacker-etsy.com/listing/123',
        'https://еtsy.com/listing/123', // Cyrillic e is a different hostname.
        'https://myshopify.com.attacker.example/products/guide',
        'https://synthetic-shopmyshopify.com/products/guide',
        'https://synthetic-shop.myshopify.com.attacker.example/products/guide',
        'https://checkout.example/etsy.com/shop.myshopify.com?provider=etsy.com#myshopify.com',
        'https://checkout.example/?next=https%3A%2F%2Fwww.etsy.com',
        'https://etsy.com@attacker.example/a',
        'https://attacker.example@etsy.com/a',
        'https://user:password@synthetic-shop.myshopify.com/a',
    ]) assert.equal(purchaseButtonLabel(url), 'View purchase page', url)
})

test('invalid and unsupported destinations keep the generic label and existing visibility guards', () => {
    for (const url of [
        undefined, null, 123, {}, [], '', 'not a URL', '/relative', '//etsy.com/a',
        'javascript:alert("etsy.com")', 'data:text/html,etsy.com', 'mailto:shop@etsy.com',
        'ftp://etsy.com/a', 'https://www.etsy.com:invalid/a', 'https://etsy.com/a b',
        'https://etsy.com/a\nb', 'https://etsy.com/a\\b', 'https://etsy.com/' + 'x'.repeat(4096),
    ]) {
        assert.equal(purchaseButtonLabel(url), 'View purchase page', String(url))
        assert.deepEqual(productCheckoutVisibility({ purchase_link: url, purchase_link_active: true, paypal_active: true }), { purchaseUrl: null, purchaseUrls: [], paypal: true })
    }
    assert.deepEqual(productCheckoutVisibility({ purchase_link: 'https://www.etsy.com/listing/123', purchase_link_active: false, paypal_active: true }), { purchaseUrl: null, purchaseUrls: [], paypal: true })
    assert.deepEqual(productCheckoutVisibility({ purchase_link: 'https://www.etsy.com/listing/123', purchase_link_active: true, paypal_active: false }), { purchaseUrl: 'https://www.etsy.com/listing/123', purchaseUrls: ['https://www.etsy.com/listing/123'], paypal: false })
})

test('course destinations receive platform-specific purchase labels only for validated domain boundaries', () => {
    for (const [url, label] of [
        ['https://udemy.com/course/fixture', 'Buy on Udemy'],
        ['HTTPS://WWW.UDEMY.COM:443/course/fixture?coupon=fixture', 'Buy on Udemy'],
        ['http://business.udemy.com/course/fixture', 'Buy on Udemy'],
        ['https://coursera.org/learn/fixture', 'Buy on Coursera'],
        ['https://www.coursera.org/learn/fixture?source=udemy.com', 'Buy on Coursera'],
        ['https://partner.coursera.org/learn/fixture', 'Buy on Coursera'],
    ]) {
        assert.equal(purchaseButtonLabel(url), label, url)
        assert.equal(isCourseMarketplaceUrl(url), true, url)
    }
    for (const url of [
        'https://notudemy.com/course/fixture', 'https://udemy.com.evil.example/course/fixture',
        'https://coursera.org.evil.example/learn/fixture', 'https://fakecoursera.org/learn/fixture',
        'https://seller.example/udemy.com?next=https://coursera.org',
        'https://udemy.com@evil.example/course/fixture', 'https://evil.example@coursera.org/learn/fixture',
        'javascript:alert("coursera.org")', 'ftp://udemy.com/course/fixture', null, {}, '',
    ]) {
        assert.equal(purchaseButtonLabel(url), 'View purchase page', String(url))
        assert.equal(isCourseMarketplaceUrl(url), false, String(url))
    }
})

test('two validated purchase destinations retain normalized primary-secondary order without changing PayPal', () => {
    const input = { purchase_link: '  HTTPS://WWW.UDEMY.COM:443/course/fixture  ', secondary_purchase_link: 'https://www.coursera.org/learn/fixture?source=nsso', purchase_link_active: true, paypal_active: true }
    const original = structuredClone(input)
    const urls = ['https://www.udemy.com/course/fixture', 'https://www.coursera.org/learn/fixture?source=nsso']
    assert.deepEqual(productCheckoutVisibility(input), { purchaseUrl: urls[0], purchaseUrls: urls, paypal: true })
    assert.deepEqual(input, original)
})

test('normalized duplicate destinations produce one action and a safe secondary can stand alone', () => {
    const udemy = 'https://www.udemy.com/course/fixture'
    assert.deepEqual(productCheckoutVisibility({ purchase_link: 'HTTPS://WWW.UDEMY.COM:443/course/fixture', secondary_purchase_link: udemy, purchase_link_active: true }), { purchaseUrl: udemy, purchaseUrls: [udemy], paypal: false })
    for (const unsafe of [undefined, null, '', 'javascript:alert(1)', 'https://user:password@example.test', {}]) {
        assert.deepEqual(productCheckoutVisibility({ purchase_link: unsafe, secondary_purchase_link: udemy, purchase_link_active: true }), { purchaseUrl: udemy, purchaseUrls: [udemy], paypal: false })
        assert.deepEqual(productCheckoutVisibility({ purchase_link: udemy, secondary_purchase_link: unsafe, purchase_link_active: true }), { purchaseUrl: udemy, purchaseUrls: [udemy], paypal: false })
    }
})

test('both purchase destinations require the explicit active flag and neither flag affects the other payment channel', () => {
    const primary = 'https://www.udemy.com/course/fixture', secondary = 'https://www.coursera.org/learn/fixture'
    for (const inactive of [undefined, null, false, 0, 1, 'true']) {
        assert.deepEqual(productCheckoutVisibility({ purchase_link: primary, secondary_purchase_link: secondary, purchase_link_active: inactive, paypal_active: true }), { purchaseUrl: null, purchaseUrls: [], paypal: true })
    }
    assert.deepEqual(productCheckoutVisibility({ purchase_link: primary, secondary_purchase_link: secondary, purchase_link_active: true, paypal_active: 'true' }), { purchaseUrl: primary, purchaseUrls: [primary, secondary], paypal: false })
})

test('purchase-label classification performs no fetches or checkout side effects', () => {
    const original = globalThis.fetch
    globalThis.fetch = () => assert.fail('A label must never fetch a seller or infer its provider remotely')
    try {
        assert.equal(purchaseButtonLabel('https://www.etsy.com/listing/123'), 'Buy on Etsy')
        assert.equal(purchaseButtonLabel('https://synthetic.myshopify.com/products/123'), 'Buy on Shopify')
        assert.equal(purchaseButtonLabel('https://custom-shop.example/products/123'), 'View purchase page')
    } finally { globalThis.fetch = original }
})
