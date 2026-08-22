/**
 * Optical constants copied from the supplied Apple Tahoe implementation.
 * Keep these values stable: they are the visual contract, not tuning knobs.
 */
export const TAHOE_DISPLACEMENT_SCALE = 35;
export const TAHOE_SUPERELLIPSE_POWER = 3.5;
export const TAHOE_CURVE_POWER = 0.8;
export const TAHOE_RIM_BINS = 24;
export const TAHOE_LIGHT_SOURCE = { x: 0.5, y: 0 } as const;

export const TAHOE_SPECULAR_SHADOW = `
  inset 0 0 0 1px color-mix(in srgb, white calc(var(--rim-intensity) * 20%), transparent),
  inset calc(var(--cos) * 1.8px) calc(var(--sin) * 3px) 0px -2px color-mix(in srgb, white calc(var(--rim-intensity) * 90%), transparent),
  inset calc(var(--cos) * -2px) calc(var(--sin) * -2px) 0px -2px color-mix(in srgb, white calc(var(--rim-intensity) * 80%), transparent),
  inset calc(var(--cos) * -3px) calc(var(--sin) * -8px) 1px -6px color-mix(in srgb, white calc(var(--rim-intensity) * 60%), transparent),
  inset calc(var(--cos) * -0.3px) calc(var(--sin) * -1px) 4px 0px color-mix(in srgb, black 12%, transparent),
  inset calc(var(--cos) * -1.5px) calc(var(--sin) * 2.5px) 0px -2px color-mix(in srgb, black 20%, transparent),
  inset calc(var(--cos) * 0px) calc(var(--sin) * 3px) 4px -2px color-mix(in srgb, black 20%, transparent),
  inset calc(var(--cos) * 2px) calc(var(--sin) * -6.5px) 1px -4px color-mix(in srgb, black 10%, transparent),
  calc(var(--cos) * 4px) calc(var(--sin) * 4px) 10px 0px color-mix(in srgb, black 15%, transparent),
  calc(var(--cos) * 9px) calc(var(--sin) * 9px) 18px 0px color-mix(in srgb, black 10%, transparent)
`;
