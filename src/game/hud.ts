import { WORLD, isWater, terrainHeight } from './terrain';
import type { Activities } from './content';
import { THERMALS, formatTime } from './content';
import type { SaveData } from './save';
import { clamp } from './util';

export class Hud {
  private map: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private mapBig = false;
  private toastTimer = 0;

  constructor() {
    this.map = document.getElementById('map') as HTMLCanvasElement;
    this.base = document.createElement('canvas');
    this.base.width = 180;
    this.base.height = 180;
    this.paintBase();
  }

  private paintBase() {
    const g = this.base.getContext('2d');
    if (!g) return;
    const n = this.base.width;
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const wx = WORLD.minX + (x / (n - 1)) * (WORLD.maxX - WORLD.minX);
        const wz = WORLD.minZ + (y / (n - 1)) * (WORLD.maxZ - WORLD.minZ);
        const i = (y * n + x) * 4;
        if (isWater(wx, wz)) {
          img.data[i] = 28;
          img.data[i + 1] = 92;
          img.data[i + 2] = 102;
        } else {
          const h = terrainHeight(wx, wz);
          const t = Math.min(1, h / 80);
          img.data[i] = 92 + t * 80;
          img.data[i + 1] = 120 + t * 40;
          img.data[i + 2] = 78 - t * 20;
        }
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  private project(x: number, z: number): [number, number] {
    const n = this.map.width;
    const u = (x - WORLD.minX) / (WORLD.maxX - WORLD.minX);
    const v = (z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ);
    return [u * n, v * n];
  }

  toggleMap() {
    this.mapBig = !this.mapBig;
    this.map.classList.toggle('big', this.mapBig);
  }

  toast(text: string) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    this.toastTimer = 3.4;
  }

