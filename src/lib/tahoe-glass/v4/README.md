# Tahoe Glass V4 core

V4 owns one WebGL context and one explicit pixel scene. It renders that scene
to an FBO and applies the displacement composite in the same context. The DOM
material is intentionally outside this package so it remains visible during
loading, fallback, context loss, and feature rollback.

## Supported scene contract

- `clouds`: the pinned Vanta CLOUDS 0.5.24 volumetric shader, bundled locally,
  with `horizonOffset` as a real uniform.
- `image`: a same-origin/CORS-enabled URL or owned decoded image.
- `video`: an owned `<video>` with a current CORS-safe frame.
- `material-only`: an explicit, non-refractive fallback.

Arbitrary DOM, interactive Maps DOM, and foreign WebGL canvases are not scene
sources. V4 does not use `captureStream`, DOM screenshots, or cross-context
canvas uploads.

## Optical contract

- `control` preserves the supplied `35 / 3.5 / 0.8 / 24` control field bytes.
- `edge-lens` uses the actual rounded-rectangle radius and a fixed CSS-pixel
  band: `clamp(40px, 12% of the short side, 88px)`, capped at half the short
  side.
- `material-only` surfaces are ignored by the displacement compositor.
- Overlapping refractive surfaces use deterministic priority/DOM paint order;
  the top field wins. V4 does not claim recursive refraction of foreground DOM.
- The supplied 24-bin analysis is exported and emitted as directional rim CSS
  variables when surface geometry changes.

## Runtime limits

- Default maximum DPR: `1`.
- Default continuous frame cap: `30fps` (caller may request `1..60`).
- Clouds render at the approved Vanta `75%` internal resolution by default and
  are linearly presented at the output resolution in the same context.
- Rendering stops while the document is hidden.
- Maximum viewport allocation: `2,500,000` pixels, further capped by the
  context's `MAX_TEXTURE_SIZE`.
- Maximum generated pixels per cached surface field: `1,000,000`.
- Displacement field cache: at most `96` entries and `32MiB`, LRU-evicted.
- Image/video dimensions may not exceed the context's `MAX_TEXTURE_SIZE`.
- Source resolution timeout: `10s` by default.

`refraction-presented` is a mechanical state: a non-neutral map was composited,
GPU work completed, and a non-empty pixel was read from the visible canvas. It
does not claim perceptual approval. Screenshot/on-off visual tests own that
release gate.
