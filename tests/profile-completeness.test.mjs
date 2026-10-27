import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === './urls' && context.parentURL?.endsWith('/profile-completeness.ts')) return next(new URL('../src/lib/urls.ts', import.meta.url).href, context)
    return next(specifier, context)
} })
const { calculateProfileCompleteness: score } = await import('../src/lib/profile-completeness.ts')
hooks.deregister()

test('empty and whitespace drafts do not improve profile completion', () => {
    assert.equal(score(null), 0)
    assert.equal(score({ profile: { full_name: '  ', bio: '' }, links: [{}], contacts: [{ method: 'Email', value: '' }], experiences: [{}], qualifications: [{}], projects: [{ project_name: 'New Project' }], products: [{ name: 'New Product' }] }), 0)
    assert.equal(score({ links: [{ link_name: 'Bad URL', link_url: 'javascript:alert(1)' }], contacts: [{ method: 'Email', value: 'invalid' }] }), 0)
    assert.equal(score({ products: [{ name: 'New Product', price: '0' }] }), 0)
})

test('complete meaningful sections reach exactly 100 without duplicate-row inflation', () => {
    const input = {
        profile: { full_name: 'Creator', headline: 'Designer', bio: 'A full bio', profile_pic_url: 'https://images.test/avatar.jpg' },
        links: [{ link_name: 'Portfolio', link_url: 'https://example.test' }],
        contacts: [{ method: 'Email', value: 'creator@example.test' }],
        experiences: [{ company_name: 'Studio', job_title: 'Designer' }],
        qualifications: [{ institution: 'University', qualification_name: 'Design' }],
        projects: [{ project_name: 'My work', description: 'A real project' }],
        products: [{ name: 'Consultation', price: 'Free' }],
    }
    assert.equal(score(input), 100)
    assert.equal(score({ ...input, links: [...input.links, ...input.links] }), 100)
    assert.equal(score({ ...input, products: [] }), 90)
    assert.equal(score({ ...input, profile: { ...input.profile, full_name: '' } }), 90)
})