  tick(dt: number) {
    if (this.toastTimer <= 0) return;
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) document.getElementById('toast')?.classList.remove('show');
  }

  setPrompt(text: string) {
    const el = document.getElementById('prompt');
    if (el) el.textContent = text;
  }

  showHud(on: boolean) {
    const hud = document.getElementById('hud');
    if (hud) hud.hidden = !on;
  }

  showTitle(on: boolean) {
    const el = document.getElementById('title');
    if (el) el.hidden = !on;
  }

  showPause(on: boolean) {
    const el = document.getElementById('pause');
    if (el) el.hidden = !on;
  }

  render(state: {
    place: string;
    x: number;
    y: number;
    z: number;
    heading: number;
    camYaw: number;
    speed: number;
    vy: number;
    gliding: boolean;
    lift: boolean;
    motes: number;
    moteTotal: number;
    marks: number;
    markTotal: number;
    trial: string;
    activities: Activities;
  }) {
    const place = document.getElementById('place');
    if (place) place.textContent = state.place;
    const compass = document.getElementById('compass');
    if (compass) compass.style.transform = `rotate(${-state.camYaw}rad)`;
    const meters = document.getElementById('meters');
    if (meters) {
      const kmh = state.speed * 3.6;
      meters.classList.toggle('lift', state.gliding && state.lift);
      if (state.gliding) {
        const climb = state.vy;
        meters.innerHTML = `<b>${kmh.toFixed(0)}</b><span>km/h</span><b>${state.y.toFixed(0)}</b><span>m</span><b class="${climb >= 0 ? 'up' : 'down'}">${climb >= 0 ? '+' : ''}${climb.toFixed(1)}</b><span>m/s</span>`;
      } else {
        meters.innerHTML = `<b>${kmh.toFixed(0)}</b><span>km/h</span><b>${state.y.toFixed(0)}</b><span>m</span>`;
      }
    }
    const vario = document.getElementById('vario');
    const needle = document.getElementById('vario-needle');
    if (vario && needle) {
      vario.hidden = !state.gliding;
      const t = clamp(state.vy / 8, -1, 1);
      needle.style.bottom = `${50 + t * 46}%`;
      needle.style.background = t >= 0.05 ? '#b6f0c2' : t < -0.05 ? '#ffb4a2' : '#f6efe2';
      vario.classList.toggle('hot', state.gliding && state.lift);
    }
    const count = document.getElementById('count');
    if (count) {
      count.innerHTML = `<span>Sunmotes ${state.motes}/${state.moteTotal}</span><span>Landmarks ${state.marks}/${state.markTotal}</span>`;
    }
    const trial = document.getElementById('trial');
    if (trial) trial.textContent = state.trial;
    this.drawMap(state);
  }

  private drawMap(state: {
    x: number;
    y: number;
    z: number;
    heading: number;
    activities: Activities;
  }) {
    const g = this.map.getContext('2d');
    if (!g) return;
    const n = this.map.width;
    g.clearRect(0, 0, n, n);
    g.drawImage(this.base, 0, 0, n, n);
    g.lineWidth = 2;
    for (const t of THERMALS) {
      const [px, py] = this.project(t.x, t.z);
      g.beginPath();
      g.strokeStyle = 'rgba(255,176,90,0.85)';
      g.arc(px, py, Math.max(3, (t.r / (WORLD.maxX - WORLD.minX)) * n), 0, Math.PI * 2);
      g.stroke();
    }
    for (const mote of state.activities.motes) {
      if (mote.got) continue;
      const [px, py] = this.project(mote.x, mote.z);
      g.fillStyle = '#ffd27a';
      g.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
    }
    for (const mark of state.activities.marks) {
      const [px, py] = this.project(mark.x, mark.z);
      g.beginPath();
      g.fillStyle = mark.found ? '#f4efe4' : '#e07a3a';
      g.arc(px, py, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    const [px, py] = this.project(state.x, state.z);
    g.save();
    g.translate(px, py);
    g.rotate(state.heading);
    g.fillStyle = '#fff8ea';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(4.5, 6);
    g.lineTo(0, 3);
    g.lineTo(-4.5, 6);
    g.closePath();
    g.fill();
    g.restore();
  }

  fillCodex(activities: Activities) {
    const body = document.getElementById('codex-body');
    if (!body) return;
    const marks = activities.marks
      .map(
        (m) =>
          `<li class="${m.found ? 'done' : ''}"><b>${m.found ? m.name : m.name}</b><em>${m.found ? 'Stamped' : 'Unvisited'}</em><p>${m.blurb}</p></li>`,
      )
      .join('');
    const trials = activities.trials
      .map((t) => {
        const best = activities.best[t.id];
        return `<li><b>${t.name}</b><em>${best !== undefined ? formatTime(best) : 'No time yet'}</em><p>${t.blurb}</p></li>`;
      })
      .join('');
    body.innerHTML = `<h3>Landmarks</h3><ul>${marks}</ul><h3>Rings</h3><ul>${trials}</ul><p class="fine">Sunmotes ${activities.moteFound}/${activities.moteTotal}. Rings remember your best pass.</p>`;
  }

  fillStats(save: SaveData, live: { play: number; walked: number; flown: number; maxAlt: number; maxSpeed: number; launches: number; landings: number }) {
    const el = document.getElementById('stats');
    if (!el) return;
    const s = live;
    el.innerHTML = `
      <li><span>Time in the Reach</span><b>${formatTime(s.play)}</b></li>
      <li><span>Walked</span><b>${(s.walked / 1000).toFixed(2)} km</b></li>
      <li><span>Flown</span><b>${(s.flown / 1000).toFixed(2)} km</b></li>
      <li><span>Highest</span><b>${s.maxAlt.toFixed(0)} m</b></li>
      <li><span>Fastest</span><b>${(s.maxSpeed * 3.6).toFixed(0)} km/h</b></li>
      <li><span>Launches</span><b>${s.launches}</b></li>
      <li><span>Landings</span><b>${s.landings}</b></li>
      <li><span>Sunmotes</span><b>${save.motes.length}</b></li>
    `;
  }
}
