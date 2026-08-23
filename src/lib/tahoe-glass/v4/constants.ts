/**
 * The small-control optical constants from the supplied Tahoe reference.
 *
 * V4 deliberately keeps this profile exact for controls. Large surfaces use
 * a separate, CSS-pixel edge lens so that stretching a 60px button field over
 * a full-height card cannot erase the visible bend.
 */
export const TAHOE_V4_CONTROL_DISPLACEMENT_PX = 35;
export const TAHOE_V4_CONTROL_SUPERELLIPSE_POWER = 3.5;
export const TAHOE_V4_CONTROL_CURVE_POWER = 0.8;
export const TAHOE_V4_RIM_BINS = 24;
export const TAHOE_V4_LIGHT_SOURCE = { x: 0.5, y: 0 } as const;

export const TAHOE_V4_EDGE_LENS_MIN_BAND_PX = 40;
export const TAHOE_V4_EDGE_LENS_MAX_BAND_PX = 88;
export const TAHOE_V4_EDGE_LENS_SHORT_SIDE_RATIO = 0.12;

export const TAHOE_V4_DEFAULT_MAX_DPR = 1;
export const TAHOE_V4_DEFAULT_MAX_FPS = 30;
export const TAHOE_V4_DEFAULT_CLOUD_RENDER_SCALE = 0.75;
export const TAHOE_V4_DEFAULT_SOURCE_TIMEOUT_MS = 10_000;
export const TAHOE_V4_MAX_DISPLACEMENT_CACHE_ENTRIES = 96;
export const TAHOE_V4_MAX_DISPLACEMENT_CACHE_BYTES = 32 * 1024 * 1024;
export const TAHOE_V4_MAX_SURFACE_FIELD_PIXELS = 1_000_000;
export const TAHOE_V4_MAX_VIEWPORT_PIXELS = 2_500_000;

export const TAHOE_V4_DEFAULT_CLOUD_PALETTE = {
  sky: 0x586e91,
  cloud: 0xadcdde,
  shadow: 0x183550,
  sun: 0xff9919,
  glare: 0xff6633,
  sunlight: 0xff9933,
} as const;
