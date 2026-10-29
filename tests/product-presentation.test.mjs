import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '../urls' && context.parentURL === new URL('../src/lib/payments/product-presentation.ts', import.meta.url).href) {
        return next(new URL('../src/lib/urls.ts', import.meta.url).href, context)
    }
    return next(specifier, context)
} })
const { purchaseButtonLabel, productCheckoutVisibility } = await import('../src/lib/payments/product-presentation.ts')
hooks.deregister()

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
        assert.deepEqual(productCheckoutVisibility({ purchase_link: url, purchase_link_active: true, paypal_active: true }), { purchaseUrl: null, paypal: true })
    }
    assert.deepEqual(productCheckoutVisibility({ purchase_link: 'https://www.etsy.com/listing/123', purchase_link_active: false, paypal_active: true }), { purchaseUrl: null, paypal: true })
    assert.deepEqual(productCheckoutVisibility({ purchase_link: 'https://www.etsy.com/listing/123', purchase_link_active: true, paypal_active: false }), { purchaseUrl: 'https://www.etsy.com/listing/123', paypal: false })
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
