import assert from 'node:assert/strict'
import test from 'node:test'
import { getProfileBioPreview, JOHN_BIO_PREVIEW } from '../src/components/profile/profileBio.ts'

test('every long bio gets a bounded preview that is an exact prefix of the saved content', () => {
  for (const username of ['ramin', 'john', 'new-creator', undefined]) {
    const bio = 'I build products and teach. '.repeat(100)
    const preview = getProfileBioPreview(username, bio)
    assert.ok(preview.length >= 240 && preview.length <= 600)
    assert.ok(bio.startsWith(preview))
  }
})

test('short bios stay intact and an opening paragraph is preferred', () => {
  assert.equal(getProfileBioPreview('creator', 'A short bio.'), undefined)
  const first = 'My work brings together people, ideas and creative practice. '.repeat(5).trim()
  const bio = `${first}\n\n${'A longer story follows. '.repeat(50)}`
  assert.equal(getProfileBioPreview('creator', bio), first)
  assert.equal(getProfileBioPreview('john', `${JOHN_BIO_PREVIEW}\n\n${'More. '.repeat(100)}`), JOHN_BIO_PREVIEW)
})

test('unbroken text and trailing whitespace do not stop generic collapsing', () => {
  const text = 'a'.repeat(1000) + '   '
  const preview = getProfileBioPreview('creator', text)
  assert.equal(preview.length, 400)
  assert.ok(text.startsWith(preview))
})
