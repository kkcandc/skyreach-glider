import { shoreZ } from './terrain';

export type SpotId =
  | 'crown'
  | 'spire'
  | 'clock'
  | 'bridge'
  | 'light'
  | 'radio'
  | 'crane'
  | 'rotunda'
  | 'plaza'
  | 'terraces'
  | 'ziggurat'
  | 'arch';

export const CROWN = { x: 0, z: -332 };
export const SPIRE = { x: 98, z: -6 };
export const CLOCK = { x: -108, z: 28 };
export const RADIO = { x: -348, z: -132 };
export const ROTUNDA = { x: 36, z: 118 };
export const PLAZA = { x: 0, z: 42 };
export const TERRACES = { x: 198, z: -72 };
export const ZIGGURAT = { x: -156, z: 16 };
export const BRIDGE_Z = 102;
export const BRIDGE_X0 = -258;
export const BRIDGE_X1 = -62;
export const BRIDGE_Y = 15.5;

export const MARK_BLURB: Record<SpotId, { name: string; blurb: string }> = {
  crown: {
    name: 'Crown Observatory',
    blurb: 'The high stone eye of Halcyon Reach. The whole bay is a glide from here.',
  },
  spire: {
    name: 'Lumen Spire',
    blurb: 'A glass needle with a landing pad in the clouds. Most people only arrive by wing.',
  },
  clock: {
    name: 'Amber Clock',
    blurb: 'Four gilt faces over the market. The stairs smell like orange oil and rain.',
  },
  bridge: {
    name: 'Bell Bridge',
    blurb: 'A low harbor span. Fly under it, or walk the deck and listen for the tide bells.',
  },
  light: {
    name: 'Breakwater Light',
    blurb: 'The lamp at the end of the pier. Wind off the water wants to carry you home.',
  },
  radio: {
    name: 'Radio Ridge',
    blurb: 'A red-tipped mast on the western ridge. Night pilots use it as a star.',
  },
  crane: {
    name: 'Seventh Tide Crane',
    blurb: 'Walk the arm if you dare. The harbor looks like a map from the tip.',
  },
  rotunda: {
    name: 'Garden Rotunda',
    blurb: 'A dome in the pines of the Garden of Sol. Picnics, and an easy first launch.',
  },
  plaza: {
    name: 'Moonpool Plaza',
    blurb: 'The city’s round heart. A thermal lives above the fountain on bright afternoons.',
  },
  terraces: {
    name: 'Sol Terraces',
    blurb: 'Stepped roofs on the east hill. Climb them, then aim for the water.',
  },
  ziggurat: {
    name: 'Lantern Ziggurat',
    blurb: 'The market’s stacked lantern-house. Every ledge is a hop.',
  },
  arch: {
    name: 'Salt Arch',
    blurb: 'The ceremonial gate on the promenade. First climb for almost everyone.',
  },
};

export function craneSpot(): { x: number; z: number } {
  const x = -286;
  const z = shoreZ(x) - 9;
  return { x, z };
}

export function lightSpot(): { x: number; z: number; pierZ: number } {
  const x = 348;
  const pierZ = shoreZ(x) - 6;
  const z = shoreZ(x) + 58;
  return { x, z, pierZ };
}

export function archSpot(): { x: number; z: number } {
  const x = 58;
  const z = shoreZ(x) - 11;
  return { x, z };
}

/** Rooftop hops in the Lantern Market. Edge gaps are a sprint-jump apart. */
export const HOPS: { x: number; z: number; h: number; s: number }[] = [
  { x: -236, z: 80, h: 3.3, s: 6.4 },
  { x: -226, z: 78, h: 4.45, s: 5.6 },
  { x: -216, z: 74, h: 5.55, s: 5.4 },
  { x: -206, z: 70, h: 6.65, s: 5.2 },
  { x: -196, z: 64, h: 7.9, s: 5.2 },
];

export const KEEPOUTS: { x: number; z: number; r: number }[] = [
  { x: CROWN.x, z: CROWN.z, r: 24 },
  { x: SPIRE.x, z: SPIRE.z, r: 22 },
  { x: CLOCK.x, z: CLOCK.z, r: 32 },
  { x: RADIO.x, z: RADIO.z, r: 16 },
  { x: TERRACES.x, z: TERRACES.z, r: 22 },
  { x: ZIGGURAT.x, z: ZIGGURAT.z, r: 18 },
  { x: ROTUNDA.x, z: ROTUNDA.z, r: 14 },
];
