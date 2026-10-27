import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/agent/AgentChatInterface.tsx', import.meta.url), 'utf8')

test('Deity removes the fast-mode switch and never reads a stale preference to auto-apply', () => {
    assert.doesNotMatch(source, /\b(?:fastMode|setFastMode|fastModeRef|toggleFastMode)\b/)
    assert.match(source, /onClick=\{\(\) => \{void handleApplyAction\(msg\.id,action\)\}\}/)
    assert.match(source, /operationId:crypto\.randomUUID\(\),expectedRevision:requestRevision,status:'proposed'/)
    const receive = source.slice(source.indexOf('const handleSendMessage'), source.indexOf('const handleCategoryClick'))
    assert.doesNotMatch(receive, /applyProposals\(/)
})

test('Deity uses stable short guidance and keeps the actual mobile writing font at sixteen pixels', () => {
    assert.match(source, /placeholder="Message Deity…"/)
    assert.doesNotMatch(source, /placeholderIndex|setInterval\(/)
    const composer = source.slice(source.indexOf('<textarea'), source.indexOf('</form>'))
    assert.match(composer, /text-base leading-6/)
    assert.match(composer, /maxLength=\{4000\}/)
    assert.match(composer, /event\.nativeEvent\.isComposing/)
})

test('compact spacing retains opaque surfaces, minimum touch targets and phone safe areas', () => {
    assert.match(source, /data-deity-surface="opaque"/)
    assert.match(source, /pb-\[max\(0\.5rem,env\(safe-area-inset-bottom\)\)\]/)
    assert.match(source, /inline-flex h-11 w-11/)
    assert.match(source, /role="log"[\s\S]*?space-y-3[^"\n]*px-3 py-3/)
    assert.doesNotMatch(source, /backdrop-filter|backdrop-blur|bg-transparent/)
})
