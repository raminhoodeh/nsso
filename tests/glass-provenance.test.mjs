import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const notices = readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')
const homepage = readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8')
const checklist = readFileSync(path.join(root, 'docs/CHROME_GLASS_RELEASE.md'), 'utf8')
const originalComponent = 'https://21st.dev/@jahed/components/apple-tahoe-liquid-glass-button'

test('glass attribution distinguishes the supplied component from its MIT squircle portion', () => {
  assert.ok(notices.includes(originalComponent))
  assert.match(notices, /Hossain Jahed/)
  assert.match(notices, /@lisse\/core.*0\.7\.2/)
  assert.match(notices, /Copyright \(c\) 2026 Jace Attard/)
  assert.match(notices, /The above copyright notice and this permission notice shall be included in all/)
  assert.match(notices, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/)
  assert.match(notices, /This notice does \*\*not\*\* identify the entire supplied component as MIT-licensed/)
})

test('homepage includes a visible keyboard-accessible credit to the component author', () => {
  const credit = homepage.match(/<a\s+href="https:\/\/21st\.dev\/@jahed\/components\/apple-tahoe-liquid-glass-button"[\s\S]*?<\/a>/)?.[0]
  assert.ok(credit)
  assert.match(credit, /Glass component by Hossain Jahed/)
  assert.match(credit, /rel="noopener noreferrer"/)
  assert.match(credit, /min-h-11/)
  assert.match(credit, /focus-visible:outline/)
  assert.match(credit, /opens in a new tab/)
  assert.match(homepage, /https:\/\/www\.instagram\.com\/ramin\.nsso/)
  assert.match(homepage, /https:\/\/wa\.link\/gh1dhy/)
})

test('release acceptance includes production evidence and preserved mobile routing', () => {
  assert.match(checklist, /Android Chrome/)
  assert.match(checklist, /iPhone Safari and iPhone Chrome/)
  assert.match(checklist, /Deity/)
  assert.match(checklist, /Required GitHub `verify` and `database` checks/)
  assert.match(checklist, /exact promoted revision/)
  assert.match(checklist, /must not be described as physical-device verification/)
})
