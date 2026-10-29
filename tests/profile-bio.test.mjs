import assert from 'node:assert/strict'
import test from 'node:test'
import { getProfileBioPreview, getProfileTextPreview } from '../src/components/profile/profileBio.ts'

const characters = text => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)]

test('bodies through 75 characters stay intact and longer bodies reserve room for the ellipsis', () => {
    for (const length of [0, 1, 74, 75]) assert.equal(getProfileTextPreview('a'.repeat(length)), undefined)
    for (const length of [76, 1000]) {
        const full = 'a'.repeat(length)
        const preview = getProfileTextPreview(full)
        assert.equal(preview, 'a'.repeat(74))
        assert.equal(characters(`${preview}…`).length, 75)
        assert.ok(full.startsWith(preview))
    }
})

test('a boundary never cuts a family emoji, skin tone, flag or combining accent', () => {
    for (const cluster of ['👨‍👩‍👧‍👦', '👍🏽', '🇦🇪', 'e\u0301']) {
        const full = `${'a'.repeat(73)}${cluster}bc`
        const preview = getProfileTextPreview(full)
        assert.equal(preview, `${'a'.repeat(73)}${cluster}`)
        assert.equal(characters(`${preview}…`).length, 75)
        assert.ok(full.startsWith(preview))
    }
    assert.equal(getProfileTextPreview('👨‍👩‍👧‍👦'.repeat(75)), undefined)
})

test('line breaks and long words remain exact saved-text prefixes', () => {
    const full = `First line.\n\n${'unbroken'.repeat(100)}   `
    const preview = getProfileTextPreview(full)
    assert.equal(preview, full.slice(0, 74))
    assert.ok(preview.includes('\n\n'))
    assert.equal(getProfileTextPreview(' '.repeat(1000)), undefined)
    assert.equal(getProfileTextPreview('\n\t\n'), undefined)
})

test('every profile identity uses the same display-only bio policy', () => {
    const bio = 'I build products and teach. '.repeat(100)
    for (const username of ['ramin', 'john', 'new-creator', null, undefined]) {
        assert.equal(getProfileBioPreview(username, bio), getProfileTextPreview(bio))
        assert.ok(bio.startsWith(getProfileBioPreview(username, bio)))
    }
    assert.equal(getProfileBioPreview('creator', 'A short bio.'), undefined)
})
