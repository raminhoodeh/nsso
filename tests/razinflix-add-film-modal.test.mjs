import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const modalSource = fs.readFileSync(
  path.join(root, "src/components/film/AddFilmModal.tsx"),
  "utf8",
);
const modalStyles = fs.readFileSync(
  path.join(root, "src/components/film/AddFilmModal.module.css"),
  "utf8",
);

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = modalStyles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

test("the RazinFlix add-film dialog is a real opaque DOM surface", () => {
  assert.match(modalSource, /import \{ createPortal \} from ['"]react-dom['"]/);
  assert.match(modalSource, /data-razinflix-add-film-surface="opaque-native"/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.doesNotMatch(modalSource, /TahoeGlass(?:Dialog|Surface|Field|Button)/);

  const dialog = cssBlock(".dialog");
  assert.match(dialog, /background:\s*#202126/);
  assert.doesNotMatch(dialog, /transparent/);
  assert.doesNotMatch(modalStyles, /\.dialog::before/);
});

test("the modal uses solid RazinFlix greys for every readable layer", () => {
  assert.match(cssBlock(".header"), /background:\s*#2b2d33/);
  assert.match(cssBlock(".content"), /background:\s*#202126/);
  assert.match(cssBlock(".textarea"), /background:\s*#2b2d33/);
  assert.match(cssBlock(".statusPanel"), /background:\s*#151619/);
});

test("the native portal outranks the fixed mobile navigation", () => {
  assert.match(modalSource, /data-razinflix-add-film-overlay="native"/);
  assert.match(modalSource, /style=\{\{ zIndex: 2147483000 \}\}/);
  assert.match(cssBlock(".overlay"), /position:\s*fixed/);
  assert.match(cssBlock(".overlay"), /inset:\s*0/);
  assert.match(cssBlock(".backdrop"), /background:\s*rgba\(0,\s*0,\s*0,\s*0\.94\)/);
});

test("the replacement retains modal keyboard and focus behavior", () => {
  assert.match(modalSource, /FOCUSABLE_SELECTOR/);
  assert.match(modalSource, /event\.key === 'Escape'/);
  assert.match(modalSource, /event\.key !== 'Tab'/);
  assert.match(modalSource, /previouslyFocused\?\.focus/);
});
