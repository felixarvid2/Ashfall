/**
 * Ambient life (round 4, D10) and weather variants (D11): cheap point clouds around the camera, per region.
 * Ambient life is the small things that live there (ash moths, drifting spores, crystal motes, Lumen sparks);
 * weather is a rain of ash in the Cinder Flats, spore drift in the Vaults and a light rain of motes in the Core.
 * Both follow the graphics preset: low shows neither, medium the ambient life and half the weather, high everything.
 */
export type GraphicsPreset = 'low' | 'medium' | 'high';

export interface CloudDef {
  count: number;
  /** Palette (cycled over the particles). */
  colors: readonly string[];
  /** Point size (m) and whether it glows (additive). */
  size: number;
  additive: boolean;
  opacity: number;
  /** Mean velocity (m/s) and the wander on top of it (amplitude m/s, frequency rad/s). */
  vel: readonly [number, number, number];
  wander: number;
  freq: number;
  /** Height band above the ground the cloud lives in. */
  y: readonly [number, number];
}

export interface RegionAtmosphere {
  ambient: CloudDef;
  weather?: CloudDef;
}

export const ATMOSPHERE: Readonly<Record<string, RegionAtmosphere>> = {
  'zone.cinder_flats': {
    // Pale ash moths flutter at head height; the rain is grey ash falling slantwise, faster than the flakes.
    ambient: { count: 70, colors: ['#e8dcc4', '#cfc4ae'], size: 0.16, additive: false, opacity: 0.85, vel: [0.15, 0, 0.1], wander: 1.4, freq: 5, y: [0.6, 3.2] },
    weather: { count: 900, colors: ['#8a8680', '#a09a90'], size: 0.09, additive: false, opacity: 0.7, vel: [1.2, -5.5, 0.4], wander: 0.2, freq: 2, y: [0, 16] },
  },
  'zone.refinery_district': {
    ambient: { count: 80, colors: ['#ffb060', '#ff8a3a'], size: 0.1, additive: true, opacity: 0.8, vel: [0, 0.6, 0], wander: 0.7, freq: 3, y: [0.5, 8] },
  },
  'zone.hydroponic_vaults': {
    ambient: { count: 110, colors: ['#b8ff9a', '#8aff6a', '#e8ffb0'], size: 0.14, additive: true, opacity: 0.7, vel: [0.05, 0.25, 0.05], wander: 0.5, freq: 1.4, y: [0.4, 6] },
    weather: { count: 700, colors: ['#7aff5a', '#a8ff8a'], size: 0.1, additive: true, opacity: 0.55, vel: [1.6, -0.15, 0.7], wander: 0.35, freq: 1.1, y: [0.3, 9] },
  },
  'zone.deep_mines': {
    ambient: { count: 90, colors: ['#7fdcff', '#5ac8ff', '#c8f4ff'], size: 0.12, additive: true, opacity: 0.8, vel: [0, 0.05, 0], wander: 0.18, freq: 0.9, y: [0.4, 5] },
  },
  'zone.the_core': {
    ambient: { count: 100, colors: ['#fff0c8', '#ffd88a', '#c8a4ff'], size: 0.13, additive: true, opacity: 0.9, vel: [0, 0.3, 0], wander: 0.9, freq: 4, y: [0.5, 7] },
    weather: { count: 800, colors: ['#ffe9b0', '#e2d0ff', '#ffffff'], size: 0.1, additive: true, opacity: 0.6, vel: [0.1, -1.1, 0.05], wander: 0.25, freq: 1.5, y: [0, 14] },
  },
};

/** The clouds a zone shows at a graphics preset, with their particle counts already scaled. */
export function atmosphereFor(zoneId: string, preset: GraphicsPreset): { ambient: CloudDef | null; weather: CloudDef | null } {
  const region = ATMOSPHERE[zoneId];
  if (!region || preset === 'low') return { ambient: null, weather: null };
  const weatherShare = preset === 'high' ? 1 : 0.5;
  return {
    ambient: region.ambient,
    weather: region.weather ? { ...region.weather, count: Math.round(region.weather.count * weatherShare) } : null,
  };
}
