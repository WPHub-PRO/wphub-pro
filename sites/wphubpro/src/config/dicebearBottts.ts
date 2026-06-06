/** Dicebear HTTP API (bottts). See https://www.dicebear.com/styles/bottts/ */
export const DICEBEAR_BOTTTS_VERSION = '9.x';

/** Preset seeds for the profile picker grid (not exhaustive — any string is valid as a seed). */
export const BOTTTS_PRESET_SEEDS = [
  'Felix',
  'Aneka',
  'Luna',
  'Milo',
  'Nova',
  'Atlas',
  'Echo',
  'Quinn',
  'Riley',
  'Sage',
  'Storm',
  'Coral',
  'Ember',
  'Frost',
  'Glimmer',
  'Pixel',
  'Vega',
  'Zoe',
  'Orion',
  'Iris',
  'Juno',
  'Kite',
  'Nimbus',
  'Mango',
] as const;

function encodeSeed(seed: string) {
  return encodeURIComponent(seed.slice(0, 256));
}

export function getDicebearBotttsSvgUrl(seed: string) {
  return `https://api.dicebear.com/${DICEBEAR_BOTTTS_VERSION}/bottts/svg?seed=${encodeSeed(seed)}`;
}
