import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  TorusGeometry,
} from 'three';
import type { CollisionWorld } from './collision';
import type { Mark, Roof } from './city';
import { HOPS, type SpotId } from './places';
import { promenadePoint, terrainHeight } from './terrain';
import { smoothstep } from './util';
import type { Player } from './player';

export type Thermal = {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  up: number;
  top: number;
};

export const THERMALS: Thermal[] = [
  { id: 'plaza', name: 'Moonpool column', x: 8, z: 52, r: 28, up: 7.2, top: 100 },
  { id: 'garden', name: 'Garden breath', x: 50, z: 132, r: 26, up: 6.5, top: 85 },
  { id: 'wharf', name: 'Wharf glass', x: -24, z: 178, r: 32, up: 6.8, top: 90 },
  { id: 'spire', name: 'Spire lee', x: 142, z: 10, r: 24, up: 8.4, top: 155 },
  { id: 'crown', name: 'Crown thermal', x: 38, z: -248, r: 32, up: 9.4, top: 175 },
  { id: 'ridge', name: 'Ridge lift', x: -300, z: -70, r: 26, up: 7.1, top: 115 },
  { id: 'bay', name: 'Bay swirl', x: -160, z: 178, r: 36, up: 6.3, top: 85 },
  { id: 'east', name: 'Eastveil', x: 268, z: 28, r: 28, up: 6.7, top: 105 },
];

export function updraftAt(x: number, y: number, z: number): { up: number; name: string | null } {
  let up = 0;
  let name: string | null = null;
  for (const t of THERMALS) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d > t.r || y < 1.2 || y > t.top) continue;
    const k = 1 - d / t.r;
    const hf = 1 - smoothstep(t.top - 28, t.top, y);
    const u = t.up * k * k * hf;
    if (u > up) {
      up = u;
      name = t.name;
    }
  }
  return { up, name };
}

export function breeze(time: number): { x: number; y: number; z: number } {
  return {
    x: 1.55 + Math.sin(time * 0.07) * 1.35,
    y: 0,
    z: -3.05 + Math.sin(time * 0.05 + 1.6) * 1.15,
  };
}

type Ring = { x: number; y: number; z: number; r: number };
type TrialDef = { id: string; name: string; blurb: string; rings: Ring[] };

export type ActEvent =
  | { type: 'mote'; found: number; total: number }
  | { type: 'mark'; name: string; found: number; total: number }
  | { type: 'ring'; n: number; of: number; name: string }
  | { type: 'trial-start'; name: string }
  | { type: 'trial-done'; name: string; time: number; best: boolean }
  | { type: 'reset' };

export class Activities {
  readonly group = new Group();
  readonly motes: { id: string; x: number; y: number; z: number; r: number; mesh: Mesh; got: boolean }[] = [];
  readonly marks: (Mark & { found: boolean; beam: Mesh })[];
  readonly trials: TrialDef[];
  active: { id: string; index: number; time: number } | null = null;
  best: Record<string, number> = {};
  private rings: Mesh[] = [];
  private foundMotes = 0;

