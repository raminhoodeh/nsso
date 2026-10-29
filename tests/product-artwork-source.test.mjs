import test from 'node:test'
import assert from 'node:assert/strict'
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern.js'
import nextConfig from '../next.config.ts'

test('Next accepts the published course artwork without allowing other nsso endpoints', () => {
    const accepts = value => hasRemoteMatch([], nextConfig.images.remotePatterns, new URL(value))
    assert.equal(accepts('https://www.nsso.me/images/products/ai-product-management-course.webp'), true)
    assert.equal(accepts('https://ymckairbwictbfsfpqzt.supabase.co/storage/v1/object/public/portfolio-assets/products/existing.jpg'), true)
    for (const url of [
        'http://www.nsso.me/images/products/course.webp',
        'https://www.nsso.me:444/images/products/course.webp',
        'https://www.nsso.me/api/health',
        'https://www.nsso.me/images/products/../private.webp',
        'https://www.nsso.me/images/products/course.webp?redirect=/api/health',
        'https://www.nsso.me.evil.test/images/products/course.webp',
    ]) assert.equal(accepts(url), false, url)
})
