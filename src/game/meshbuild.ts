import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
} from 'three';
import { clamp, hexToRgb } from './util';

function paint(g: BufferGeometry, color: number, height: number): void {
  const [r, gch, b] = hexToRgb(color);
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const cols = new Float32Array(pos.count * 3);
  let minY = Infinity;
  for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    const t = clamp((pos.getY(i) - minY) / Math.max(height, 0.001), 0, 1);
    const shade = (0.78 + 0.22 * Math.max(0, ny)) * (0.78 + 0.22 * t);
    cols[i * 3] = r * shade;
    cols[i * 3 + 1] = gch * shade;
    cols[i * 3 + 2] = b * shade;
  }
  g.setAttribute('color', new BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  const flat = g.toNonIndexed();
  g.copy(flat);
  flat.dispose();
}

export function makeBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  paint(g, color, sy);
  g.translate(cx, cy, cz);
  return g;
}

export function makeCylinder(
  cx: number,
  cy: number,
  cz: number,
  rTop: number,
  rBot: number,
  h: number,
  color: number,
  sides = 14,
): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBot, h, sides);
  paint(g, color, h);
  g.translate(cx, cy, cz);
  return g;
}

export function makeCone(cx: number, baseY: number, cz: number, r: number, h: number, color: number, sides = 10): BufferGeometry {
  const g = new ConeGeometry(r, h, sides);
  paint(g, color, h);
  g.translate(cx, baseY + h / 2, cz);
  return g;
}

export function makeDome(cx: number, baseY: number, cz: number, r: number, color: number): BufferGeometry {
  const g = new SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  paint(g, color, r);
  g.translate(cx, baseY, cz);
  return g;
}

export function makeRamp(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  y0: number,
  y1: number,
  axis: 'x' | 'z',
  color: number,
): BufferGeometry {
  const thick = 0.42;
  const yAt = (x: number, z: number) => {
    const t = axis === 'z' ? (z - minZ) / (maxZ - minZ || 1) : (x - minX) / (maxX - minX || 1);
    return y0 + (y1 - y0) * clamp(t, 0, 1);
  };
  const c: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  const top = c.map(([x, z]) => [x, yAt(x, z), z]);
  const bot = c.map(([x, z]) => [x, yAt(x, z) - thick, z]);
  const [r, g, b] = hexToRgb(color);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const quad = (a: number[], b2: number[], c2: number[], d: number[], shade: number) => {
    const ax = b2[0] - a[0];
    const ay = b2[1] - a[1];
    const az = b2[2] - a[2];
    const bx = d[0] - a[0];
    const by = d[1] - a[1];
    const bz = d[2] - a[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const p of [a, b2, c2, a, c2, d]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
      colors.push(r * shade, g * shade, b * shade);
    }
  };
  quad(top[0], top[3], top[2], top[1], 1);
  quad(bot[0], bot[1], bot[2], bot[3], 0.62);
  quad(top[0], bot[0], bot[1], top[1], 0.84);
  quad(top[1], bot[1], bot[2], top[2], 0.84);
  quad(top[2], bot[2], bot[3], top[3], 0.84);
  quad(top[3], bot[3], bot[0], top[0], 0.84);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geo;
}

export function shadeColor(hex: number, scale: number): number {
  const c = new Color(hex);
  c.multiplyScalar(scale);
  return c.getHex();
}
