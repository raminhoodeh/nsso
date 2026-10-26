import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeNssoBrand } from '../src/lib/deity/brand.ts';

test('assistant prose always spells the product name in lowercase', () => {
  assert.equal(normalizeNssoBrand('NSSO, Nsso and nSsO. NSSO\'s profile.'), "nsso, nsso and nsso. nsso's profile.");
  assert.equal(normalizeNssoBrand('NSSO_CHAT_IP_HASH_SECRET and NSSOAgent'), 'NSSO_CHAT_IP_HASH_SECRET and NSSOAgent');
  for (const partial of ['N', 'NS', 'NSS', 'NSSO', 'NSSO is']) {
    assert.doesNotMatch(normalizeNssoBrand(partial), /\bNSSO\b/);
  }
});

test('chat display normalizes assistant text and labels, not user messages or link destinations', async () => {
  const source = await readFile(new URL('../src/components/agent/AgentChatInterface.tsx', import.meta.url), 'utf8');
  assert.match(source, /isAssistant \? normalizeNssoBrand\(text\) : text/);
  assert.match(source, /renderMessage\(msg.content, msg.role === 'model'\)/);
  assert.match(source, /displayText\(mdMatch\[1\]\)/);
  assert.match(source, /href=\{safeWebUrl\(mdMatch\[2\]\) \|\| undefined\}/);
  assert.match(source, /href=\{safeWebUrl\(subPart\) \|\| undefined\}/);
});
