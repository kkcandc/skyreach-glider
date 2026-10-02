import {
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Atmosphere } from './atmosphere';
import { AudioBus } from './audio';
import { Avatar } from './avatar';
import { buildCity } from './city';
import { Activities, THERMALS, breeze, formatTime, updraftAt } from './content';
import { Hud } from './hud';
import { Input } from './input';
import { Player } from './player';
import { emptySave, loadSave, writeSave, type SaveData } from './save';
import { placeName, promenadePoint, terrainHeight } from './terrain';
import { clamp, damp, lerp } from './util';

const TIMES = [0.28, 0.48, 0.73, 0.96];

export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private composer: EffectComposer;
  private input: Input;
  private player = new Player();
  private avatar = new Avatar();
  private hud = new Hud();
  private audio = new AudioBus();
  private city: ReturnType<typeof buildCity>;
  private activities: Activities;
  private atmosphere: Atmosphere;
  private blob: Mesh;
  private save: SaveData;
  private started = false;
  private paused = false;
  private codex = false;
  private timeOfDay: number;
  private timeTarget: number;
  private auto: boolean;
  private elapsed = 0;
  private titleT = 0;
  private saveT = 0;
  private playT = 0;
  private shake = 0;
  private camPos = new Vector3();
  private camReady = false;
  private seenGlide = false;
  private focus = new Vector3();
  private thermalColumns: Mesh[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.camera = new PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.12, 2200);
    this.atmosphere = new Atmosphere(this.scene, this.renderer);
    this.city = buildCity();
    this.scene.add(this.city.group);
    this.save = loadSave();
    this.timeOfDay = this.save.settings.time;
    this.timeTarget = this.timeOfDay;
    this.auto = this.save.settings.auto;
    this.input = new Input(canvas);
    this.input.sens = this.save.settings.sens;
    this.input.invert = this.save.settings.invert;
    this.activities = new Activities(
      this.city.roofs,
      this.city.marks,
      this.city.collision,
      this.save.motes,
      this.save.marks,
      this.save.trials,
    );
    this.scene.add(this.activities.group);
    this.scene.add(this.avatar.group);
    this.addThermals();
    this.blob = new Mesh(
      new CircleGeometry(0.85, 18),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.22, 0.42, 0.88);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    const spawn = promenadePoint(-18);
    this.player.spawn(spawn.x, spawn.y + 0.05, spawn.z, 0);
    this.player.walked = this.save.stats.walked;
    this.player.flown = this.save.stats.flown;
    this.player.maxAlt = this.save.stats.maxAlt;
    this.player.maxSpeed = this.save.stats.maxSpeed;
    this.player.launches = this.save.stats.launches;
    this.player.landings = this.save.stats.landings;
    this.playT = this.save.stats.play;

    window.addEventListener('resize', () => this.resize());
    this.expose();
    requestAnimationFrame((t) => this.frame(t));
  }

  private addThermals() {
    const mat = new MeshBasicMaterial({
      color: 0xffb56a,
      transparent: true,
      opacity: 0.075,
      side: DoubleSide,
      depthWrite: false,
    });
    for (const t of THERMALS) {
      const mesh = new Mesh(new CylinderGeometry(1, 1.15, 1, 14, 1, true), mat);
      mesh.scale.set(t.r * 0.92, t.top, t.r * 0.92);
      mesh.position.set(t.x, t.top / 2, t.z);
      this.scene.add(mesh);
      this.thermalColumns.push(mesh);
    }
  }

  start(where: 'harbor' | 'crown') {
    this.audio.unlock();
    this.started = true;
    this.paused = false;
    this.hud.showTitle(false);
    this.hud.showPause(false);
    this.hud.showHud(true);
    this.camReady = false;
    if (where === 'crown') {
      const mark = this.city.marks.find((m) => m.id === 'crown')!;
      this.player.launchAir(mark.x, mark.y + 1.2, mark.z, Math.PI);
      this.input.camYaw = Math.PI;
      this.seenGlide = true;
      this.hud.toast('The Crown lets you go. Nose down to build speed.');
    } else {
      const p = promenadePoint(-18);
      this.player.spawn(p.x, p.y + 0.05, p.z, 0);
      this.input.camYaw = 0;
      this.hud.toast('The Salt Promenade. The hill north of you is the way up.');
    }
  }

  pause() {
    if (!this.started || this.paused) return;
    this.paused = true;
    this.hud.showPause(true);
    this.hud.fillStats(this.snapshot(), this.liveStats());
    const time = document.getElementById('time-slider') as HTMLInputElement | null;
    const sens = document.getElementById('sens-slider') as HTMLInputElement | null;
    const invert = document.getElementById('invert') as HTMLInputElement | null;
    const auto = document.getElementById('auto-cycle') as HTMLInputElement | null;
    if (time) time.value = String(this.timeOfDay);
    if (sens) sens.value = String(this.input.sens);
    if (invert) invert.checked = this.input.invert;
    if (auto) auto.checked = this.auto;
  }

  resume() {
    this.paused = false;
    this.hud.showPause(false);
  }

  onPointerLock(locked: boolean) {
    const had = this.input.locked;
    this.input.locked = locked;
    if (had && !locked && this.started && !this.paused) this.pause();
  }

  press(code: string, down: boolean) {
    this.input.pressVirtual(code, down);
  }

  setTime(t: number) {
    this.timeTarget = clamp(t, 0, 1);
    this.timeOfDay = this.timeTarget;
  }

  setSens(v: number) {
    this.input.sens = v;
  }

  setInvert(v: boolean) {
    this.input.invert = v;
  }

  setAuto(v: boolean) {
    this.auto = v;
  }

  resetProgress() {
    const settings = this.snapshot().settings;
    const fresh = emptySave();
    fresh.settings = settings;
    writeSave(fresh);
    location.reload();
  }

  private last = performance.now();

  private frame = (now: number) => {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;
    if (this.auto && this.started && !this.paused) this.timeTarget = (this.timeTarget + dt / 180) % 1;
    this.timeOfDay = damp(this.timeOfDay, this.timeTarget, 1.6, dt);
    if (Math.abs(this.timeTarget - this.timeOfDay) > 0.5) this.timeOfDay = damp(this.timeOfDay, this.timeTarget, 0.6, dt);

    if (!this.started) this.updateTitle(dt);
    else if (!this.paused) this.updatePlay(dt);
    else this.renderFrame();

    this.hud.tick(dt);
    requestAnimationFrame(this.frame);
  };

  private updateTitle(dt: number) {
    this.titleT += dt;
    const shots = [
      { p: [-30, 18, 230], l: [-140, 20, 110] },
      { p: [150, 55, 30], l: [98, 70, -6] },
      { p: [30, 110, -280], l: [0, 40, 40] },
      { p: [-210, 24, 70], l: [-150, 16, 16] },
      { p: [300, 22, 250], l: [180, 12, 180] },
      { p: [-10, 12, 190], l: [0, 30, 40] },
    ];
    const seg = 9;
    const u = (this.titleT % (shots.length * seg)) / seg;
    const i = Math.floor(u) % shots.length;
    const f = smooth(u - Math.floor(u));
    const a = shots[i];
    const b = shots[(i + 1) % shots.length];
    this.camera.position.set(lerp(a.p[0], b.p[0], f), lerp(a.p[1], b.p[1], f), lerp(a.p[2], b.p[2], f));
    this.camera.lookAt(lerp(a.l[0], b.l[0], f), lerp(a.l[1], b.l[1], f), lerp(a.l[2], b.l[2], f));
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    this.focus.copy(this.camera.position);
    this.dress(dt);
    this.composer.render();
  }

  private updatePlay(dt: number) {
    if (this.input.escapePressed) {
      this.input.escapePressed = false;
      this.pause();
      return;
    }
    const frame = this.input.sample(this.player.gliding, dt, this.player.heading);
    if (frame.timePressed) {
      const next = TIMES.find((t) => t > this.timeOfDay + 0.03) ?? TIMES[0];
      this.timeTarget = next;
      this.hud.toast(next > 0.9 ? 'Night over Halcyon' : next > 0.6 ? 'Golden hour' : next > 0.4 ? 'Noon' : 'Dawn');
    }
    if (frame.codexPressed) {
      this.codex = !this.codex;
      const panel = document.getElementById('codex');
      if (panel) panel.hidden = !this.codex;
      if (this.codex) this.hud.fillCodex(this.activities);
    }
    if (frame.mapPressed) this.hud.toggleMap();
    if (frame.resetTrial) {
      const ev = this.activities.resetTrial();
      if (ev) this.hud.toast('Ring run cleared');
    }

    const draft = updraftAt(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    const wind = breeze(this.elapsed);
    if (this.player.gliding) wind.y = draft.up;
    const event = this.player.update(dt, frame, this.city.collision, wind, this.input.sens * (this.player.gliding ? 1 : 1));
    if (event === 'splash') this.hud.toast('The bay sends you back to solid ground.');
    if (event === 'hard') {
      this.shake = 0.35;
      this.hud.toast('Hard landing. The wing forgives you.');
      this.audio.tone(90, 0.2, 'triangle', 0.06);
    }
    if (event === 'land') this.audio.tone(180, 0.08, 'sine', 0.04);
    if (event === 'launch') {
      this.seenGlide = true;
      this.audio.tone(320, 0.18, 'sawtooth', 0.03);
    }
    if (event === 'need-air') this.hud.toast('Sprint off a roof, or climb. The wing wants a drop.');

    const events = this.activities.update(dt, this.player, this.elapsed);
    for (const ev of events) {
      if (ev.type === 'mote') {
        this.audio.tone(660 + ev.found * 8, 0.12, 'sine', 0.07);
        this.hud.toast(`Sunmote ${ev.found} / ${ev.total}`);
      } else if (ev.type === 'mark') {
        this.audio.chord([392, 494, 587]);
        this.hud.toast(`${ev.name}  ·  ${ev.found}/${ev.total}`);
      } else if (ev.type === 'trial-start') {
        this.hud.toast(`${ev.name} — clock is running`);
        this.audio.tone(520, 0.1, 'square', 0.04);
      } else if (ev.type === 'trial-done') {
        this.audio.chord([523, 659, 784]);
        this.hud.toast(`${ev.name}  ${formatTime(ev.time)}${ev.best ? '  ·  best' : ''}`);
      } else if (ev.type === 'ring') {
        this.audio.tone(480 + ev.n * 30, 0.08, 'sine', 0.05);
      }
    }

    this.playT += dt;
    this.avatar.sync(this.player);
    this.updateBlob();
    this.updateCamera(dt, frame.camYaw, frame.camPitch);
    this.prompt(draft.name);
    this.hud.render({
      place: placeName(this.player.pos.x, this.player.pos.y, this.player.pos.z),
      x: this.player.pos.x,
      y: this.player.pos.y,
      z: this.player.pos.z,
      heading: this.player.heading,
      camYaw: frame.camYaw,
      speed: this.player.gliding ? this.player.airSpeed : this.player.vel.length(),
      vy: this.player.vel.y,
      gliding: this.player.gliding,
      motes: this.activities.moteFound,
      moteTotal: this.activities.moteTotal,
      marks: this.activities.markFound,
      markTotal: this.activities.marks.length,
      trial: this.trialLabel(),
      activities: this.activities,
    });
    this.audio.wind(this.player.gliding ? this.player.airSpeed : this.player.vel.length(), this.player.gliding);
    this.dress(dt);
    this.composer.render();
    this.saveT += dt;
    if (this.saveT > 4) {
      this.saveT = 0;
      this.persist();
    }
  }

  private trialLabel(): string {
    if (!this.activities.active) return 'Fly a gold ring to start a run';
    const trial = this.activities.trials.find((t) => t.id === this.activities.active!.id)!;
    return `${trial.name}  ${formatTime(this.activities.active.time)}  ·  ring ${this.activities.active.index + 1}/${trial.rings.length}`;
  }

  private prompt(thermal: string | null) {
    if (this.player.gliding && this.player.airSpeed < 11) {
      this.hud.setPrompt('Stall — push the nose down');
      return;
    }
    if (this.player.gliding && thermal && this.player.vel.y > 1) {
      this.hud.setPrompt(`Thermal · ${thermal}`);
      return;
    }
    if (!this.player.gliding && this.player.pos.y > 8) {
      this.hud.setPrompt('Press G to open the wing');
      return;
    }
    if (!this.seenGlide) {
      this.hud.setPrompt('WASD move · Shift sprint · Space jump · mouse looks · G glides');
      return;
    }
    this.hud.setPrompt(this.player.gliding ? 'Mouse steers · W dive · S climb · A/D bank · Space flare · G stow' : 'C atlas · M map · N time of day');
  }

  private updateCamera(dt: number, yaw: number, pitch: number) {
    const lookX = Math.sin(yaw);
    const lookZ = -Math.cos(yaw);
    const dist = this.player.gliding ? 9.4 : 5.7;
    const elev = pitch;
    const target = this.player.pos.clone();
    target.y += this.player.gliding ? 1.05 : 1.5;
    const bob = this.player.grounded && !this.player.gliding ? Math.sin(this.player.walkPhase * 2) * 0.04 : 0;
    const desired = new Vector3(
      target.x - lookX * Math.cos(elev) * dist,
      target.y + Math.sin(elev) * dist * 0.92 + (this.player.gliding ? 1.1 : 0.35) + bob,
      target.z - lookZ * Math.cos(elev) * dist,
    );
    const cleared = this.clearCamera(target, desired);
    if (!this.camReady) {
      this.camPos.copy(cleared);
      this.camReady = true;
    } else {
      this.camPos.lerp(cleared, 1 - Math.exp(-7 * dt));
    }
    if (this.shake > 0) {
      this.camPos.x += (Math.random() - 0.5) * this.shake;
      this.camPos.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.3);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(target);
    if (this.player.gliding) this.camera.rotateZ(-this.player.bank * 0.4);
    const speed = this.player.vel.length();
    const fov = this.player.gliding ? 70 + clamp((speed - 16) / 24, 0, 1) * 14 : 66;
    if (Math.abs(this.camera.fov - fov) > 0.02) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  private clearCamera(from: Vector3, to: Vector3): Vector3 {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.2) return to;
    dir.multiplyScalar(1 / len);
    let safe = len;
    const steps = Math.ceil(len / 0.45);
    for (let i = 1; i <= steps; i++) {
      const d = (len * i) / steps;
      const p = from.clone().addScaledVector(dir, d);
      const pushed = this.city.collision.resolve(p.x, p.z, p.y - 0.6, 1.1, 0.28);
      if (Math.hypot(pushed.x - p.x, pushed.z - p.z) > 0.08) {
        safe = Math.max(0.7, d - 0.4);
        break;
      }
      const ground = terrainHeight(p.x, p.z);
      if (!Number.isNaN(ground) && p.y < ground + 0.4 && p.y > -2) {
        safe = Math.max(0.7, d - 0.35);
        break;
      }
    }
    return from.clone().addScaledVector(dir, safe);
  }

  private updateBlob() {
    const g = this.city.collision.support(this.player.pos.x, this.player.pos.z, this.player.pos.y);
    const alt = Math.max(0, this.player.pos.y - g);
    this.blob.position.set(this.player.pos.x, (g > -20 ? g : this.player.pos.y) + 0.12, this.player.pos.z);
    const s = clamp(1.2 - alt / 50, 0.22, 1.35);
    this.blob.scale.setScalar(s);
    (this.blob.material as MeshBasicMaterial).opacity = clamp(0.32 - alt / 110, 0, 0.32);
  }

  private dress(dt: number) {
    const focus = this.started && !this.paused ? this.player.pos : this.camera.position;
    this.focus.copy(focus);
    const grade = this.atmosphere.update(this.timeOfDay, this.elapsed, this.camera.position, this.focus, this.renderer);
    this.city.windowMat.emissiveIntensity = 0.04 + grade.night * 1.5;
    this.city.lampMat.emissiveIntensity = 0.08 + grade.night * 2.4;
    const dummy = new Vector3();
    this.city.birdData.forEach((b, i) => {
      const a = this.elapsed * b.speed + b.phase;
      dummy.set(b.cx + Math.cos(a) * b.r, b.cy + Math.sin(a * 2) * 1.4, b.cz + Math.sin(a) * b.r * 0.72);
      const m = this.city.birds;
      const obj = _bird;
      obj.position.copy(dummy);
      obj.rotation.set(0, -a + Math.PI / 2, Math.sin(this.elapsed * 8 + b.phase) * 0.4);
      obj.scale.setScalar(b.scale);
      obj.updateMatrix();
      m.setMatrixAt(i, obj.matrix);
    });
    this.city.birds.instanceMatrix.needsUpdate = true;
    for (const boat of this.city.boats) {
      boat.position.y = Math.sin(this.elapsed * 0.8 + boat.position.x) * 0.18;
    }
    for (const cloud of this.city.clouds) {
      cloud.position.x += dt * 1.4;
      if (cloud.position.x > 480) cloud.position.x = -480;
    }
    for (const col of this.thermalColumns) {
      col.rotation.y += dt * 0.15;
    }
  }

  private renderFrame() {
    this.dress(0.016);
    this.composer.render();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private liveStats() {
    return {
      play: this.playT,
      walked: this.player.walked,
      flown: this.player.flown,
      maxAlt: this.player.maxAlt,
      maxSpeed: this.player.maxSpeed,
      launches: this.player.launches,
      landings: this.player.landings,
    };
  }

  private snapshot(): SaveData {
    const stats = this.liveStats();
    return {
      motes: this.activities.collectedIds(),
      marks: this.activities.foundMarkIds(),
      trials: { ...this.activities.best },
      stats,
      settings: {
        sens: this.input.sens,
        invert: this.input.invert,
        time: this.timeOfDay,
        auto: this.auto,
      },
    };
  }

  private persist() {
    this.save = this.snapshot();
    writeSave(this.save);
  }

  private expose() {
    window.__SKY = {
      getState: () => ({
        x: this.player.pos.x,
        y: this.player.pos.y,
        z: this.player.pos.z,
        vx: this.player.vel.x,
        vy: this.player.vel.y,
        vz: this.player.vel.z,
        mode: !this.started ? 'title' : this.paused ? 'pause' : this.player.gliding ? 'glide' : 'walk',
        grounded: this.player.grounded,
        speed: this.player.vel.length(),
        heading: this.player.heading,
        pitch: this.player.pitch,
        bank: this.player.bank,
        motes: this.activities.moteFound,
        moteTotal: this.activities.moteTotal,
        landmarks: this.activities.markFound,
        place: placeName(this.player.pos.x, this.player.pos.y, this.player.pos.z),
        alt: this.player.pos.y,
        gliding: this.player.gliding,
      }),
      setPos: (x, y, z) => {
        this.player.pos.set(x, y, z);
        this.player.vel.set(0, 0, 0);
        this.player.grounded = false;
        this.player.gliding = false;
      },
      deploy: () => {
        this.player.gliding = false;
        this.input.pressVirtual('KeyG', true);
        this.input.pressVirtual('KeyG', false);
      },
      stow: () => {
        this.player.gliding = false;
      },
      setTime: (t) => this.setTime(t),
      collectNear: () => this.activities.moteFound,
    };
  }
}

const _bird = new Mesh();

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
