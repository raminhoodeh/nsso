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

test("the RazinFlix add-film dialog uses an opaque modal surface", () => {
  assert.match(modalSource, /import styles from ['"]\.\/AddFilmModal\.module\.css['"]/);
  assert.match(modalSource, /data-razinflix-add-film-surface="opaque"/);
  assert.match(modalSource, /className=\{`\$\{styles\.dialog\}/);
  assert.match(modalSource, /overlayClassName=\{styles\.overlay\}/);
  assert.match(modalSource, /backdropClassName=\{styles\.backdrop\}/);
  assert.match(modalStyles, /\.dialog::before[\s\S]*?background:\s*#202126/);
});

test("the add-film controls reuse the opaque RazinFlix menu greys", () => {
  assert.match(modalSource, /styles\.header/);
  assert.match(modalSource, /styles\.inputPanel/);
  assert.match(modalSource, /styles\.statusPanel/);
  assert.match(
    modalStyles,
    /\.header::before,\s*\n\.inputPanel::before\s*\{[\s\S]*?background:\s*#2b2d33/,
  );
  assert.match(modalStyles, /\.statusPanel::before\s*\{[\s\S]*?background:\s*#151619/);
});

test("the add-film dialog blocks the moving page behind it", () => {
  assert.match(modalStyles, /\.backdrop\s*\{[\s\S]*?background:\s*rgba\(0,\s*0,\s*0,\s*0\.9\)/);
  assert.match(modalStyles, /\.overlay\s*\{[\s\S]*?z-index:\s*10020\s*!important/);
});
