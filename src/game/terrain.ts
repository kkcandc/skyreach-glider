import { clamp, fbm, lerp, smoothstep, valueNoise } from './util';

/** Halcyon Reach — an original crescent-bay city. Not a real skyline. */

export const WORLD = {
  minX: -500,
  maxX: 520,
  minZ: -420,
  maxZ: 500,
};

export function shoreZ(x: number): number {
  const wave = Math.sin(x * 0.0062) * 34 + Math.sin(x * 0.014 + 1.1) * 12;
  const harbor = Math.exp(-((x + 155) * (x + 155)) / (115 * 115)) * 158;
  const cove = Math.exp(-((x - 230) * (x - 230)) / (78 * 78)) * 46;
  return 258 + wave - harbor - cove;
}

export function isWater(x: number, z: number): boolean {
  return z > shoreZ(x);
}

function naturalHeight(x: number, z: number): number {
  const shore = shoreZ(x);
  if (z > shore + 6) return -4;
  const inland = shore - z;
  const beach = smoothstep(0, 20, inland) * 2.05 + smoothstep(18, 80, inland) * 1.35;

  const hx = (x + 4) / 250;
  const hz = (z + 340) / 195;
  const crown = Math.exp(-(hx * hx + hz * hz)) * 90;

  const rx = (x + 342) / 96;
  const rz = (z + 110) / 200;
  const ridge = Math.exp(-(rx * rx + rz * rz * 0.62)) * 36;

  const ex = (x - 340) / 140;
  const ez = (z - 10) / 160;
  const headland = Math.exp(-(ex * ex + ez * ez)) * 18;

  const n = (fbm(x * 0.011, z * 0.011) - 0.38) * 4.8;
  return beach + crown + ridge + headland + n;
}

/** North-south boulevard that climbs Crown Hill. */
function grandRoad(x: number, z: number, h: number): number {
  if (z > 210 || z < -360 || Math.abs(x) > 30) return h;
  const t = clamp((205 - z) / (205 - -330), 0, 1);
  const climb = smoothstep(0.34, 1, t);
  const rh = 3.15 + climb * 78;
  const d = Math.abs(x);
  if (d <= 8.5) return rh;
  const shoulder = rh + (d - 8.5) * 0.4;
  const carved = Math.min(h, Math.max(rh, shoulder));
  const u = smoothstep(8.5, 28, d);
  return lerp(carved, h, u);
}

function promenade(x: number, z: number, h: number): number {
  const inland = shoreZ(x) - z;
  if (inland < 3.5 || inland > 20 || h > 9) return h;
  const edge = Math.min(inland - 3.5, 20 - inland);
  const u = smoothstep(0, 3.2, edge);
  return lerp(h, 2.6, u);
}

function roadHeightAt(z: number): number {
  const t = clamp((205 - z) / (205 - -330), 0, 1);
  const climb = smoothstep(0.34, 1, t);
  return 3.15 + climb * 78;
}

/** Flat launch plaza so the observatory sits on level stone. */
function crownPad(x: number, z: number, h: number): number {
  const d = Math.hypot(x, z + 332);
  if (d > 42) return h;
  const u = smoothstep(16, 40, d);
  return lerp(roadHeightAt(-332), h, u);
}

export function terrainHeight(x: number, z: number): number {
  if (z > shoreZ(x) + 10) return -4;
  let h = naturalHeight(x, z);
  h = promenade(x, z, h);
  h = grandRoad(x, z, h);
  h = crownPad(x, z, h);
  if (isWater(x, z)) return Math.min(h, -1.4);
  return Math.max(0.3, h);
}

export function promenadePoint(x: number): { x: number; z: number; y: number } {
  const z = shoreZ(x) - 10;
  return { x, z, y: terrainHeight(x, z) };
}

export function onClearedGround(x: number, z: number): boolean {
  if (Math.abs(x) < 12 && z < 210 && z > -300) return true;
  const inland = shoreZ(x) - z;
  if (inland > 4 && inland < 18 && terrainHeight(x, z) < 8) return true;
  if (Math.abs(x) < 36 && Math.abs(z - 42) < 34) return true;
  if (Math.abs(x - 36) < 46 && Math.abs(z - 118) < 40) return true;
  return false;
}

export function terrainRgb(x: number, z: number, h: number): [number, number, number] {
  const inland = shoreZ(x) - z;
  if (!isWater(x, z) && inland < 28 && h < 4.4) {
    const t = clamp(inland / 26, 0, 1);
    return [lerp(0.84, 0.93, t), lerp(0.74, 0.86, t), lerp(0.52, 0.66, t)];
  }
  if (Math.abs(x) < 8.2 && z < 208 && z > -290 && h > 2) {
    const lane = Math.abs(x) < 0.35 ? 0.62 : 0;
    return [0.36 + lane, 0.38 + lane * 0.9, 0.41 + lane * 0.7];
  }
  if (inland > 4 && inland < 17 && h < 6) {
    const n = valueNoise(x * 0.2, z * 0.2);
    return [0.45 + n * 0.04, 0.43 + n * 0.03, 0.4];
  }
  if (Math.abs(x - 36) < 40 && Math.abs(z - 118) < 34 && h < 14) {
    return [0.42, 0.6, 0.32];
  }
  if (h > 52) {
    const t = clamp((h - 52) / 28, 0, 1);
    return [lerp(0.55, 0.78, t), lerp(0.52, 0.74, t), lerp(0.44, 0.66, t)];
  }
  if (h > 24) return [0.46, 0.56, 0.36];
  const n = valueNoise(x * 0.07, z * 0.07);
  return [lerp(0.5, 0.62, n), lerp(0.62, 0.72, n), lerp(0.36, 0.44, n)];
}

export function placeName(x: number, y: number, z: number): string {
  if (y > 125) return 'The High Air';
  if (Math.hypot(x, z + 332) < 40 && y > 40) return 'Crown Observatory';
  if (Math.hypot(x + 348, z + 132) < 46 && y > 18) return 'Radio Ridge';
  if (Math.hypot(x - 98, z + 6) < 30) return 'Lumen Spire';
  if (Math.hypot(x + 108, z - 28) < 22) return 'Amber Clock';
  if (Math.hypot(x - 196, z + 70) < 28) return 'Sol Terraces';
  if (Math.hypot(x + 158, z - 18) < 24) return 'Lantern Ziggurat';
  if (Math.abs(x + 160) < 120 && Math.abs(z - 102) < 16 && y > 6) return 'Bell Bridge';
  if (x > 300 && z > shoreZ(x) - 20) return 'Breakwater Light';
  if (Math.abs(x - 36) < 42 && Math.abs(z - 118) < 38) return 'Garden of Sol';
  if (Math.abs(x) < 32 && Math.abs(z - 42) < 32) return 'Moonpool Plaza';
  if (x < -70 && z < 110 && z > -20 && shoreZ(x) - z > 24) return 'Lantern Market';
  if (shoreZ(x) - z < 26 && shoreZ(x) - z > 0) return 'Salt Promenade';
  if (x > 210) return 'Eastveil';
  if (z < -80) return 'Crownward Hills';
  if (x > 15 && z < 80) return 'Glassreach';
  if (x < -70) return 'West Harbor';
  return 'Halcyon Reach';
}
