import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Player } from './player';

export class Avatar {
  readonly group = new Group();
  private wing: Group;
  private legL: Group;
  private legR: Group;
  private armL: Group;
  private armR: Group;

  constructor() {
    const cloth = new MeshStandardMaterial({ color: 0xe08a3c, roughness: 0.7 });
    const dark = new MeshStandardMaterial({ color: 0x243038, roughness: 0.75 });
    const skin = new MeshStandardMaterial({ color: 0xe2b394, roughness: 0.6 });
    const torso = new Mesh(new CylinderGeometry(0.28, 0.32, 0.72, 8), cloth);
    torso.position.y = 1.15;
    torso.castShadow = true;
    const head = new Mesh(new SphereGeometry(0.2, 10, 8), skin);
    head.position.y = 1.68;
    head.castShadow = true;
    const pack = new Mesh(new CylinderGeometry(0.12, 0.16, 0.34, 6), dark);
    pack.position.set(0, 1.2, 0.22);
    this.armL = limb(0.22, dark, -0.34, 1.2);
    this.armR = limb(0.22, dark, 0.34, 1.2);
    this.legL = limb(0.38, dark, -0.14, 0.55);
    this.legR = limb(0.38, dark, 0.14, 0.55);
    this.wing = buildWing();
    this.group.add(torso, head, pack, this.armL, this.armR, this.legL, this.legR, this.wing);
  }

  sync(player: Player) {
    this.group.position.copy(player.pos);
    this.group.rotation.order = 'YXZ';
    const glide = player.deploy;
    this.group.rotation.y = player.heading;
    this.group.rotation.x = player.pitch * glide;
    this.group.rotation.z = -player.bank * glide;

    const step = Math.sin(player.walkPhase);
    const moving = player.grounded && !player.gliding;
    this.legL.rotation.x = moving ? step * 0.7 : glide * 0.4;
    this.legR.rotation.x = moving ? -step * 0.7 : glide * 0.35;
    this.armL.rotation.x = moving ? -step * 0.6 : -1.1 * glide;
    this.armR.rotation.x = moving ? step * 0.6 : -1.1 * glide;
    this.armL.rotation.z = 0.15 + glide * 0.4;
    this.armR.rotation.z = -0.15 - glide * 0.4;

    const open = 0.15 + glide * 0.85;
    this.wing.scale.set(open, open, 0.35 + glide * 0.65);
    this.wing.position.set(0, 1.35 + glide * 0.55, glide * 0.15);
    this.wing.rotation.x = -0.4 + glide * 0.35;
    this.wing.visible = true;
  }
}

function limb(len: number, mat: MeshStandardMaterial, x: number, y: number): Group {
  const g = new Group();
  const mesh = new Mesh(new CylinderGeometry(0.07, 0.08, len, 6), mat);
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  g.add(mesh);
  g.position.set(x, y, 0);
  return g;
}

function buildWing(): Group {
  const g = new Group();
  const geo = new BufferGeometry();
  const cols = 12;
  const rows = 5;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const saffron = new Color(0xf0a23a);
  const cream = new Color(0xfff1d4);
  const teal = new Color(0x1f7c78);
  const grid: Vector3[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const u = c / cols * 2 - 1;
      const v = r / rows;
      const x = u * (0.2 + v * 3.7);
      const z = -1.35 + v * 2.55;
      const billow = Math.sin(v * Math.PI) * (1 - u * u) * 0.22;
      const y = billow - Math.abs(u) * 0.18 * v;
      grid.push(new Vector3(x, y, z));
      const stripe = Math.abs(u) < 0.12 ? teal : u * v > 0.2 ? saffron : cream;
      colors.push(stripe.r, stripe.g, stripe.b);
    }
  }
  for (const p of grid) positions.push(p.x, p.y, p.z);
  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * stride + c;
      indices.push(i, i + 1, i + stride, i + 1, i + stride + 1, i + stride);
    }
  }
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const sail = new Mesh(
    geo,
    new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.55, metalness: 0.04 }),
  );
  sail.castShadow = true;
  const frame = new MeshStandardMaterial({ color: 0x2a3338, roughness: 0.4, metalness: 0.6 });
  const bar = new Mesh(new CylinderGeometry(0.035, 0.035, 7.2, 6), frame);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, -0.05, 0.7);
  g.add(sail, bar);
  return g;
}
