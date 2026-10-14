import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Block, CollisionWorld, Ramp } from './collision';
import { makeBox, makeCone, makeCylinder, makeDome, makeRamp } from './meshbuild';
import {
  BRIDGE_X0,
  BRIDGE_X1,
  BRIDGE_Y,
  BRIDGE_Z,
  CLOCK,
  CROWN,
  HOPS,
  KEEPOUTS,
  MARK_BLURB,
  RADIO,
  ROTUNDA,
  SPIRE,
  TERRACES,
  ZIGGURAT,
  archSpot,
  craneSpot,
  lightSpot,
  type SpotId,
} from './places';
import { isWater, onClearedGround, shoreZ, terrainHeight } from './terrain';
import { mulberry32 } from './util';

export type Roof = { x: number; y: number; z: number };
export type Mark = { id: SpotId; name: string; blurb: string; x: number; y: number; z: number };

export type BirdDatum = {
  cx: number;
  cz: number;
  cy: number;
  r: number;
  speed: number;
  phase: number;
  scale: number;
};

export type CityScene = {
  group: Group;
  collision: CollisionWorld;
  roofs: Roof[];
  marks: Mark[];
  windowMat: MeshStandardMaterial;
  lampMat: MeshStandardMaterial;
  boats: Group[];
  birds: InstancedMesh;
  birdData: BirdDatum[];
  clouds: Mesh[];
};

const STUCCO = [0xe7d2b0, 0xf0c7a2, 0xe4b08f, 0xd9896a, 0xf4e6d0, 0xe7b8a8, 0xcfc3ae, 0xb7c3ae, 0xd8c3ae, 0xc46b55, 0xf7f1e6, 0xd7a48a];
const TILE = [0xb24b38, 0x8e3a32, 0xc4623a, 0x6d4638, 0xa33d45, 0x9a5340];
const GLASS = [0xb7d4de, 0x9ec4d2, 0xc9dde4, 0x8eb6c6, 0xd5e6ec];
const AWNING = [0x1c7c78, 0xe39b3a, 0xc4454e, 0x2a4e72, 0xd6c07a];

type MatKey = 'stucco' | 'glass' | 'roof' | 'metal' | 'accent';

