/**
 * The in-game credits page (round 4, D20): every third-party pack and tool in docs/credits.md, grouped. The names are
 * proper nouns and licences, so they live here; headings are in lang/en.json (credits.*). tests/round4D13.test.ts
 * checks each source against docs/credits.md.
 */
export interface CreditEntry {
  /** What it is used for. */
  what: string;
  /** Pack, author or tool, as written in docs/credits.md. */
  source: string;
  licence: string;
}
export interface CreditSection {
  id: 'models' | 'textures' | 'icons' | 'audio' | 'fonts' | 'tools';
  entries: CreditEntry[];
}

export const CREDITS: readonly CreditSection[] = [
  {
    id: 'models',
    entries: [
      { what: 'Environment light and scatter props', source: 'Poly Haven', licence: 'CC0' },
      { what: 'Enemies, props and mechs for the Core', source: 'Quaternius', licence: 'CC0' },
      { what: 'Pipes for the Core', source: 'Kenney', licence: 'CC0' },
    ],
  },
  { id: 'textures', entries: [{ what: 'Cave wall rock', source: 'ambientCG', licence: 'CC0' }] },
  {
    id: 'icons',
    entries: [
      { what: 'Status and touch menu icons', source: 'game-icons.net: Lorc, Delapouite, Carl Olsen', licence: 'CC BY 3.0' },
      { what: 'Close icon', source: 'Kenney Game Icons', licence: 'CC0' },
    ],
  },
  {
    id: 'audio',
    entries: [
      { what: 'Sound effects and jingles', source: 'Kenney', licence: 'CC0' },
      { what: 'Music loops', source: 'Abstraction (Ben Burnes), Music Loop Bundle', licence: 'CC0' },
      { what: 'The Core music', source: 'isaiah658, Heavenly Loop (OpenGameArt)', licence: 'CC0' },
    ],
  },
  { id: 'fonts', entries: [{ what: 'Rajdhani, Share Tech Mono', source: 'Google Fonts', licence: 'SIL Open Font License 1.1' }] },
  {
    id: 'tools',
    entries: [
      { what: '3D models and icons', source: 'Meshy', licence: 'Generated' },
      { what: '2D art', source: 'FLUX.2 Turbo', licence: 'Generated' },
      { what: 'Own models and parts', source: 'Blender', licence: 'GPL (tool)' },
      { what: 'Engine and tooling', source: 'Three.js, Vite, TypeScript, Vitest', licence: 'MIT' },
    ],
  },
];