  constructor(roofs: Roof[], marks: Mark[], collision: CollisionWorld, collected: string[], foundMarks: string[], best: Record<string, number>) {
    this.best = { ...best };
    const have = new Set(collected);
    const moteMat = new MeshBasicMaterial({ color: 0xffc56a });
    const geo = new OctahedronGeometry(0.55, 0);
    const addMote = (id: string, x: number, y: number, z: number, r = 1.7) => {
      if (collision.inside(x, y, z)) return;
      const mesh = new Mesh(geo, moteMat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      const got = have.has(id);
      mesh.visible = !got;
      this.motes.push({ id, x, y, z, r, mesh, got });
      if (got) this.foundMotes++;
    };

    let n = 0;
    for (const m of marks) addMote(`mark-${m.id}`, m.x, m.y + 1.5, m.z, 2.2);
    for (const hop of HOPS) {
      const y = terrainHeight(hop.x, hop.z) + hop.h + 1.4;
      addMote(`hop-${n++}`, hop.x, y, hop.z, 1.5);
    }
    const ranked = [...roofs].sort((a, b) => b.y - a.y);
    const picked: Roof[] = [];
    for (const roof of ranked) {
      if (roof.y < 7) continue;
      if (picked.some((p) => Math.hypot(p.x - roof.x, p.z - roof.z) < 34)) continue;
      picked.push(roof);
      addMote(`roof-${picked.length}`, roof.x, roof.y + 1.6, roof.z, 1.6);
      if (picked.length >= 24) break;
    }
    for (let x = -220; x <= 260; x += 80) {
      const p = promenadePoint(x);
      addMote(`prom-${x}`, p.x, p.y + 1.8, p.z, 1.6);
    }
    const air: [string, number, number, number][] = [
      ['air-crown-1', 0, 96, -300],
      ['air-crown-2', 20, 78, -220],
      ['air-crown-3', 10, 58, -140],
      ['air-crown-4', -10, 40, -40],
      ['air-spire-1', 98, 70, -6],
      ['air-spire-2', 120, 96, 8],
      ['air-spire-3', 70, 48, 20],
      ['air-bay-1', -160, 36, 150],
      ['air-bay-2', -90, 42, 190],
      ['air-bay-3', 40, 34, 210],
      ['air-bridge', -160, 28, 102],
      ['air-ridge', -320, 62, -90],
      ['air-east', 240, 40, 40],
      ['air-garden', 36, 28, 118],
      ['air-thermal', 38, 120, -248],
      ['air-wharf', -24, 48, 178],
    ];
    for (const [id, x, y, z] of air) addMote(id, x, y, z, 2.6);

    this.marks = marks.map((m) => {
      const beam = new Mesh(
        new OctahedronGeometry(0.8, 0),
        new MeshBasicMaterial({
          color: 0xffd27a,
          transparent: true,
          opacity: 0.85,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      beam.position.set(m.x, m.y + 6, m.z);
      beam.scale.set(0.35, 3.2, 0.35);
      const found = foundMarks.includes(m.id);
      beam.visible = !found;
      this.group.add(beam);
      return { ...m, found, beam };
    });

    this.trials = buildTrials(marks);
    const ringMat = new MeshBasicMaterial({ color: 0xffd27a });
    for (const trial of this.trials) {
      for (const ring of trial.rings) {
        const mesh = new Mesh(new TorusGeometry(ring.r, 0.16, 8, 28), ringMat);
        mesh.position.set(ring.x, ring.y, ring.z);
        mesh.visible = false;
        this.group.add(mesh);
        this.rings.push(mesh);
      }
    }
    this.layoutRings();
  }

  get moteFound() {
    return this.foundMotes;
  }

  get moteTotal() {
    return this.motes.length;
  }

  get markFound() {
    return this.marks.filter((m) => m.found).length;
  }

  update(dt: number, player: Player, time: number): ActEvent[] {
    const events: ActEvent[] = [];
    for (const mote of this.motes) {
      if (mote.got) continue;
      mote.mesh.rotation.y += dt * 1.4;
      mote.mesh.position.y = mote.y + Math.sin(time * 2 + mote.x) * 0.25;
      const d = player.pos.distanceTo(mote.mesh.position);
      if (d < mote.r + (player.gliding ? 0.8 : 0)) {
        mote.got = true;
        mote.mesh.visible = false;
        this.foundMotes++;
        events.push({ type: 'mote', found: this.foundMotes, total: this.moteTotal });
      }
    }
    for (const mark of this.marks) {
      mark.beam.rotation.y += dt * 0.4;
      if (mark.found) continue;
      const d = Math.hypot(player.pos.x - mark.x, player.pos.z - mark.z);
      const dy = Math.abs(player.pos.y - mark.y);
      if (d < 9 && dy < 8) {
        mark.found = true;
        mark.beam.visible = false;
        events.push({ type: 'mark', name: mark.name, found: this.markFound, total: this.marks.length });
      }
    }
    this.animateRings(time);
    if (this.active) {
      const trial = this.trials.find((t) => t.id === this.active!.id)!;
      this.active.time += dt;
      const ring = trial.rings[this.active.index];
      const d = Math.hypot(player.pos.x - ring.x, player.pos.y - ring.y, player.pos.z - ring.z);
      if (d < ring.r) {
        this.active.index++;
        if (this.active.index >= trial.rings.length) {
          const t = this.active.time;
          const prev = this.best[trial.id];
          const best = prev === undefined || t < prev;
          if (best) this.best[trial.id] = t;
          events.push({ type: 'trial-done', name: trial.name, time: t, best });
          this.active = null;
          this.layoutRings();
        } else {
          events.push({ type: 'ring', n: this.active.index, of: trial.rings.length, name: trial.name });
          this.layoutRings();
        }
      }
    } else {
      for (const trial of this.trials) {
        const ring = trial.rings[0];
        const d = Math.hypot(player.pos.x - ring.x, player.pos.y - ring.y, player.pos.z - ring.z);
        if (d < ring.r) {
          this.active = { id: trial.id, index: 1, time: 0 };
          events.push({ type: 'trial-start', name: trial.name });
          if (trial.rings.length === 1) {
            /* unreachable, all trials have more */
          } else {
            events.push({ type: 'ring', n: 1, of: trial.rings.length, name: trial.name });
          }
          this.layoutRings();
          break;
        }
      }
    }
    return events;
  }

  resetTrial(): ActEvent | null {
    if (!this.active) return null;
    this.active = null;
    this.layoutRings();
    return { type: 'reset' };
  }

  private layoutRings() {
    let cursor = 0;
    for (let t = 0; t < this.trials.length; t++) {
      const trial = this.trials[t];
      const live = this.active?.id === trial.id;
      for (let i = 0; i < trial.rings.length; i++) {
        const mesh = this.rings[cursor++];
        const show = !this.active || live;
        mesh.visible = show && (!live || i >= (this.active?.index ?? 0));
        const mat = mesh.material as MeshBasicMaterial;
        const next = live && i === this.active!.index;
        mat.color.set(next ? 0xffe08a : 0x7ee0d6);
        mat.opacity = next ? 1 : 0.55;
        mat.transparent = true;
        const ring = trial.rings[i];
        const after = trial.rings[Math.min(i + 1, trial.rings.length - 1)];
        const before = trial.rings[Math.max(i - 1, 0)];
        const tx = i < trial.rings.length - 1 ? after.x : ring.x + (ring.x - before.x);
        const ty = i < trial.rings.length - 1 ? after.y : ring.y;
        const tz = i < trial.rings.length - 1 ? after.z : ring.z + (ring.z - before.z);
        mesh.lookAt(tx, ty, tz);
        mesh.userData.tx = tx;
        mesh.userData.ty = ty;
        mesh.userData.tz = tz;
      }
    }
  }

  private animateRings(time: number) {
    for (const mesh of this.rings) {
      if (!mesh.visible) continue;
      const u = mesh.userData as { tx?: number; ty?: number; tz?: number };
      if (u.tx === undefined) continue;
      mesh.lookAt(u.tx, u.ty ?? 0, u.tz ?? 0);
      mesh.rotateZ(time * 0.7);
    }
  }

  collectedIds(): string[] {
    return this.motes.filter((m) => m.got).map((m) => m.id);
  }

  foundMarkIds(): string[] {
    return this.marks.filter((m) => m.found).map((m) => m.id);
  }
}

function buildTrials(marks: Mark[]): TrialDef[] {
  const at = (id: SpotId) => marks.find((m) => m.id === id)!;
  const crown = at('crown');
  const spire = at('spire');
  const arch = at('arch');
  const crane = at('crane');
  const light = at('light');
  const zig = at('ziggurat');
  const prom: Ring[] = [];
  for (let x = -200; x <= 220; x += 70) {
    const p = promenadePoint(x);
    prom.push({ x: p.x, y: p.y + 2.3, z: p.z, r: 3.8 });
  }
  const hops: Ring[] = HOPS.map((h) => ({
    x: h.x,
    y: terrainHeight(h.x, h.z) + h.h + 1.8,
    z: h.z,
    r: 3.2,
  }));
  hops.push({ x: zig.x, y: zig.y + 1.5, z: zig.z, r: 3.4 });
  return [
    {
      id: 'salt',
      name: 'Salt Dash',
      blurb: 'Sprint the promenade. Rings sit at head height — wings optional, feet are faster.',
      rings: prom,
    },
    {
      id: 'lantern',
      name: 'Lantern Hop',
      blurb: 'Jump the market roofs and finish on the ziggurat.',
      rings: hops,
    },
    {
      id: 'harbor',
      name: 'Harbor Reach',
      blurb: 'Leave the crane and thread the bay to the breakwater light.',
      rings: [
        { x: crane.x, y: crane.y + 2, z: crane.z, r: 6 },
        { x: -180, y: 32, z: 150, r: 9 },
        { x: -70, y: 28, z: 188, r: 9 },
        { x: 60, y: 30, z: 210, r: 10 },
        { x: 200, y: 26, z: 250, r: 10 },
        { x: light.x, y: light.y + 2, z: light.z, r: 7 },
      ],
    },
    {
      id: 'slalom',
      name: 'Spire Slalom',
      blurb: 'Weave the glass. The last ring sits in the lee thermal.',
      rings: [
        { x: 40, y: 32, z: 24, r: 8 },
        { x: spire.x, y: 48, z: spire.z, r: 8 },
        { x: 150, y: 42, z: 24, r: 8 },
        { x: 70, y: 64, z: -30, r: 9 },
        { x: 142, y: 88, z: 10, r: 10 },
      ],
    },
    {
      id: 'crownline',
      name: 'Crown Line',
      blurb: 'One clean glide from the observatory to the Salt Arch.',
      rings: [
        { x: crown.x, y: crown.y + 2, z: crown.z, r: 8 },
        { x: 16, y: 70, z: -230, r: 11 },
        { x: -8, y: 46, z: -120, r: 11 },
        { x: 12, y: 28, z: -10, r: 10 },
        { x: arch.x, y: arch.y + 4, z: arch.z, r: 7 },
      ],
    },
    {
      id: 'circuit',
      name: 'Thermal Circuit',
      blurb: 'The high ring will not come to you. Circle the Crown thermal until it does.',
      rings: [
        { x: 8, y: 28, z: 52, r: 10 },
        { x: 8, y: 62, z: 52, r: 11 },
        { x: 142, y: 70, z: 10, r: 11 },
        { x: 38, y: 90, z: -248, r: 12 },
        { x: 38, y: 140, z: -248, r: 13 },
        { x: crown.x, y: crown.y + 6, z: crown.z, r: 9 },
      ],
    },
  ];
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
