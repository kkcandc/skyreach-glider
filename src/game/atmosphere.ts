import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BufferAttribute,
  Color,
  DataTexture,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { WORLD, isWater, shoreZ, terrainHeight, terrainRgb } from './terrain';
import { clamp, lerp, smoothstep } from './util';

export type Grade = {
  zenith: Color;
  horizon: Color;
  fog: Color;
  sun: Color;
  hemiSky: Color;
  hemiGround: Color;
  night: number;
  exposure: number;
  sunIntensity: number;
  hemiIntensity: number;
  density: number;
};

const KEYS: { t: number; g: Grade }[] = [
  key(0, '#070b16', '#1c1640', '#101628', '#9aafd4', '#1a2040', '#0c1210', 1, 0.62, 0.18, 0.22, 0.0024),
  key(0.27, '#f29a78', '#ffd2ae', '#f2c2a4', '#ffc094', '#ffd0b8', '#6a5040', 0.28, 1.02, 2.4, 0.55, 0.0017),
  key(0.48, '#6eb6e6', '#d7eeff', '#c5e0f2', '#fff6e4', '#e7f3ff', '#7d8c72', 0.02, 1.05, 3.5, 0.72, 0.00135),
  key(0.73, '#3f74b0', '#ffb46e', '#f0c29a', '#ffb15e', '#ffd2a4', '#6e5a42', 0.12, 1.08, 3.15, 0.58, 0.00145),
  key(0.86, '#1a2458', '#e27868', '#c48478', '#ff8d68', '#c89890', '#3a3038', 0.55, 0.88, 1.15, 0.34, 0.0019),
  key(1, '#070b16', '#1c1640', '#101628', '#9aafd4', '#1a2040', '#0c1210', 1, 0.62, 0.18, 0.22, 0.0024),
];

function key(
  t: number,
  zenith: string,
  horizon: string,
  fog: string,
  sun: string,
  hemiSky: string,
  hemiGround: string,
  night: number,
  exposure: number,
  sunIntensity: number,
  hemiIntensity: number,
  density: number,
): { t: number; g: Grade } {
  return {
    t,
    g: {
      zenith: new Color(zenith),
      horizon: new Color(horizon),
      fog: new Color(fog),
      sun: new Color(sun),
      hemiSky: new Color(hemiSky),
      hemiGround: new Color(hemiGround),
      night,
      exposure,
      sunIntensity,
      hemiIntensity,
      density,
    },
  };
}

export function gradeAt(t: number): Grade {
  const x = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t < x) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const u = smoothstep(a.t, b.t, x);
  const mix = (c1: Color, c2: Color) => c1.clone().lerp(c2, u);
  return {
    zenith: mix(a.g.zenith, b.g.zenith),
    horizon: mix(a.g.horizon, b.g.horizon),
    fog: mix(a.g.fog, b.g.fog),
    sun: mix(a.g.sun, b.g.sun),
    hemiSky: mix(a.g.hemiSky, b.g.hemiSky),
    hemiGround: mix(a.g.hemiGround, b.g.hemiGround),
    night: lerp(a.g.night, b.g.night, u),
    exposure: lerp(a.g.exposure, b.g.exposure, u),
    sunIntensity: lerp(a.g.sunIntensity, b.g.sunIntensity, u),
    hemiIntensity: lerp(a.g.hemiIntensity, b.g.hemiIntensity, u),
    density: lerp(a.g.density, b.g.density, u),
  };
}

export function sunDirection(t: number, out = new Vector3()): Vector3 {
  const x = ((t % 1) + 1) % 1;
  const az = (x - 0.25) * Math.PI * 2;
  const elev = Math.sin((x - 0.25) * Math.PI * 2);
  const e = Math.max(elev, -0.08);
  out.set(Math.cos(az) * Math.cos(Math.max(e, 0) * 0.55), e * 0.95 + 0.12, Math.sin(az) * 0.45);
  return out.normalize();
}

export class Atmosphere {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly ambient: AmbientLight;
  readonly sky: Mesh;
  readonly water: Mesh;
  private skyMat: ShaderMaterial;
  private waterMat: ShaderMaterial;
  private fog: FogExp2;
  private sunDir = new Vector3();

