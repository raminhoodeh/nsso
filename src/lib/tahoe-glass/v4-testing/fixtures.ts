import type {
  EdgeProbeFixture,
  GlassLabSceneFixture,
  GlassLabSceneId,
  GlassLabSurfaceFixture,
  GlassLabSurfaceId,
  VisualAcceptanceThresholds,
} from "./types";

export const GLASS_LAB_SCENES: readonly GlassLabSceneFixture[] = [
  {
    id: "checker",
    label: "Calibration grid",
    description:
      "High-contrast straight edges at known positions. This is the primary displacement measurement scene.",
    src: "/glass-lab-v4/checker-calibration.svg",
    fit: "stretch",
    position: [0.5, 0.5],
  },
  {
    id: "photo",
    label: "Frozen photo",
    description:
      "A deterministic high-contrast landscape with architecture, water lines and diagonal silhouettes.",
    src: "/glass-lab-v4/photo-calibration.svg",
    fit: "cover",
    position: [0.5, 0.5],
  },
  {
    id: "frozen-clouds",
    label: "Frozen NSSO clouds",
    description:
      "A deterministic Vanta-like sky with the cloud horizon intentionally crossing the lens body.",
    src: "/glass-lab-v4/frozen-clouds.svg",
    fit: "cover",
    position: [0.5, 0.5],
  },
] as const;

const CONTROL_PROBES: readonly EdgeProbeFixture[] = [
  {
    id: "lens-x-20",
    axis: "x",
    fixed: 0.28,
    anchor: 0.2,
    searchRadius: 0.35,
    targetRgb: [255, 77, 52],
    kind: "lens",
  },
  {
    id: "lens-x-80",
    axis: "x",
    fixed: 0.72,
    anchor: 0.8,
    searchRadius: 0.35,
    targetRgb: [0, 180, 255],
    kind: "lens",
  },
  {
    id: "lens-y-20",
    axis: "y",
    fixed: 0.28,
    anchor: 0.2,
    searchRadius: 0.35,
    targetRgb: [255, 236, 0],
    kind: "lens",
  },
  {
    id: "lens-y-80",
    axis: "y",
    fixed: 0.72,
    anchor: 0.8,
    searchRadius: 0.35,
    targetRgb: [169, 139, 255],
    kind: "lens",
  },
  {
    id: "source-detail-left",
    axis: "x",
    fixed: 0.42,
    anchor: 0.2,
    searchRadius: 0.35,
    targetRgb: [255, 77, 52],
    kind: "source-detail",
  },
  {
    id: "source-detail-right",
    axis: "x",
    fixed: 0.58,
    anchor: 0.8,
    searchRadius: 0.35,
    targetRgb: [0, 180, 255],
    kind: "source-detail",
  },
] as const;

const EDGE_LENS_PROBES: readonly EdgeProbeFixture[] = [
  {
    id: "lens-x-near-left-rim",
    axis: "x",
    fixed: 0.28,
    anchor: 0.04,
    searchRadius: 0.2,
    targetRgb: [255, 49, 93],
    kind: "lens",
  },
  {
    id: "lens-x-near-right-rim",
    axis: "x",
    fixed: 0.72,
    anchor: 0.96,
    searchRadius: 0.2,
    targetRgb: [20, 255, 233],
    kind: "lens",
  },
  {
    id: "lens-y-near-top-rim",
    axis: "y",
    fixed: 0.28,
    anchor: 0.04,
    searchRadius: 0.35,
    targetRgb: [0, 255, 112],
    kind: "lens",
  },
  {
    id: "lens-y-near-bottom-rim",
    axis: "y",
    fixed: 0.72,
    anchor: 0.96,
    searchRadius: 0.35,
    targetRgb: [127, 0, 255],
    kind: "lens",
  },
  {
    id: "source-detail-near-left-rim",
    axis: "x",
    fixed: 0.42,
    anchor: 0.04,
    searchRadius: 0.2,
    targetRgb: [255, 49, 93],
    kind: "source-detail",
  },
  {
    id: "source-detail-near-right-rim",
    axis: "x",
    fixed: 0.58,
    anchor: 0.96,
    searchRadius: 0.2,
    targetRgb: [20, 255, 233],
    kind: "source-detail",
  },
] as const;

export const GLASS_LAB_SURFACES: readonly GlassLabSurfaceFixture[] = [
  {
    id: "control",
    label: "Control",
    description: "The supplied 180 by 60 button-scale optical reference.",
    width: 180,
    height: 60,
    radius: 30,
    profile: "control",
    probes: CONTROL_PROBES,
  },
  {
    id: "menu",
    label: "Menu",
    description: "A compact navigation or action menu.",
    width: 320,
    height: 400,
    radius: 24,
    profile: "edge-lens",
    probes: EDGE_LENS_PROBES,
  },
  {
    id: "mobile-card",
    label: "Mobile card",
    description: "The tall near-viewport card that exposed the original scale failure.",
    width: 340,
    height: 600,
    radius: 30,
    profile: "edge-lens",
    probes: EDGE_LENS_PROBES,
  },
  {
    id: "desktop-card",
    label: "Desktop card",
    description: "A representative large homepage feature card.",
    width: 680,
    height: 540,
    radius: 36,
    profile: "edge-lens",
    probes: EDGE_LENS_PROBES,
  },
  {
    id: "nav",
    label: "Navigation",
    description: "A full-width desktop navigation or mobile header surface.",
    width: 1000,
    height: 88,
    radius: 30,
    profile: "edge-lens",
    probes: EDGE_LENS_PROBES,
  },
  {
    id: "nested",
    label: "Nested glass",
    description: "An outer card containing a separately registered inner control.",
    width: 560,
    height: 480,
    radius: 34,
    profile: "edge-lens",
    probes: EDGE_LENS_PROBES,
  },
] as const;

export const DEFAULT_VISUAL_ACCEPTANCE_THRESHOLDS: VisualAcceptanceThresholds = {
  jndDeltaE: 2.3,
  minimumMaterialJndRatio: 0.25,
  minimumRefractionJndRatio: 0.15,
  minimumProbeEdgeContrast: 0.08,
  minimumLensProbeShiftCssPx: 4,
  minimumLensProbeCount: 4,
  minimumMaximumProbeShiftCssPx: 8,
  minimumSourceDetailProbeShiftCssPx: 3,
  minimumSourceDetailProbeCount: 2,
  requireBidirectionalLensShift: true,
};

export function getGlassLabScene(id: GlassLabSceneId): GlassLabSceneFixture {
  const fixture = GLASS_LAB_SCENES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown glass-lab scene: ${id}`);
  return fixture;
}

export function getGlassLabSurface(
  id: GlassLabSurfaceId,
): GlassLabSurfaceFixture {
  const fixture = GLASS_LAB_SURFACES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown glass-lab surface: ${id}`);
  return fixture;
}