export function buildCity(): CityScene {
  const rng = mulberry32(0x5e1a4c);
  const blocks: Block[] = [];
  const ramps: Ramp[] = [];
  const roofs: Roof[] = [];
  const marks: Mark[] = [];
  const buckets = new Map<string, Record<MatKey, BufferGeometry[]>>();
  const litPos: { x: number; y: number; z: number; yaw: number; glow: number }[] = [];
  const darkPos: { x: number; y: number; z: number; yaw: number; glow?: number }[] = [];
  const lamps: Vector3[] = [];
  const trees: { x: number; y: number; z: number; s: number; kind: number }[] = [];
  const decor: Mesh[] = [];

  const pick = (arr: number[]) => arr[Math.floor(rng() * arr.length)];

  const chunkKey = (x: number, z: number) => `${Math.floor(x / 150)},${Math.floor(z / 150)}`;
  const bucket = (x: number, z: number): Record<MatKey, BufferGeometry[]> => {
    const k = chunkKey(x, z);
    let b = buckets.get(k);
    if (!b) {
      b = { stucco: [], glass: [], roof: [], metal: [], accent: [] };
      buckets.set(k, b);
    }
    return b;
  };

  const addBox = (mat: MatKey, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number) => {
    if (sy < 0.05 || sx < 0.05 || sz < 0.05) return;
    bucket(cx, cz)[mat].push(makeBox(cx, cy, cz, sx, sy, sz, color));
  };
  const addCyl = (mat: MatKey, cx: number, cy: number, cz: number, r0: number, r1: number, h: number, color: number, sides = 14) => {
    bucket(cx, cz)[mat].push(makeCylinder(cx, cy, cz, r0, r1, h, color, sides));
  };
  const addCone = (mat: MatKey, cx: number, base: number, cz: number, r: number, h: number, color: number) => {
    bucket(cx, cz)[mat].push(makeCone(cx, base, cz, r, h, color));
  };
  const addDome = (mat: MatKey, cx: number, base: number, cz: number, r: number, color: number) => {
    bucket(cx, cz)[mat].push(makeDome(cx, base, cz, r, color));
  };
  const addRamp = (minX: number, maxX: number, minZ: number, maxZ: number, y0: number, y1: number, axis: 'x' | 'z', color: number) => {
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    bucket(cx, cz).accent.push(makeRamp(minX, maxX, minZ, maxZ, y0, y1, axis, color));
    ramps.push({ minX, maxX, minZ, maxZ, y0, y1, axis });
  };
  const addBlock = (minX: number, maxX: number, minZ: number, maxZ: number, y0: number, y1: number) => {
    blocks.push({ minX, maxX, minZ, maxZ, y0, y1 });
  };

  const pushWindows = (cx: number, y0: number, y1: number, cz: number, w: number, d: number, density: number) => {
    if (litPos.length + darkPos.length > 11000) return;
    const floors = Math.max(0, Math.floor((y1 - y0 - 2.4) / 3.2));
    const colsX = Math.max(1, Math.floor((w - 1.2) / (3.1 / density)));
    const colsZ = Math.max(1, Math.floor((d - 1.2) / (3.1 / density)));
    const ground = terrainHeight(cx, cz);
    for (let f = 0; f < floors; f++) {
      const y = y0 + 2.15 + f * 3.2;
      if (y > y1 - 1.05 || y < ground + 1.2) continue;
      for (let c = 0; c < colsX; c++) {
        const x = cx - w / 2 + ((c + 0.5) * w) / colsX;
        const glow = rng();
        const faceZ = cz + d / 2 + 0.08;
        const faceZn = cz - d / 2 - 0.08;
        (glow > 0.42 ? litPos : darkPos).push({ x, y, z: faceZ, yaw: 0, glow });
        (glow > 0.55 ? litPos : darkPos).push({ x, y, z: faceZn, yaw: Math.PI, glow: rng() });
      }
      for (let c = 0; c < colsZ; c++) {
        const z = cz - d / 2 + ((c + 0.5) * d) / colsZ;
        const glow = rng();
        (glow > 0.48 ? litPos : darkPos).push({ x: cx + w / 2 + 0.08, y, z, yaw: Math.PI / 2, glow });
        (rng() > 0.5 ? litPos : darkPos).push({ x: cx - w / 2 - 0.08, y, z, yaw: -Math.PI / 2, glow: rng() });
      }
    }
  };

  const solidHouse = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    bh: number,
    kind: 'stucco' | 'glass' | 'warehouse',
  ) => {
    const samples = [
      terrainHeight(cx - w * 0.45, cz - d * 0.45),
      terrainHeight(cx + w * 0.45, cz - d * 0.45),
      terrainHeight(cx - w * 0.45, cz + d * 0.45),
      terrainHeight(cx + w * 0.45, cz + d * 0.45),
    ];
    const hMin = Math.min(...samples);
    const hMax = Math.max(...samples);
    if (hMax - hMin > 10) return;
    if (isWater(cx, cz) || isWater(cx, cz + d * 0.4)) return;
    const y0 = hMin;
    const y1 = hMax + bh;
    const slab = 0.5;
    const bodyH = y1 - slab - y0;
    const mat: MatKey = kind === 'glass' ? 'glass' : 'stucco';
    const wall = kind === 'glass' ? pick(GLASS) : kind === 'warehouse' ? pick([0xc8c0b2, 0xb7b1a6, 0xd5cbb8]) : pick(STUCCO);
    const roof = kind === 'warehouse' ? 0x6e7378 : pick(TILE);
    addBox(mat, cx, y0 + bodyH / 2, cz, w, bodyH, d, wall);
    addBox('roof', cx, y1 - slab / 2, cz, w + 0.55, slab, d + 0.55, roof);
    addBlock(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0, y1);
    roofs.push({ x: cx, y: y1, z: cz });
    pushWindows(cx, y0, y1, cz, w * 0.92, d * 0.92, kind === 'glass' ? 1.15 : kind === 'warehouse' ? 0.55 : 0.85);
    if (kind === 'stucco' && bh < 22 && rng() > 0.45) {
      const aw = pick(AWNING);
      const side = rng() > 0.5 ? 1 : -1;
      addBox('accent', cx, y0 + Math.min(3.3, bh * 0.45), cz + side * (d / 2 + 0.7), w * 0.55, 0.16, 1.5, aw);
    }
    if (kind !== 'warehouse' && bh > 16 && rng() > 0.62) {
      const pw = w * 0.42;
      const pd = d * 0.42;
      const ph = 3.2 + rng() * 2;
      addBox(mat, cx + w * 0.18, y1 + ph / 2, cz - d * 0.12, pw, ph, pd, wall);
      addBox('roof', cx + w * 0.18, y1 + ph + 0.2, cz - d * 0.12, pw + 0.3, 0.4, pd + 0.3, roof);
      addBlock(cx + w * 0.18 - pw / 2, cx + w * 0.18 + pw / 2, cz - d * 0.12 - pd / 2, cz - d * 0.12 + pd / 2, y1, y1 + ph);
      roofs.push({ x: cx + w * 0.18, y: y1 + ph, z: cz - d * 0.12 });
    }
  };

  const nearKeep = (x: number, z: number, pad = 0) => {
    for (const k of KEEPOUTS) if (Math.hypot(x - k.x, z - k.z) < k.r + pad) return true;
    for (const hop of HOPS) if (Math.hypot(x - hop.x, z - hop.z) < hop.s * 0.5 + 8) return true;
    if (Math.abs(z - BRIDGE_Z) < 18 && x > BRIDGE_X0 - 16 && x < BRIDGE_X1 + 16) return true;
    const crane = craneSpot();
    if (Math.hypot(x - crane.x, z - crane.z) < 14) return true;
    const arch = archSpot();
    if (Math.hypot(x - arch.x, z - arch.z) < 12) return true;
    const light = lightSpot();
    if (Math.abs(x - light.x) < 10 && z > light.pierZ - 6 && z < light.z + 8) return true;
    return false;
  };

  const district = (x: number, z: number) => {
    if (z > shoreZ(x) - 58 && x < -20) return 'harbor' as const;
    if (x < -72 && z < 108 && z > -16) return 'market' as const;
    if (x > 24 && x < 190 && z < 78 && z > -70) return 'spire' as const;
    if (z < -36) return 'hill' as const;
    if (x > 190) return 'villa' as const;
    return 'civic' as const;
  };

  // Main blocks.
  for (let ix = -11; ix <= 11; ix++) {
    for (let iz = -8; iz <= 6; iz++) {
      const cx = ix * 42 + (rng() - 0.5) * 2.4;
      const cz = iz * 42 + 8 + (rng() - 0.5) * 2.4;
      if (onClearedGround(cx, cz) || nearKeep(cx, cz) || isWater(cx, cz)) continue;
      if (xInMarket(cx, cz)) continue;
      const dist = district(cx, cz);
      let bh = 12 + rng() * 16;
      let kind: 'stucco' | 'glass' | 'warehouse' = 'stucco';
      if (dist === 'harbor') {
        bh = 6 + rng() * 8;
        kind = rng() > 0.35 ? 'warehouse' : 'stucco';
      } else if (dist === 'spire') {
        bh = 24 + rng() * rng() * 78;
        kind = 'glass';
      } else if (dist === 'hill') {
        bh = 7 + rng() * 8;
      } else if (dist === 'villa') {
        bh = 8 + rng() * 12;
      } else if (dist === 'civic') {
        bh = 12 + rng() * 22;
        if (bh > 26 && rng() > 0.4) kind = 'glass';
      }
      const w = 22 + rng() * 8;
      const d = 20 + rng() * 8;
      if (dist === 'spire' && bh > 34) {
        addTower(cx, cz, w, d, bh);
      } else {
        solidHouse(cx, cz, w, d, bh, kind);
      }
    }
  }

  function addTower(cx: number, cz: number, w: number, d: number, bh: number) {
    const base = terrainHeight(cx, cz);
    if (isWater(cx, cz)) return;
    let y = base;
    let fw = w;
    let fd = d;
    const stages = bh > 70 ? 3 : 2;
    const slice = bh / stages;
    const tint = pick(GLASS);
    for (let s = 0; s < stages; s++) {
      const h = slice * (s === stages - 1 ? 1.05 : 1);
      addBox('glass', cx, y + h / 2, cz, fw, h, fd, tint);
      addBlock(cx - fw / 2, cx + fw / 2, cz - fd / 2, cz + fd / 2, y, y + h);
      y += h;
      roofs.push({ x: cx, y, z: cz });
      pushWindows(cx, y - h, y, cz, fw * 0.9, fd * 0.9, 1.2);
      fw *= 0.68;
      fd *= 0.68;
    }
    addCone('metal', cx, y, cz, Math.max(fw, 2.2), 10 + rng() * 8, 0xd5dee4);
  }

  function xInMarket(x: number, z: number) {
    return x > -250 && x < -78 && z > -6 && z < 104;
  }

  // Lantern Market — tight roofs you can hop.
  for (let ix = 0; ix < 10; ix++) {
    for (let iz = 0; iz < 7; iz++) {
      const cx = -242 + ix * 16.6;
      const cz = 2 + iz * 14.4;
      if (nearKeep(cx, cz, 1) || onClearedGround(cx, cz)) continue;
      const band = (ix + iz) % 3;
      const bh = 7.6 + band * 1.05;
      const w = 11.4 + (ix % 2) * 0.6;
      const d = 10.2;
      solidHouse(cx, cz, w, d, bh, 'stucco');
    }
  }

  // Authored parkour roofs.
  for (const hop of HOPS) {
    const y0 = terrainHeight(hop.x, hop.z);
    const y1 = y0 + hop.h;
    addBox('stucco', hop.x, y0 + (hop.h - 0.4) / 2, hop.z, hop.s, hop.h - 0.4, hop.s, 0xe7c2a4);
    addBox('roof', hop.x, y1 - 0.2, hop.z, hop.s + 0.4, 0.4, hop.s + 0.4, 0xc4623a);
    addBlock(hop.x - hop.s / 2, hop.x + hop.s / 2, hop.z - hop.s / 2, hop.z + hop.s / 2, y0, y1);
    roofs.push({ x: hop.x, y: y1, z: hop.z });
  }

  buildLandmarks();
  scatterTrees();
  scatterLamps();
  const boats = buildBoats();
  const { birds, birdData } = buildBirds();
  const clouds = buildClouds();

  const group = new Group();
  group.name = 'halcyon';
  const std = (rough: number, metal: number) =>
    new MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal });
  const materials: Record<MatKey, MeshStandardMaterial> = {
    stucco: std(0.88, 0.02),
    glass: std(0.22, 0.48),
    roof: std(0.7, 0.06),
    metal: std(0.42, 0.72),
    accent: std(0.64, 0.08),
  };
  for (const bag of buckets.values()) {
    for (const key of Object.keys(bag) as MatKey[]) {
      const geos = bag[key];
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new Mesh(merged, materials[key]);
      mesh.castShadow = key !== 'accent';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  const windowGeo = new BoxGeometry(1.12, 1.42, 0.08);
  const windowMat = new MeshStandardMaterial({
    color: 0x8fb4c4,
    emissive: 0xffc48a,
    emissiveIntensity: 0.08,
    roughness: 0.35,
    metalness: 0.12,
  });
  const litMesh = new InstancedMesh(windowGeo, windowMat, Math.max(1, litPos.length));
  const darkMat = new MeshStandardMaterial({ color: 0x1a2832, roughness: 0.4, metalness: 0.2 });
  const darkMesh = new InstancedMesh(windowGeo, darkMat, Math.max(1, darkPos.length));
  const dummy = new Object3D();
  const placeWins = (mesh: InstancedMesh, list: { x: number; y: number; z: number; yaw: number }[]) => {
    list.forEach((w, i) => {
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(0, w.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  };
  placeWins(litMesh, litPos);
  placeWins(darkMesh, darkPos);
  group.add(litMesh, darkMesh);

  const lampMat = new MeshStandardMaterial({
    color: 0xfff1d2,
    emissive: 0xffb15a,
    emissiveIntensity: 0.15,
    roughness: 0.4,
  });
  const bulb = new InstancedMesh(new SphereGeometry(0.22, 8, 6), lampMat, Math.max(1, lamps.length));
  lamps.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bulb.setMatrixAt(i, dummy.matrix);
  });
  bulb.count = lamps.length;
  bulb.instanceMatrix.needsUpdate = true;
  group.add(bulb);

  const trunkMat = new MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 });
  const roundMat = new MeshStandardMaterial({ color: 0x3f7a45, roughness: 0.85 });
  const coneMat = new MeshStandardMaterial({ color: 0x2f6a52, roughness: 0.85 });
  const rounds = trees.filter((t) => t.kind === 0);
  const cones = trees.filter((t) => t.kind === 1);
  const trunk = new InstancedMesh(new CylinderGeometry(0.16, 0.24, 1, 6), trunkMat, Math.max(1, trees.length));
  const crownR = new InstancedMesh(new SphereGeometry(1, 8, 6), roundMat, Math.max(1, rounds.length));
  const crownC = new InstancedMesh(new ConeGeometry(1, 2.2, 7), coneMat, Math.max(1, cones.length));
  const m4 = new Matrix4();
  trees.forEach((t, i) => {
    m4.makeScale(1, 1.4 * t.s, 1);
    m4.setPosition(t.x, t.y + 0.7 * t.s, t.z);
    trunk.setMatrixAt(i, m4);
  });
  rounds.forEach((t, i) => {
    m4.makeScale(1.5 * t.s, 1.15 * t.s, 1.5 * t.s);
    m4.setPosition(t.x, t.y + 2.1 * t.s, t.z);
    crownR.setMatrixAt(i, m4);
  });
  cones.forEach((t, i) => {
    m4.makeScale(0.9 * t.s, 1.3 * t.s, 0.9 * t.s);
    m4.setPosition(t.x, t.y + 2.3 * t.s, t.z);
    crownC.setMatrixAt(i, m4);
  });
  trunk.count = trees.length;
  crownR.count = rounds.length;
  crownC.count = cones.length;
  trunk.instanceMatrix.needsUpdate = true;
  crownR.instanceMatrix.needsUpdate = true;
  crownC.instanceMatrix.needsUpdate = true;
  trunk.castShadow = false;
  crownR.castShadow = false;
  crownC.castShadow = false;
  group.add(trunk, crownR, crownC);
  group.add(birds, ...boats, ...clouds, ...decor);

  return {
    group,
    collision: new CollisionWorld(blocks, ramps),
    roofs,
    marks,
    windowMat,
    lampMat,
    boats,
    birds,
    birdData,
    clouds,
  };

  function mark(id: SpotId, x: number, y: number, z: number) {
    const meta = MARK_BLURB[id];
    marks.push({ id, name: meta.name, blurb: meta.blurb, x, y, z });
  }

  function buildLandmarks() {
    // Crown observatory.
    const cy = terrainHeight(CROWN.x, CROWN.z);
    addCyl('accent', CROWN.x, cy + 0.35, CROWN.z, 16, 16.4, 0.7, 0xd9d0c2, 20);
    addBlock(CROWN.x - 15, CROWN.x + 15, CROWN.z - 15, CROWN.z + 15, cy - 0.2, cy + 0.7);
    // South lip of the disc is a hair above the road; a short ramp lets you walk on.
    addRamp(CROWN.x - 7, CROWN.x + 6, CROWN.z + 12, CROWN.z + 26, cy + 0.7, cy + 0.05, 'z', 0xd9d0c2);
    const towerBase = cy + 0.7;
    addCyl('stucco', CROWN.x + 8, towerBase + 8, CROWN.z - 6, 4.2, 4.6, 16, 0xe6d3bc, 12);
    addBlock(CROWN.x + 8 - 4.4, CROWN.x + 8 + 4.4, CROWN.z - 6 - 4.4, CROWN.z - 6 + 4.4, towerBase, towerBase + 16);
    addDome('roof', CROWN.x + 8, towerBase + 16, CROWN.z - 6, 4.3, 0xb85a3e);
    // Low on the south lip of the plaza, high where it meets the roof. Walk uphill, north.
    addRamp(CROWN.x + 13.2, CROWN.x + 17.4, CROWN.z - 14, CROWN.z + 14, towerBase + 16, towerBase, 'z', 0xd7cbb8);
    addBlock(CROWN.x + 3.2, CROWN.x + 13.5, CROWN.z - 16, CROWN.z - 1, towerBase + 15.72, towerBase + 16);
    roofs.push({ x: CROWN.x, y: cy + 0.7, z: CROWN.z });
    roofs.push({ x: CROWN.x + 8, y: towerBase + 16, z: CROWN.z - 6 });
    mark('crown', CROWN.x + 8, towerBase + 16.4, CROWN.z - 6);

    // Lumen Spire.
    const sy = terrainHeight(SPIRE.x, SPIRE.z);
    const stages: [number, number][] = [
      [24, 26],
      [16, 30],
      [11, 28],
      [14, 4],
    ];
    let yy = sy;
    stages.forEach(([w, h], i) => {
      addBox('glass', SPIRE.x, yy + h / 2, SPIRE.z, w, h, w, GLASS[i % GLASS.length]);
      addBlock(SPIRE.x - w / 2, SPIRE.x + w / 2, SPIRE.z - w / 2, SPIRE.z + w / 2, yy, yy + h);
      pushWindows(SPIRE.x, yy, yy + h, SPIRE.z, w * 0.86, w * 0.86, 1.25);
      yy += h;
      if (i === 2) roofs.push({ x: SPIRE.x, y: yy, z: SPIRE.z });
    });
    // Landing pad is the wide 4th stage (h=4, w=14) — walk the rim, needle on the north edge.
    const padY = yy;
    addBlock(SPIRE.x - 7, SPIRE.x + 7, SPIRE.z - 7, SPIRE.z + 7, padY - 4, padY);
    addCone('metal', SPIRE.x, padY, SPIRE.z - 4.5, 1.3, 22, 0xe7eef2);
    roofs.push({ x: SPIRE.x, y: padY, z: SPIRE.z + 1.5 });
    mark('spire', SPIRE.x, padY + 1, SPIRE.z + 1.5);
    // Neighbor and skybridge.
    const nx = SPIRE.x + 32;
    const nz = SPIRE.z + 8;
    const nh = 38;
    const nbase = terrainHeight(nx, nz);
    addBox('glass', nx, nbase + nh / 2, nz, 14, nh, 14, 0x9ec4d2);
    addBlock(nx - 7, nx + 7, nz - 7, nz + 7, nbase, nbase + nh);
    roofs.push({ x: nx, y: nbase + nh, z: nz });
    const bridgeY = nbase + 32;
    addBox('metal', (SPIRE.x + nx) / 2, bridgeY, (SPIRE.z + nz) / 2, 30, 0.45, 4.5, 0xc5d0d6);
    addBlock(Math.min(SPIRE.x, nx), Math.max(SPIRE.x, nx), (SPIRE.z + nz) / 2 - 2.2, (SPIRE.z + nz) / 2 + 2.2, bridgeY - 0.4, bridgeY + 0.25);

    // Amber Clock.
    const cbase = terrainHeight(CLOCK.x, CLOCK.z);
    const ch = 46;
    addBox('stucco', CLOCK.x, cbase + ch / 2, CLOCK.z, 12, ch, 12, 0xf0e2cc);
    addBlock(CLOCK.x - 6, CLOCK.x + 6, CLOCK.z - 6, CLOCK.z + 6, cbase, cbase + ch);
    addCone('roof', CLOCK.x, cbase + ch, CLOCK.z, 7.2, 9, 0xa33d45);
    roofs.push({ x: CLOCK.x, y: cbase + ch, z: CLOCK.z });
    mark('clock', CLOCK.x, cbase + ch + 0.4, CLOCK.z);
    // One long east stair. Low at the north, roof at the south, then a deck to the faces.
    addRamp(CLOCK.x + 6.8, CLOCK.x + 10.8, CLOCK.z - 32, CLOCK.z + 14, cbase, cbase + ch, 'z', 0xd9d0c2);
    addBlock(CLOCK.x + 6.5, CLOCK.x + 11, CLOCK.z + 13.7, CLOCK.z + 17, cbase + ch - 0.2, cbase + ch);
    addBlock(CLOCK.x + 1, CLOCK.x + 6.5, CLOCK.z + 4, CLOCK.z + 14.2, cbase + ch - 0.2, cbase + ch);
    addBlock(CLOCK.x - 6, CLOCK.x + 6, CLOCK.z - 6, CLOCK.z + 6, cbase + ch - 0.2, cbase + ch);
    for (const [fx, fz, ry] of [
      [CLOCK.x, CLOCK.z + 6.2, 0],
      [CLOCK.x, CLOCK.z - 6.2, Math.PI],
      [CLOCK.x + 6.2, CLOCK.z, Math.PI / 2],
      [CLOCK.x - 6.2, CLOCK.z, -Math.PI / 2],
    ] as const) {
      const face = new Mesh(
        new CylinderGeometry(2.15, 2.15, 0.28, 18),
        new MeshStandardMaterial({ color: 0xf8e7c1, emissive: 0xffc56a, emissiveIntensity: 0.45, roughness: 0.4 }),
      );
      face.rotation.x = Math.PI / 2;
      face.rotation.y = ry;
      face.position.set(fx, cbase + ch * 0.72, fz);
      decor.push(face);
    }

    // Ziggurat.
    let zw = 26;
    let zy = terrainHeight(ZIGGURAT.x, ZIGGURAT.z);
    for (let i = 0; i < 8; i++) {
      const sh = 1.12;
      addBox('stucco', ZIGGURAT.x, zy + sh / 2, ZIGGURAT.z, zw, sh, zw, i % 2 ? 0xf0c7a2 : 0xe7b89a);
      addBlock(ZIGGURAT.x - zw / 2, ZIGGURAT.x + zw / 2, ZIGGURAT.z - zw / 2, ZIGGURAT.z + zw / 2, zy, zy + sh);
      zy += sh;
      zw -= 2.5;
    }
    addDome('accent', ZIGGURAT.x, zy, ZIGGURAT.z, 2.4, 0xe39b3a);
    roofs.push({ x: ZIGGURAT.x, y: zy, z: ZIGGURAT.z });
    mark('ziggurat', ZIGGURAT.x, zy + 0.6, ZIGGURAT.z);

    // Sol Terraces — walkable steps plus a side ramp.
    let tw = 30;
    let ty = terrainHeight(TERRACES.x, TERRACES.z);
    const terraceBase = ty;
    for (let i = 0; i < 9; i++) {
      const sh = 1.15;
      addBox('stucco', TERRACES.x, ty + sh / 2, TERRACES.z, tw, sh, tw * 0.72, i % 2 ? 0xf4e6d0 : 0xe4b08f);
      addBlock(TERRACES.x - tw / 2, TERRACES.x + tw / 2, TERRACES.z - tw * 0.36, TERRACES.z + tw * 0.36, ty, ty + sh);
      ty += sh;
      tw -= 2.2;
    }
    roofs.push({ x: TERRACES.x, y: ty, z: TERRACES.z });
    mark('terraces', TERRACES.x, ty + 0.4, TERRACES.z);
    addRamp(TERRACES.x + 16, TERRACES.x + 20.5, TERRACES.z - 12, TERRACES.z + 12, terraceBase, ty, 'z', 0xd7cbb8);

    // Bell Bridge.
    const deckY = BRIDGE_Y;
    addBox('accent', (BRIDGE_X0 + BRIDGE_X1) / 2, deckY - 0.35, BRIDGE_Z, BRIDGE_X1 - BRIDGE_X0, 0.7, 12, 0xc8bfb0);
    addBlock(BRIDGE_X0, BRIDGE_X1, BRIDGE_Z - 6, BRIDGE_Z + 6, deckY - 1.1, deckY);
    roofs.push({ x: (BRIDGE_X0 + BRIDGE_X1) / 2, y: deckY, z: BRIDGE_Z });
    mark('bridge', (BRIDGE_X0 + BRIDGE_X1) / 2, deckY + 0.4, BRIDGE_Z);
    for (const tx of [BRIDGE_X0 + 48, BRIDGE_X1 - 48]) {
      addBox('stucco', tx, deckY + 12, BRIDGE_Z, 5, 28, 5, 0xe7d3bc);
      addBox('roof', tx, deckY + 26.4, BRIDGE_Z, 7, 0.6, 7, 0x8e3a32);
      addBlock(tx - 2.5, tx + 2.5, BRIDGE_Z - 2.5, BRIDGE_Z + 2.5, deckY, deckY + 26);
      addRamp(tx + 2.6, tx + 6.4, BRIDGE_Z - 8, BRIDGE_Z + 8, deckY, deckY + 26, 'z', 0xd9d0c2);
    }
    // Approaches.
    const westZ = BRIDGE_Z;
    const westGround = terrainHeight(BRIDGE_X0 - 8, westZ);
    addRamp(BRIDGE_X0 - 16, BRIDGE_X0 + 2, BRIDGE_Z - 5, BRIDGE_Z + 5, westGround, deckY, 'x', 0xc8bfb0);
    const eastGround = terrainHeight(BRIDGE_X1 + 8, BRIDGE_Z);
    addRamp(BRIDGE_X1 - 2, BRIDGE_X1 + 16, BRIDGE_Z - 5, BRIDGE_Z + 5, deckY, eastGround, 'x', 0xc8bfb0);

    // Breakwater light.
    const light = lightSpot();
    const pierY = 2.35;
    addBox('accent', light.x, pierY - 0.25, (light.pierZ + light.z) / 2, 5.5, 0.5, light.z - light.pierZ, 0xd9d0c2);
    addBlock(light.x - 2.7, light.x + 2.7, light.pierZ, light.z + 3, pierY - 0.6, pierY);
    const lh = 26;
    addCyl('stucco', light.x, pierY + lh / 2, light.z, 3.1, 3.6, lh, 0xf7f1e6, 12);
    addBlock(light.x - 3.4, light.x + 3.4, light.z - 3.4, light.z + 3.4, pierY, pierY + lh);
    addCyl('accent', light.x, pierY + lh + 1.3, light.z, 2.2, 2.4, 2.6, 0xf4e6d0, 10);
    addCone('roof', light.x, pierY + lh + 2.6, light.z, 2.6, 3.2, 0xc4454e);
    roofs.push({ x: light.x, y: pierY + lh, z: light.z });
    mark('light', light.x, pierY + lh + 0.5, light.z);
    addRamp(light.x + 3.5, light.x + 7.2, light.z - 10, light.z + 2, pierY, pierY + lh, 'z', 0xd9d0c2);

    // Radio ridge.
    const ry = terrainHeight(RADIO.x, RADIO.z);
    addCyl('metal', RADIO.x, ry + 1, RADIO.z, 7, 7.4, 2, 0xb7b1a6, 12);
    addBlock(RADIO.x - 6.5, RADIO.x + 6.5, RADIO.z - 6.5, RADIO.z + 6.5, ry, ry + 2);
    addCyl('metal', RADIO.x, ry + 16, RADIO.z, 0.35, 0.7, 28, 0x9aa3a8, 8);
    addBox('metal', RADIO.x, ry + 10, RADIO.z, 8, 0.35, 8, 0xc5ccd0);
    addBlock(RADIO.x - 4, RADIO.x + 4, RADIO.z - 4, RADIO.z + 4, ry + 2, ry + 10.2);
    addRamp(RADIO.x + 4.2, RADIO.x + 8, RADIO.z - 6, RADIO.z + 6, ry + 2, ry + 10.2, 'z', 0xb7b1a6);
    roofs.push({ x: RADIO.x, y: ry + 10.2, z: RADIO.z });
    mark('radio', RADIO.x, ry + 10.6, RADIO.z);

    // Seventh Tide Crane.
    const crane = craneSpot();
    const craneGround = terrainHeight(crane.x, crane.z);
    const cab = craneGround + 16;
    addBox('metal', crane.x, craneGround + 8, crane.z, 2.4, 16, 2.4, 0xc4553a);
    addBlock(crane.x - 1.2, crane.x + 1.2, crane.z - 1.2, crane.z + 1.2, craneGround, cab);
    addBox('metal', crane.x + 12, cab + 0.3, crane.z, 26, 0.45, 2.2, 0xd06a42);
    addBlock(crane.x - 1, crane.x + 25, crane.z - 1.1, crane.z + 1.1, cab - 0.2, cab + 0.55);
    addBox('accent', crane.x + 2, cab + 1.3, crane.z, 3.2, 1.6, 2.4, 0xf4e6d0);
    addRamp(crane.x - 8, crane.x - 1.4, crane.z - 2, crane.z + 2, craneGround, cab, 'x', 0xb7b1a6);
    roofs.push({ x: crane.x + 24, y: cab + 0.55, z: crane.z });
    mark('crane', crane.x + 23, cab + 1, crane.z);

    // Garden rotunda.
    const gy = terrainHeight(ROTUNDA.x, ROTUNDA.z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      addCyl('stucco', ROTUNDA.x + Math.cos(a) * 5.2, gy + 2.4, ROTUNDA.z + Math.sin(a) * 5.2, 0.38, 0.42, 4.8, 0xf7f1e6, 8);
    }
    addCyl('roof', ROTUNDA.x, gy + 5.1, ROTUNDA.z, 7.2, 7.2, 0.45, 0xb24b38, 16);
    addDome('roof', ROTUNDA.x, gy + 5.3, ROTUNDA.z, 5.4, 0xc4623a);
    addBlock(ROTUNDA.x - 6.4, ROTUNDA.x + 6.4, ROTUNDA.z - 6.4, ROTUNDA.z + 6.4, gy + 4.7, gy + 5.35);
    roofs.push({ x: ROTUNDA.x, y: gy + 5.35, z: ROTUNDA.z });
    mark('rotunda', ROTUNDA.x, gy + 5.7, ROTUNDA.z);
    addRamp(ROTUNDA.x - 2, ROTUNDA.x + 2, ROTUNDA.z + 6.2, ROTUNDA.z + 12, gy, gy + 5.35, 'z', 0xd9d0c2);

    // Moonpool plaza rim + fountain (visual, low rim you can step).
    const py = terrainHeight(0, 42);
    addCyl('accent', 0, py + 0.25, 42, 7.5, 7.8, 0.5, 0xd5e6ea, 18);
    addCyl('glass', 0, py + 0.7, 42, 2.2, 2.2, 0.5, 0x8ec8d4, 12);
    mark('plaza', 0, py + 0.4, 42);

    // Salt Arch.
    const arch = archSpot();
    const ay = terrainHeight(arch.x, arch.z);
    const beam = ay + 8.2;
    addBox('stucco', arch.x - 4.2, ay + 4, arch.z, 1.6, 8, 2.4, 0xf4e6d0);
    addBox('stucco', arch.x + 4.2, ay + 4, arch.z, 1.6, 8, 2.4, 0xf4e6d0);
    addBox('roof', arch.x, beam - 0.3, arch.z, 11, 0.7, 3.2, 0xc4623a);
    addBlock(arch.x - 5.5, arch.x + 5.5, arch.z - 1.6, arch.z + 1.6, beam - 0.7, beam);
    addBlock(arch.x - 5, arch.x - 3.4, arch.z - 1.2, arch.z + 1.2, ay, beam);
    addBlock(arch.x + 3.4, arch.x + 5, arch.z - 1.2, arch.z + 1.2, ay, beam);
    addRamp(arch.x - 2.2, arch.x + 2.2, arch.z + 2.2, arch.z + 10, ay, beam, 'z', 0xe7d3bc);
    roofs.push({ x: arch.x, y: beam, z: arch.z });
    mark('arch', arch.x, beam + 0.3, arch.z);

  }

  function scatterTrees() {
    const rngT = mulberry32(0x71c0de);
    for (let x = -420; x <= 440; x += 16) {
      for (let z = -360; z <= 240; z += 16) {
        const jx = x + (rngT() - 0.5) * 8;
        const jz = z + (rngT() - 0.5) * 8;
        if (isWater(jx, jz) || onClearedGround(jx, jz)) continue;
        if (rngT() > 0.55) continue;
        const h = terrainHeight(jx, jz);
        if (h < 1 || h > 68) continue;
        // Skip if very close to a roof center — checked loosely via keepouts only.
        if (nearKeep(jx, jz, 2)) continue;
        trees.push({ x: jx, y: h, z: jz, s: 0.8 + rngT() * 1.1, kind: rngT() > 0.45 ? 1 : 0 });
      }
    }
    for (let i = 0; i < 70; i++) {
      const a = rngT() * Math.PI * 2;
      const rad = 8 + rngT() * 28;
      const x = ROTUNDA.x + Math.cos(a) * rad;
      const z = ROTUNDA.z + Math.sin(a) * rad * 0.85;
      if (rad < 10) continue;
      trees.push({ x, y: terrainHeight(x, z), z, s: 0.9 + rngT(), kind: 0 });
    }
  }

  function scatterLamps() {
    for (let x = -360; x <= 400; x += 24) {
      const z = shoreZ(x) - 8;
      if (isWater(x, z)) continue;
      const y = terrainHeight(x, z);
      addBox('metal', x, y + 2.1, z, 0.16, 4.2, 0.16, 0x2c3438);
      lamps.push(new Vector3(x, y + 4.25, z));
    }
    for (let z = 180; z >= -300; z -= 28) {
      const y = terrainHeight(10, z);
      addBox('metal', 10, y + 2.1, z, 0.16, 4.2, 0.16, 0x2c3438);
      lamps.push(new Vector3(10, y + 4.25, z));
    }
  }

  function buildBoats(): Group[] {
    const spots = [
      [-200, 150],
      [-140, 170],
      [-180, 200],
      [-90, 160],
      [-230, 180],
      [120, 300],
      [200, 280],
      [-40, 220],
    ];
    return spots.map(([x, z], i) => {
      let zz = z;
      if (!isWater(x, zz)) zz = shoreZ(x) + 22;
      const g = new Group();
      const hull = new Mesh(new BoxGeometry(7, 1.3, 2.4), new MeshStandardMaterial({ color: i % 2 ? 0xf4e6d0 : 0x2a4e72, roughness: 0.7 }));
      hull.position.y = 0.4;
      const cabin = new Mesh(new BoxGeometry(2.2, 1.1, 1.8), new MeshStandardMaterial({ color: 0xc4623a, roughness: 0.6 }));
      cabin.position.set(-0.6, 1.3, 0);
      g.add(hull, cabin);
      g.position.set(x, 0, zz);
      g.rotation.y = i * 0.6;
      return g;
    });
  }

  function buildBirds(): { birds: InstancedMesh; birdData: BirdDatum[] } {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute(
        new Float32Array([
          0, 0, 0.5, -0.75, 0, -0.28, -0.16, 0.06, -0.04,
          0, 0, 0.5, 0.16, 0.06, -0.04, 0.75, 0, -0.28,
        ]),
        3,
      ),
    );
    geo.computeVertexNormals();
    const flocks = [
      { cx: 98, cz: -6, cy: 70, n: 8, rad: 18 },
      { cx: 0, cz: -300, cy: 100, n: 6, rad: 22 },
      { cx: -20, cz: 180, cy: 28, n: 8, rad: 26 },
    ];
    const birdData: BirdDatum[] = [];
    for (const f of flocks) {
      for (let i = 0; i < f.n; i++) {
        birdData.push({
          cx: f.cx,
          cz: f.cz,
          cy: f.cy,
          r: f.rad + (i % 3),
          speed: 0.25 + (i % 4) * 0.05,
          phase: (i / f.n) * Math.PI * 2,
          scale: 1.4 + (i % 3) * 0.3,
        });
      }
    }
    const birds = new InstancedMesh(
      geo,
      new MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.6, side: DoubleSide }),
      birdData.length,
    );
    birds.count = birdData.length;
    return { birds, birdData };
  }

  function buildClouds(): Mesh[] {
    const mat = new MeshStandardMaterial({ color: 0xfff6ee, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1 });
    const out: Mesh[] = [];
    const seeds = [
      [-180, 90, 40],
      [40, 110, -80],
      [220, 80, 60],
      [-80, 130, -200],
      [300, 70, 180],
      [-300, 100, 20],
      [120, 95, 220],
    ];
    for (const [x, y, z] of seeds) {
      const cloud = new Mesh(new SphereGeometry(1, 10, 8), mat);
      cloud.scale.set(28 + rng() * 16, 7 + rng() * 3, 16 + rng() * 8);
      cloud.position.set(x, y, z);
      out.push(cloud);
    }
    return out;
  }
}
