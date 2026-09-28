import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const chat = read("../src/app/places/dubai/PlacesDeity.tsx");
const css = read("../src/app/places/dubai/deity.module.css");
const explorer = read("../src/app/places/dubai/PlacesExplorer.tsx");
const mobileDetails = read("../src/app/places/dubai/MobilePlaceDetails.tsx");
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

test("Deity and full mobile sheets isolate the map while half sheets keep it interactive", () => {
  assert.match(chat, /open: compact && open, panelRef, initialFocusRef: closeRef, modal: true/);
  assert.match(chat, /role="dialog"[\s\S]*?aria-modal=\{compact \|\| undefined\}/);
  assert.match(explorer, /const mobileModalOpen = isCompact && \(deityOpen \|\| \(mobilePanelOpen && navigationSnap === "full"\) \|\| \(!!selectedPlace && !mobilePanelOpen && detailSnap === "full"\)\)/);
  assert.match(explorer, /aria-hidden=\{galleryOpen \|\| mobileModalOpen\}\s+inert=\{galleryOpen \|\| mobileModalOpen\}/);
  assert.match(explorer, /className=\{styles\.explorerContent\} inert=\{galleryOpen \|\| \(isCompact && deityOpen\)\}/);
  assert.match(explorer, /if \(value\) \{ setMobilePanelOpen\(false\); setMapOptionsOpen\(false\); \}/);
  assert.match(explorer, /const openMobilePanel = useCallback\(\(\) => \{\s+setDeityOpen\(false\)/);
  assert.match(explorer, /launcherHidden=\{galleryOpen \|\| \(isCompact && mobilePanelOpen\)\}/);
  assert.match(explorer, /aria-label="Places navigation" inert=\{mobileModalOpen\} aria-hidden=\{mobileModalOpen\}/);
});

test("a Deity recommendation outside filters gets its own pin without clearing the chosen collection", () => {
  assert.match(explorer, /const mapPlaces = useMemo\(\(\) => selectedPlace && !filteredPlaces\.some\(place => place\.id === selectedPlace\.id\)\s*\? \[\.\.\.filteredPlaces, selectedPlace\] : filteredPlaces/);
  assert.match(explorer, /clusterPlaces\(mapPlaces, markerZoom, markerSelection\)/);
  const selectionBody = explorer.match(/const selectPlace = useCallback\(\(placeId: string, fromDeity = false\) => \{([\s\S]*?)\n  \}, \[\]\)/)?.[1];
  assert.ok(selectionBody);
  assert.match(selectionBody, /setSelectedFromDeity\(fromDeity\)/);
  assert.match(selectionBody, /setDetailSnap\("peek"\)/);
  assert.match(selectionBody, /setSelectedId\(placeId\)/);
  assert.doesNotMatch(selectionBody, /clearFilters|setExperienceId|setSubcategoryId|setDatePlanId|setEmirate|setFavouritesOnly/);
  assert.match(explorer, /onSelectPlace=\{id => \{\s*selectPlace\(id, true\)/);
  assert.match(explorer, /fromDeity=\{selectedFromDeity\} onBackToDeity=\{\(\) => changeDeityOpen\(true\)\}/);
  assert.match(mobileDetails, /props\.fromDeity && <button[\s\S]*?onClick=\{props\.onBackToDeity\}[\s\S]*?Back to conversation/);
  assert.match(mobileDetails, /This place is outside your filters\. Your collection is unchanged\./);
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

test("mobile Deity is a dedicated screen with one back control and the persistent tab as its focus return", () => {
  assert.match(chat, /!open && !compact && !props\.launcherHidden/);
  assert.match(chat, /compact && <button ref=\{closeRef\}[\s\S]*?aria-label="Back to map"/);
  assert.match(chat, /!compact && <>\s*<button[\s\S]*?aria-label="Minimize Deity"[\s\S]*?aria-label="Close Deity"/);
  assert.match(chat, /compact \? document\.getElementById\("places-mobile-deity-trigger"\) : launcherRef\.current/);
  assert.match(explorer, /id="places-mobile-deity-trigger"[\s\S]*?onClick=\{\(\) => changeDeityOpen\(true\)\}[\s\S]*?aria-controls="places-deity-panel"/);
  assert.match(chat, /trigger\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.launcher \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.panel \{ position: fixed/);
  assert.match(chat, /window\.visualViewport/);
  assert.match(chat, /viewport\.addEventListener\("resize", syncKeyboardViewport\)/);
  assert.match(chat, /viewport\.removeEventListener\("resize", syncKeyboardViewport\)/);
});

test("mobile itinerary stops keep the canonical dates visible while reasons and addresses expand", () => {
  const mobileCard = chat.match(/if \(compact && timeLabel\) return <div([\s\S]*?)\n    <\/div>;/)?.[1];
  assert.ok(mobileCard, "only mobile itinerary stops use the compact layout");
  assert.match(mobileCard, /styles\.pin\}>\{index \+ 1\}/);
  assert.match(mobileCard, /Suggested · \{timeLabel\}/);
  assert.match(mobileCard, /<strong>\{place\.name\}<\/strong>/);
  assert.match(mobileCard, /\{event\.title\} · \{event\.dateLabel\}<\/span>\}\s*<details/);
  assert.match(mobileCard, /<details className=\{styles\.stopDetails\}>\s*<summary>Why this stop &amp; details/);
  assert.match(mobileCard, /<p>\{pick\.reason\}<\/p>/);
  assert.match(mobileCard, /styles\.stopAddress\}>\{place\.address\}/);
  assert.doesNotMatch(mobileCard, /<details[^>]+\bopen\b/);
  assert.match(css, /\.stopDetails summary \{[^}]*min-height: 44px/);
  assert.match(css, /\.stopDetails summary:focus-visible/);
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
