import {
  TAHOE_V4_PROOF_BASE_WHITE_PREDICTION,
  measureTahoeV4RefractionProof,
  selectTahoeV4RefractionProofSamples,
  tahoeV4PublishedProofMetrics,
  tahoeV4RefractionProofPassed,
  type TahoeV4RefractionProofSample,
} from "../proof";
import type { TahoeV4SurfaceSnapshot } from "../types";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`tahoe-v4-proof-contract: ${message}`);
}

function surface(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): TahoeV4SurfaceSnapshot {
  return {
    id,
    profile: "edge-lens",
    rect: { x, y, width, height },
    clipRect: { x, y, width, height },
    cornerRadiiPx: {
      topLeft: 24,
      topRight: 24,
      bottomRight: 24,
      bottomLeft: 24,
    },
    priority: 0,
    continuous: false,
    visible: true,
    opacity: 1,
  };
}

function paintBend(
  data: Uint8Array,
  viewportWidth: number,
  target: TahoeV4SurfaceSnapshot,
  channel: number,
): void {
  for (let y = target.rect.y; y < target.rect.y + target.rect.height; y += 1) {
    for (let x = target.rect.x; x < target.rect.x + target.rect.width; x += 1) {
      const offset = (y * viewportWidth + x) * 4;
      data[offset] = channel;
      data[offset + 1] = channel;
      data[offset + 2] = 128;
      data[offset + 3] = 255;
    }
  }
}

function proofRgb(
  samples: readonly TahoeV4RefractionProofSample[],
  delta: (sample: TahoeV4RefractionProofSample, index: number) => number,
): Uint8Array {
  const rgb = new Uint8Array(samples.length * 3);
  for (let index = 0; index < samples.length; index += 1) {
    const value = delta(samples[index], index);
    rgb.fill(value, index * 3, index * 3 + 3);
  }
  return rgb;
}

/** Deterministic fixtures consumed by the V4 contract runner and review tools. */
export function runTahoeV4ProofContractFixtures(): void {
  const width = 390;
  const height = 844;
  const header = surface("header", 0, 0, 390, 88);
  const nestedHeaderAction = surface("header-action", 275, 19, 96, 50);
  const firstCard = surface("card-one", 35, 230, 320, 220);
  const secondCard = surface("card-two", 35, 545, 320, 220);
  const map = new Uint8Array(width * height * 4);
  paintBend(map, width, header, 255);
  paintBend(map, width, nestedHeaderAction, 245);
  paintBend(map, width, firstCard, 225);
  paintBend(map, width, secondCard, 215);
  const samples = selectTahoeV4RefractionProofSamples(
    map,
    width,
    height,
    1,
    [header, nestedHeaderAction, firstCard, secondCard],
  );
  const owners = new Set(samples.map((sample) => sample.surfaceId));
  invariant(samples.length === 12, "fixture should fill the bounded sample set");
  invariant(owners.has("header"), "header must retain representative probes");
  invariant(
    owners.has("header-action"),
    "nested header action must retain representative probes",
  );
  invariant(owners.has("card-one"), "middle card must receive reserved probes");
  invariant(owners.has("card-two"), "lower card must receive reserved probes");
  for (const owner of owners) {
    invariant(
      samples.filter((sample) => sample.surfaceId === owner).length >= 2,
      `${owner} must receive at least two probes`,
    );
  }

  const control = proofRgb(samples, () => 0);
  const weak = proofRgb(samples, (_sample, index) => (index < 3 ? 4 : 0));
  const weakMetrics = measureTahoeV4RefractionProof(control, weak, samples);
  invariant(
    !tahoeV4RefractionProofPassed(weakMetrics),
    "three of twelve raw-MAE-4 probes must remain subthreshold",
  );

  const nearWhiteControl = proofRgb(samples, () => 243);
  const nearWhiteDisplaced = proofRgb(samples, () => 255);
  const nearWhiteMetrics = measureTahoeV4RefractionProof(
    nearWhiteControl,
    nearWhiteDisplaced,
    samples,
  );
  invariant(
    !tahoeV4RefractionProofPassed(nearWhiteMetrics),
    "near-white raw-MAE-12 must fail after white-layer adjustment",
  );

  const semanticTintControl = proofRgb(samples, () => 0);
  const semanticTintDisplaced = proofRgb(samples, (_sample, index) =>
    index === samples.length - 1 ? 80 : 11,
  );
  const obsoleteBaseWhiteMetrics = measureTahoeV4RefractionProof(
    semanticTintControl,
    semanticTintDisplaced,
    samples,
    TAHOE_V4_PROOF_BASE_WHITE_PREDICTION,
  );
  const shippedTintMetrics = measureTahoeV4RefractionProof(
    semanticTintControl,
    semanticTintDisplaced,
    samples,
  );
  invariant(
    tahoeV4RefractionProofPassed(obsoleteBaseWhiteMetrics),
    "semantic-tint regression must exercise a case the old 60% model passed",
  );
  invariant(
    !tahoeV4RefractionProofPassed(shippedTintMetrics),
    "max semantic tint must prevent the old 60%-transmission false positive",
  );

  const strongControl = proofRgb(samples, () => 32);
  const strong = proofRgb(samples, () => 160);
  const headerOnly = proofRgb(samples, (sample) =>
    sample.surfaceId === "header" || sample.surfaceId === "header-action"
      ? 160
      : 32,
  );
  const headerOnlyMetrics = measureTahoeV4RefractionProof(
    strongControl,
    headerOnly,
    samples,
  );
  invariant(
    !tahoeV4RefractionProofPassed(headerOnlyMetrics),
    "header plus nested action must not satisfy viewport distribution",
  );

  const headerAndLowerCard = proofRgb(samples, (sample) =>
    sample.surfaceId === "header" || sample.surfaceId === "card-two"
      ? 160
      : 32,
  );
  const headerAndLowerMetrics = measureTahoeV4RefractionProof(
    strongControl,
    headerAndLowerCard,
    samples,
  );
  invariant(
    tahoeV4RefractionProofPassed(headerAndLowerMetrics),
    "header plus lower-card change must satisfy distributed proof",
  );

  const strongMetrics = measureTahoeV4RefractionProof(
    strongControl,
    strong,
    samples,
  );
  invariant(
    strongMetrics.changedSurfaceCount >= 3,
    "strong fixture must change every represented surface",
  );
  invariant(
    tahoeV4RefractionProofPassed(strongMetrics),
    "strong multi-surface refraction must certify",
  );
  const publishedAfterWeakRevalidation = tahoeV4PublishedProofMetrics(
    strongMetrics,
    weakMetrics,
  );
  invariant(
    publishedAfterWeakRevalidation === strongMetrics &&
      tahoeV4RefractionProofPassed(publishedAfterWeakRevalidation),
    "weak revalidation must not replace the last certified proof",
  );
}

runTahoeV4ProofContractFixtures();
