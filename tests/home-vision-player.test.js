/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const componentPath = "src/components/home/HomeVisionPlayer.tsx";
const videoPath = "public/nsso-vision-ukYfrg0ZNbA.mp4";
const posterPath = "public/nsso-vision-ukYfrg0ZNbA-poster.jpg";

test("serves the corrected film through the custom native player", () => {
  const source = fs.readFileSync(componentPath, "utf8");

  assert.match(source, /youtube\.com\/watch\?v=ukYfrg0ZNbA/);
  assert.match(source, /\/nsso-vision-ukYfrg0ZNbA\.mp4/);
  assert.match(source, /\/nsso-vision-ukYfrg0ZNbA-poster\.jpg/);
  assert.match(source, /data-home-video-player="native-controls"/);
  assert.match(source, /<video\b/);
  assert.doesNotMatch(source, /<iframe\b/);
  assert.doesNotMatch(source, /\scontrols(?:=|\s|>)/);
});

test("keeps the corrected media assets present and removes stale filenames", () => {
  assert.ok(fs.statSync(videoPath).size > 10_000_000);
  assert.ok(fs.statSync(posterPath).size > 100_000);
  assert.equal(fs.existsSync("public/nsso-vision.mp4"), false);
  assert.equal(fs.existsSync("public/nsso-vision-poster.jpg"), false);
});
