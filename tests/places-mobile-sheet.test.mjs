import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const sheet = read("../src/app/places/dubai/MobileSheet.tsx");
const sheetCss = read("../src/app/places/dubai/mobile-sheet.module.css");
const nav = read("../src/app/places/dubai/MobilePlacesNavigation.tsx");
const navCss = read("../src/app/places/dubai/mobile-navigation.module.css");

test("mobile bottom sheet has explicit sizes, exposes state and reserves the bottom navigation", () => {
  assert.match(sheet, /export type MobileSheetSnap = "peek" \| "half" \| "full"/);
  assert.match(sheet, /data-mobile-sheet="true"/);
  assert.match(sheet, /data-snap=\{snap\}/);
  assert.match(sheetCss, /var\(--mobile-bottom-offset, calc\(86px \+ env\(safe-area-inset-bottom\)\)\)/);
  assert.match(sheetCss, /\.sheet\[data-snap="peek"\][^}]*max-height: min\(290px/);
  assert.match(sheetCss, /\.sheet\[data-snap="half"\][^}]*height: min\(60dvh/);
  assert.match(sheetCss, /\.sheet\[data-snap="full"\][^}]*height: var\(--sheet-available\)/);
  assert.match(sheetCss, /prefers-reduced-motion: reduce/);
});

test("only full height sheets trap focus while all sizes have explicit keyboard resize and dismissal", () => {
  assert.match(sheet, /open: open && full/);
  assert.match(sheet, /aria-modal=\{full \|\| undefined\}/);
  assert.match(sheet, /if \(!full && event\.key === "Escape"\)/);
  assert.match(sheet, /aria-label=\{`Expand \$\{ariaLabel\}`\}/);
  assert.match(sheet, /aria-label=\{`Minimize \$\{ariaLabel\}`\}/);
  assert.match(sheet, /aria-label=\{`Close \$\{ariaLabel\}`\}/);
  assert.match(sheet, /event\.key === "ArrowUp"/);
  assert.match(sheet, /event\.key === "ArrowDown"/);
  assert.match(sheet, /handleRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(sheetCss, /\.actions button[^}]*width: 44px; height: 44px/);
});

test("dragging is attached only to the resize handle and does not consume content scrolling", () => {
  assert.equal((sheet.match(/onPointerDown=/g) || []).length, 1);
  assert.match(sheet, /ref=\{handleRef\}[\s\S]*?onPointerDown=/);
  assert.match(sheet, /setPointerCapture\(event\.pointerId\)/);
  assert.match(sheet, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(sheet, /if \(Math\.abs\(distance\) < 42\) return/);
  assert.match(sheet, /onPointerCancel=/);
  assert.match(sheetCss, /\.handle[^}]*touch-action: none/);
  assert.match(sheetCss, /\.scroll[^}]*touch-action: pan-y/);
  assert.match(navCss, /\.menu[^}]*touch-action: pan-y/);
});

test("mobile navigation has one primary map action and no repeated Deity or utility controls", () => {
  assert.equal((nav.match(/onClick=\{onMap\}/g) || []).length, 1);
  assert.match(nav, /Show \{resultLabel\} on map/);
  assert.doesNotMatch(nav, /Plan with Deity|Ask Deity|Surprise us|Near me|onClick=\{onSaved\}/);
  assert.match(nav, /aria-label="Browse view"/);
  assert.match(nav, /Categories<\/button>/);
  assert.match(nav, /setSettingsOpen\(false\); onResults\(\)/);
  assert.match(nav, /if \(resultsOpen\) onBack\(\)/);
});

test("the mobile menu retains six source categories, tucked filters and collapsed date ideas", () => {
  assert.match(nav, /EXPERIENCES\.map\(item =>/);
  assert.match(nav, /aria-label="Experiences"/);
  assert.match(nav, /const \[settingsOpen, setSettingsOpen\] = useState\(false\)/);
  assert.match(nav, /aria-controls="places-mobile-filter-menu"/);
  assert.match(nav, /id="places-mobile-filter-menu"[^>]*hidden=\{!settingsOpen\}/);
  assert.match(nav, /aria-label="Filter by emirate"/);
  assert.match(nav, /aria-label="Event date window"/);
  assert.match(nav, /const \[plansOpen, setPlansOpen\] = useState\(false\)/);
  assert.match(nav, /id="places-mobile-date-ideas"[^>]*hidden=\{!plansOpen\}/);
  assert.match(nav, /onClick=\{\(\) => onSubcategory\(item\.id\)\}/);
  assert.match(navCss, /\.row[^}]*min-height: 52px/);
  assert.match(navCss, /\.filterMenu select[^}]*font-size: 16px/);
});

test("short landscape uses available height and does not trap a list below expanded settings", () => {
  assert.match(nav, /if \(open && window\.matchMedia\("\(max-height: 500px\)"\)\.matches\) onSnapChange\("full"\)/);
  assert.match(nav, /aria-pressed=\{resultsOpen\} onClick=\{\(\) => \{ setSettingsOpen\(false\); onResults\(\); \}\}/);
  assert.match(sheetCss, /@media \(max-height: 500px\)[\s\S]*?\.header \{ min-height: 44px/);
  assert.match(navCss, /@media \(max-height: 500px\) and \(min-width: 600px\)/);
  assert.match(navCss, /\.controls \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(navCss, /\.filterMenu \{ grid-column: 1 \/ -1; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(navCss, /\.experienceGroup \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
