import { clamp } from './util';
import { isWater, terrainHeight } from './terrain';

export type Block = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  y1: number;
};

export type Ramp = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  y1: number;
  axis: 'x' | 'z';
};

const CELL = 36;

export class CollisionWorld {
  readonly blocks: Block[];
  readonly ramps: Ramp[];
  private grid = new Map<string, number[]>();

  constructor(blocks: Block[], ramps: Ramp[], private step = 0.95) {
    this.blocks = blocks;
    this.ramps = ramps;
    blocks.forEach((b, i) => {
      const ix0 = Math.floor(b.minX / CELL);
      const ix1 = Math.floor(b.maxX / CELL);
      const iz0 = Math.floor(b.minZ / CELL);
      const iz1 = Math.floor(b.maxZ / CELL);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const k = `${ix},${iz}`;
          let arr = this.grid.get(k);
          if (!arr) {
            arr = [];
            this.grid.set(k, arr);
          }
          arr.push(i);
        }
      }
    });
  }

  private nearby(x: number, z: number): Block[] {
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    const seen = new Set<number>();
    const out: Block[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this.grid.get(`${ix + dx},${iz + dz}`);
        if (!arr) continue;
        for (const i of arr) {
          if (seen.has(i)) continue;
          seen.add(i);
          out.push(this.blocks[i]);
        }
      }
    }
    return out;
  }

  /** Highest walkable surface at or below feetY + step. Water has no terrain floor. */
  support(x: number, z: number, feetY: number): number {
    let h = isWater(x, z) ? -80 : terrainHeight(x, z);
    const limit = feetY + this.step;
    for (const b of this.nearby(x, z)) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.y1 <= limit && b.y1 > h) h = b.y1;
    }
    for (const r of this.ramps) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      const t =
        r.axis === 'z'
          ? (z - r.minZ) / (r.maxZ - r.minZ || 1)
          : (x - r.minX) / (r.maxX - r.minX || 1);
      const rh = r.y0 + (r.y1 - r.y0) * clamp(t, 0, 1);
      if (rh <= limit && rh > h) h = rh;
    }
    return h;
  }

  inside(x: number, y: number, z: number): boolean {
    for (const b of this.nearby(x, z)) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (y > b.y0 + 0.15 && y < b.y1 - 0.15) return true;
    }
    return false;
  }

  resolve(x: number, z: number, feetY: number, height: number, radius: number): { x: number; z: number } {
    let px = x;
    let pz = z;
    const head = feetY + height;
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      for (const b of this.nearby(px, pz)) {
        if (head < b.y0 + 0.05) continue;
        if (feetY > b.y1 - 0.1) continue;
        // A lip you can step onto is a floor, not a wall.
        if (b.y1 <= feetY + this.step) continue;
        const pushed = pushCircle(px, pz, radius, b);
        if (!pushed) continue;
        px = pushed.x;
        pz = pushed.z;
        hit = true;
      }
      if (!hit) break;
    }
    return { x: px, z: pz };
  }
}

function pushCircle(px: number, pz: number, r: number, b: Block): { x: number; z: number } | null {
  const cx = clamp(px, b.minX, b.maxX);
  const cz = clamp(pz, b.minZ, b.maxZ);
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r && d2 > 1e-8) return null;
  if (d2 <= 1e-8) {
    const left = px - b.minX;
    const right = b.maxX - px;
    const south = pz - b.minZ;
    const north = b.maxZ - pz;
    const m = Math.min(left, right, south, north);
    if (m === left) return { x: b.minX - r, z: pz };
    if (m === right) return { x: b.maxX + r, z: pz };
    if (m === south) return { x: px, z: b.minZ - r };
    return { x: px, z: b.maxZ + r };
  }
  const d = Math.sqrt(d2);
  const pen = r - d;
  return { x: px + (dx / d) * pen, z: pz + (dz / d) * pen };
}
