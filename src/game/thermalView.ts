import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';
import { THERMALS } from './content';
import { damp, mulberry32 } from './util';

type Mote = {
  index: number;
  y: number;
  ang: number;
  rad: number;
  spin: number;
  rise: number;
};

const columnVert = `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const columnFrag = `
  uniform float uTime;
  uniform float uBoost;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 1.7);
    float rise = fract(vUv.y * 5.0 - uTime * 0.16);
    float band = smoothstep(0.02, 0.28, rise) * smoothstep(0.92, 0.4, rise);
    float yFade = smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
    float alpha = (0.05 + band * 0.07 + fres * 0.11 + uBoost * 0.1) * yFade;
    vec3 col = mix(vec3(0.96, 0.55, 0.22), vec3(1.0, 0.9, 0.7), clamp(fres + band * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

const moteVert = `
  attribute float aSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * (220.0 / max(8.0, -mv.z)), 1.5, 28.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const moteFrag = `
  uniform float uBoost;
  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float d = length(p);
    float a = smoothstep(0.5, 0.08, d);
    if (a < 0.03) discard;
    vec3 col = mix(vec3(1.0, 0.72, 0.38), vec3(1.0, 0.95, 0.82), a);
    gl_FragColor = vec4(col, a * (0.72 + uBoost * 0.2));
  }
`;

/**
 * Amber shafts you can actually see: a soft rising column plus motes
 * drifting up the core. The active shaft brightens when you are in its lift.
 */
export class ThermalView {
  readonly group = new Group();
  private columns: { name: string; mat: ShaderMaterial; boost: number }[] = [];
  private motes: Mote[] = [];
  private positions: Float32Array;
  private points: Points;
  private moteMat: ShaderMaterial;

  constructor() {
    const rand = mulberry32(0x51a7);
    let count = 0;
    for (const t of THERMALS) {
      const mat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uBoost: { value: 0 },
        },
        vertexShader: columnVert,
        fragmentShader: columnFrag,
      });
      const mesh = new Mesh(new CylinderGeometry(1, 1.08, 1, 18, 1, true), mat);
      const radius = t.r * 0.42;
      mesh.scale.set(radius, t.top, radius);
      mesh.position.set(t.x, t.top * 0.5, t.z);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.columns.push({ name: t.name, mat, boost: 0 });
      count += 16;
    }

    this.positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    let n = 0;
    for (let i = 0; i < THERMALS.length; i++) {
      const t = THERMALS[i];
      for (let k = 0; k < 16; k++) {
        const mote: Mote = {
          index: i,
          y: 6 + rand() * Math.max(12, t.top * 0.8),
          ang: rand() * Math.PI * 2,
          rad: (0.08 + rand() * 0.72) * t.r * 0.42,
          spin: (rand() - 0.5) * 0.35,
          rise: 7 + rand() * 9,
        };
        this.motes.push(mote);
        sizes[n] = 10 + rand() * 14;
        n++;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.positions, 3));
    geo.setAttribute('aSize', new BufferAttribute(sizes, 1));
    this.moteMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uBoost: { value: 0 },
      },
      vertexShader: moteVert,
      fragmentShader: moteFrag,
    });
    this.points = new Points(geo, this.moteMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.group.add(this.points);
    this.write(0, 0);
  }

  update(dt: number, time: number, activeName: string | null) {
    let hot = 0;
    for (const col of this.columns) {
      const target = activeName && col.name === activeName ? 1 : 0;
      col.boost = damp(col.boost, target, 2.4, dt);
      col.mat.uniforms.uTime.value = time;
      col.mat.uniforms.uBoost.value = col.boost;
      hot = Math.max(hot, col.boost);
    }
    this.moteMat.uniforms.uBoost.value = hot;
    this.write(dt, time);
  }

  private write(dt: number, time: number) {
    const pos = this.positions;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      const t = THERMALS[m.index];
      m.y += m.rise * dt;
      m.ang += m.spin * dt;
      if (m.y > t.top * 0.9) m.y = 3 + (m.ang % 1) * 8;
      const drift = Math.sin(time * 0.6 + m.ang * 2) * 1.3;
      pos[i * 3] = t.x + Math.cos(m.ang) * m.rad + drift;
      pos[i * 3 + 1] = m.y;
      pos[i * 3 + 2] = t.z + Math.sin(m.ang) * m.rad * 0.86;
    }
    const attr = this.points.geometry.getAttribute('position') as BufferAttribute;
    attr.needsUpdate = true;
  }
}
