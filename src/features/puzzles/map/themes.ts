// The world each puzzle module's map takes place in (docs/PLATFORM.md §4.2): sky, ground,
// light and what floats in the air. What stands round the path, the landmarks and the
// horizon are models (public/assets/map/<id>.glb) that scripts/assets/build-map.ts paints
// from these colours: rebuild them after changing a theme.

export type Particles = 'motes' | 'fireflies' | 'embers' | 'dust' | 'snow';

export interface WorldTheme {
  /** sky from the zenith to the horizon */
  sky: [string, string];
  /** the sun's glow on the horizon */
  sun: string;
  fog: string;
  /** the ground, low and high */
  ground: [string, string];
  /** stone of the path */
  stone: string;
  light: string;
  /** the main colour of what stands round the path (the models in public/assets/map/ are painted from the theme) */
  decorColor: string;
  /** a second colour (leaves, crystal glow, banner) */
  accent: string;
  particles: Particles;
}

export const WORLD_THEMES: Record<string, WorldTheme> = {
  // dawn over a field of giant stone pawns: every game starts here
  openings: {
    sky: ['#22123a', '#ff9a4d'],
    sun: '#ffb46b',
    fog: '#3c2036',
    ground: ['#221327', '#5a3630'],
    stone: '#cdb79a',
    light: '#ffd0a0',
    decorColor: '#e2cdb0',
    accent: '#ff9a4d',
    particles: 'motes',
  },
  // a soft meadow with round trees and fireflies
  'first-steps': {
    sky: ['#0a2530', '#78dccf'],
    sun: '#d9fff6',
    fog: '#1b4646',
    ground: ['#163a30', '#4c8a55'],
    stone: '#d7d1c0',
    light: '#e8fff6',
    decorColor: '#4f3a2a',
    accent: '#5fcf86',
    particles: 'fireflies',
  },
  // a royal court at night: columns, red banners, embers
  'mate-in-2': {
    sky: ['#14040c', '#ff6a7a'],
    sun: '#ff8a8a',
    fog: '#33101c',
    ground: ['#1d0b12', '#4a1a26'],
    stone: '#c9b3a6',
    light: '#ffc0c4',
    decorColor: '#d8c9bd',
    accent: '#ff4e63',
    particles: 'embers',
  },
  // a golden canyon where the road forks around rock spires
  forks: {
    sky: ['#2a1606', '#f2c27a'],
    sun: '#fff0c8',
    fog: '#5a3d1e',
    ground: ['#4a2f18', '#a6773e'],
    stone: '#e8d3a8',
    light: '#ffe6b8',
    decorColor: '#b07a44',
    accent: '#f2c27a',
    particles: 'dust',
  },
  // a glacier of blue crystals under falling snow
  pins: {
    sky: ['#061430', '#8fb6ff'],
    sun: '#e6f0ff',
    fog: '#22365e',
    ground: ['#5c76a6', '#dde8fa'],
    stone: '#eef3fb',
    light: '#e4eeff',
    decorColor: '#8fd0ff',
    accent: '#bfe2ff',
    particles: 'snow',
  },
  // a volcanic altar: obsidian spikes and rising embers
  sacrifices: {
    sky: ['#10041c', '#c08cff'],
    sun: '#ff9a5a',
    fog: '#2a1036',
    ground: ['#140a16', '#3a1424'],
    stone: '#bfa9c9',
    light: '#ffb889',
    decorColor: '#1c1222',
    accent: '#ff7a3a',
    particles: 'embers',
  },
  // a misty valley of old towers at the end of the game
  endgames: {
    sky: ['#03120c', '#3fcf8e'],
    sun: '#c8ffe2',
    fog: '#0d2a1f',
    ground: ['#0f2219', '#2d5a40'],
    stone: '#c6d3c8',
    light: '#d0ffe4',
    decorColor: '#8e9c92',
    accent: '#3fcf8e',
    particles: 'fireflies',
  },
};
