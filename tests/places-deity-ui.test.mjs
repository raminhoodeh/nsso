import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const chat = read("../src/app/places/dubai/PlacesDeity.tsx");
const css = read("../src/app/places/dubai/deity.module.css");
const explorer = read("../src/app/places/dubai/PlacesExplorer.tsx");
const globalAgent = read("../src/components/agent/ConditionalNSSOAgent.tsx");

test("Places Deity is a separate public-map assistant, not the account-mutating global chat", () => {
  assert.match(chat, /fetch\("\/api\/deity\/places"/);
  assert.doesNotMatch(chat, /fetch\("\/api\/deity\/chat"|executeAction|splitActionPayload|useProfile|supabase/);
  assert.match(globalAgent, /pathname\.startsWith\('\/places'\)/);
  assert.match(chat, /src="\/nsso-agent-avatar\.png"/);
  assert.match(chat, /src="\/deity logo white\.png"/);
});

test("assistant content is plain React text and recommendation links come from canonical map records", () => {
  assert.doesNotMatch(chat, /dangerouslySetInnerHTML|innerHTML|eval\(|new Function|href=\{(?:pick|message|result)/);
  assert.match(chat, /\{message\.content\}/);
  assert.match(chat, /props\.places\.find\(item => item\.id === pick\.placeId\)/);
  assert.match(chat, /if \(!place \|\| placeClosureNotice\(place\)\) return null/);
  assert.match(chat, /activeEventsFor\(place, Date\.now\(\)\)/);
  assert.match(chat, /if \(pick\.eventId && !event\) return null/);
  assert.match(chat, /props\.onSelectPlace\(place\.id\)/);
});

test("opening mobile Deity isolates map and navigation and prevents competing drawers", () => {
  assert.match(chat, /open: compact && open, panelRef, initialFocusRef: closeRef, modal: true/);
  assert.match(chat, /role="dialog"[\s\S]*?aria-modal=\{compact \|\| undefined\}/);
  assert.match(explorer, /inert=\{galleryOpen \|\| \(isCompact && \(mobilePanelOpen \|\| deityOpen\)\)\}/);
  assert.match(explorer, /className=\{styles\.explorerContent\} inert=\{galleryOpen \|\| \(isCompact && deityOpen\)\}/);
  assert.match(explorer, /if \(value\) setMobilePanelOpen\(false\)/);
  assert.match(explorer, /const openMobilePanel = useCallback\(\(\) => \{\s+setDeityOpen\(false\)/);
  assert.match(explorer, /launcherHidden=\{galleryOpen \|\| \(isCompact && mobilePanelOpen\)\}/);
});

test("minimizing or closing the assistant preserves the in-tab conversation and pending reply", () => {
  assert.match(chat, /const \[messages, setMessages\] = useState<Message\[\]>\(\[\]\)/);
  assert.match(chat, /function dismiss\(minimize: boolean\) \{[\s\S]*?setMinimized\(minimize\);[\s\S]*?onOpenChange\(false\)/);
  const dismissBody = chat.match(/function dismiss\(minimize: boolean\) \{([\s\S]*?)\n  \}/)[1];
  assert.doesNotMatch(dismissBody, /setMessages|setDraft|\.abort\(/);
  assert.match(chat, /minimized \? "Resume Deity" : "Ask Deity"/);
  assert.doesNotMatch(chat, /(?:localStorage|sessionStorage)\.setItem/);
  // Keeping the component mounted is what preserves messages after open changes.
  assert.match(explorer, /<PlacesDeity\s+open=\{deityOpen\}/);
  assert.doesNotMatch(explorer, /deityOpen && \(?\s*<PlacesDeity/);
});

test("requests are bounded, cancellable and expose retry without sending an empty or duplicate request", () => {
  assert.match(chat, /!content \|\| content\.length > 2000 \|\| controllerRef\.current/);
  assert.match(chat, /new AbortController\(\)/);
  assert.match(chat, /signal: controller\.signal/);
  assert.match(chat, /40_000/);
  assert.match(chat, /window\.clearTimeout\(timer\); controllerRef\.current = null; setBusy\(false\)/);
  assert.match(chat, /aria-label="Stop response"/);
  assert.match(chat, /role="alert"/);
  assert.match(chat, /Try again/);
  assert.match(chat, /!event\.nativeEvent\.isComposing/);
});

test("chat panels stay opaque and touch controls remain usable at mobile sizes", () => {
  assert.match(css, /\.panel \{[^}]*background: #11161d/);
  assert.match(css, /\.transcript \{[^}]*min-height: 0;[^}]*overflow: auto;[^}]*overscroll-behavior: contain/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?height: (?:var\(--deity-viewport-height, )?100dvh/);
  assert.match(css, /padding-bottom: max\(14px, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.inputRow textarea \{ font-size: 16px; \}/);
  assert.match(css, /\.header button, \.inputRow button \{ width: 44px; height: 44px; \}/);
  assert.match(chat, /AI suggestions, not live availability/);
});

test("sidebar width is persisted independently and resizes the map without resetting its center", () => {
  assert.match(explorer, /localStorage\.getItem\("nsso-places-menu-minimized"\)/);
  assert.match(explorer, /localStorage\.setItem\("nsso-places-menu-minimized", String\(value\)\)/);
  assert.match(explorer, /navigationMinimized && !isCompact \? "72px" : "460px"/);
  assert.match(explorer, /const center = map\.getCenter\(\);[\s\S]*?google\.maps\.event\.trigger\(map, "resize"\);[\s\S]*?if \(center\) map\.setCenter\(center\)/);
});