  constructor(scene: Scene, renderer: WebGLRenderer) {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;

    this.fog = new FogExp2(0xf0c29a, 0.00145);
    scene.fog = this.fog;
    this.ambient = new AmbientLight(0xfff2e4, 0.18);
    this.hemi = new HemisphereLight(0xffd2a4, 0x6e5a42, 0.58);
    this.sun = new DirectionalLight(0xffb15e, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 4;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.bias = -0.00025;
    scene.add(this.ambient, this.hemi, this.sun, this.sun.target);

    this.skyMat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new Color() },
        uHorizon: { value: new Color() },
        uSun: { value: new Color() },
        uSunDir: { value: new Vector3() },
        uNight: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vDir = position;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSun;
        uniform vec3 uSunDir;
        uniform float uNight;
        varying vec3 vDir;
        float hash(vec3 p) {
          p = fract(p * vec3(123.34, 345.45, 789.23));
          p += dot(p, p + 34.45);
          return fract(p.x * p.y);
        }
        void main() {
          vec3 dir = normalize(vDir);
          float h = dir.y * 0.5 + 0.5;
          vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.72, h));
          float sun = pow(max(dot(dir, normalize(uSunDir)), 0.0), mix(1400.0, 400.0, uNight));
          col += uSun * sun * (1.4 - uNight * 0.8);
          float glow = pow(max(dot(dir, normalize(uSunDir)), 0.0), 8.0);
          col += uSun * glow * 0.28 * (1.0 - uNight * 0.5);
          float star = step(0.992, hash(floor(dir * 220.0))) * uNight * smoothstep(0.15, 0.45, dir.y);
          col += vec3(star);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new Mesh(new SphereGeometry(900, 24, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    const mask = bakeMask();
    this.waterMat = new ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uMask: { value: mask },
        uMin: { value: new Vector2(WORLD.minX, WORLD.minZ) },
        uSpan: { value: new Vector2(WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ) },
        uSunDir: { value: new Vector3() },
        uSun: { value: new Color() },
        uDeep: { value: new Color(0x0c4a52) },
        uShallow: { value: new Color(0x3aa8a0) },
        uHorizon: { value: new Color() },
        uNight: { value: 0 },
        uFog: { value: new Color() },
        uDensity: { value: 0.0015 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.y += sin(w.x * 0.045 + uTime * 1.15) * 0.16 + sin(w.z * 0.062 - uTime * 0.85) * 0.12;
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMask;
        uniform vec2 uMin;
        uniform vec2 uSpan;
        uniform vec3 uSunDir;
        uniform vec3 uSun;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uHorizon;
        uniform vec3 uFog;
        uniform float uNight;
        uniform float uDensity;
        varying vec3 vW;
        void main() {
          vec2 uv = (vW.xz - uMin) / uSpan;
          float m = texture2D(uMask, uv).r;
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
          vec3 view = normalize(cameraPosition - vW);
          vec3 deep = mix(uDeep, vec3(0.02, 0.05, 0.1), uNight);
          vec3 shallow = mix(uShallow, vec3(0.05, 0.12, 0.16), uNight);
          vec3 col = mix(deep, shallow, smoothstep(0.08, 0.55, m));
          float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
          col = mix(col, uHorizon, fres * 0.55);
          vec3 r = reflect(-normalize(uSunDir), n);
          float spec = pow(max(dot(r, view), 0.0), 160.0);
          col += uSun * spec * (0.9 - uNight * 0.4);
          float foam = smoothstep(0.07, 0.0, abs(m - 0.48));
          col = mix(col, vec3(0.95, 0.92, 0.84), foam * 0.65 * (1.0 - uNight * 0.4));
          float dist = length(cameraPosition - vW);
          col = mix(col, uFog, 1.0 - exp(-uDensity * dist));
          gl_FragColor = vec4(col, 0.94);
        }
      `,
    });
    this.water = new Mesh(new PlaneGeometry(1700, 1700, 140, 140), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.08;
    this.water.receiveShadow = false;
    scene.add(this.water);

    scene.add(buildTerrain());
  }

  update(timeOfDay: number, elapsed: number, cameraPos: Vector3, focus: Vector3, renderer: WebGLRenderer) {
    const g = gradeAt(timeOfDay);
    sunDirection(timeOfDay, this.sunDir);
    (this.skyMat.uniforms.uZenith.value as Color).copy(g.zenith);
    (this.skyMat.uniforms.uHorizon.value as Color).copy(g.horizon);
    (this.skyMat.uniforms.uSun.value as Color).copy(g.sun);
    (this.skyMat.uniforms.uSunDir.value as Vector3).copy(this.sunDir);
    this.skyMat.uniforms.uNight.value = g.night;
    this.sky.position.copy(cameraPos);

    this.waterMat.uniforms.uTime.value = elapsed;
    (this.waterMat.uniforms.uSunDir.value as Vector3).copy(this.sunDir);
    (this.waterMat.uniforms.uSun.value as Color).copy(g.sun);
    (this.waterMat.uniforms.uHorizon.value as Color).copy(g.horizon);
    (this.waterMat.uniforms.uFog.value as Color).copy(g.fog);
    this.waterMat.uniforms.uNight.value = g.night;
    this.waterMat.uniforms.uDensity.value = g.density;

    this.fog.color.copy(g.fog);
    this.fog.density = g.density;
    this.hemi.color.copy(g.hemiSky);
    this.hemi.groundColor.copy(g.hemiGround);
    this.hemi.intensity = g.hemiIntensity;
    this.sun.color.copy(g.sun);
    this.sun.intensity = g.sunIntensity;
    this.ambient.intensity = 0.12 + g.night * 0.08;
    renderer.toneMappingExposure = g.exposure;

    this.sun.position.copy(focus).addScaledVector(this.sunDir, 90);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    return g;
  }
}

function buildTerrain(): Mesh {
  const segX = 170;
  const segZ = 160;
  const spanX = WORLD.maxX - WORLD.minX;
  const spanZ = WORLD.maxZ - WORLD.minZ;
  const geo = new PlaneGeometry(spanX, spanZ, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (WORLD.minX + WORLD.maxX) / 2;
    const z = pos.getZ(i) + (WORLD.minZ + WORLD.maxZ) / 2;
    // PlaneGeometry is centered on origin. Shift into world bounds.
    pos.setX(i, x);
    pos.setZ(i, z);
    const h = isWater(x, z) ? -3.2 : terrainHeight(x, z);
    pos.setY(i, h);
    const [r, g, b] = terrainRgb(x, z, h);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function bakeMask(): DataTexture {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const wx = WORLD.minX + (x / (n - 1)) * (WORLD.maxX - WORLD.minX);
      const wz = WORLD.minZ + (y / (n - 1)) * (WORLD.maxZ - WORLD.minZ);
      const inland = (shoreZ(wx) - wz) / 46;
      const v = clamp(inland, -1, 1) * 0.5 + 0.5;
      const i = (y * n + x) * 4;
      const c = Math.floor(v * 255);
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
