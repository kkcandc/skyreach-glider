import { buildCity } from '../src/game/city';
import { Player } from '../src/game/player';
import { promenadePoint } from '../src/game/terrain';
import { HOPS } from '../src/game/places';
import { updraftAt, breeze } from '../src/game/content';
import type { FrameInput } from '../src/game/input';

const city = buildCity();
const p = new Player();
const spawn = promenadePoint(-18);
p.spawn(spawn.x, spawn.y, spawn.z, 0);

const frame = (over: Partial<FrameInput>): FrameInput => ({
  forward: 0,
  strafe: 0,
  pull: 0,
  roll: 0,
  jumpPressed: false,
  glidePressed: false,
  sprint: false,
  flare: false,
  mouseX: 0,
  mouseY: 0,
  camYaw: 0,
  camPitch: 0.42,
  codexPressed: false,
  mapPressed: false,
  timePressed: false,
  resetTrial: false,
  ...over,
});

const wind0 = { x: 1.5, y: 0, z: -3 };
let t = 0;
const dt = 1 / 60;
const step = (over: Partial<FrameInput>) => {
  t += dt;
  return p.update(dt, frame(over), city.collision, wind0, 0.00215);
};

// Walk north 4 seconds (heading 0 is -Z, camYaw 0).
let maxSpeed = 0;
for (let i = 0; i < 240; i++) {
  step({ forward: 1, camYaw: 0 });
  maxSpeed = Math.max(maxSpeed, Math.hypot(p.vel.x, p.vel.z));
}
console.log('walk4s', p.pos.x.toFixed(1), p.pos.y.toFixed(2), p.pos.z.toFixed(1), 'spd', maxSpeed.toFixed(2), 'ground', p.grounded, 'walked', p.walked.toFixed(1));

// Sprint jump
p.spawn(spawn.x, spawn.y, spawn.z, 0);
let apex = spawn.y;
for (let i = 0; i < 40; i++) step({ forward: 1, sprint: true, camYaw: 0 });
step({ forward: 1, sprint: true, jumpPressed: true, camYaw: 0 });
for (let i = 0; i < 50; i++) {
  step({ forward: 1, sprint: true, camYaw: 0 });
  apex = Math.max(apex, p.pos.y);
}
console.log('sprint jump apex dy', (apex - spawn.y).toFixed(2), 'ground', p.grounded);

// Hop chain: stand on each roof, jump toward the next, see if we land on it.
for (let h = 0; h < HOPS.length - 1; h++) {
  const a = HOPS[h];
  const b = HOPS[h + 1];
  const ay = city.collision.support(a.x, a.z, 40);
  p.spawn(a.x, ay, a.z, 0);
  const yaw = Math.atan2(b.x - a.x, -(b.z - a.z));
  for (let i = 0; i < 20; i++) step({ forward: 1, sprint: true, camYaw: yaw });
  step({ forward: 1, sprint: true, jumpPressed: true, camYaw: yaw });
  let landed = false;
  let best = 99;
  for (let i = 0; i < 90; i++) {
    step({ forward: 1, sprint: true, camYaw: yaw });
    const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z);
    best = Math.min(best, d);
    const by = city.collision.support(b.x, b.z, 40);
    if (p.grounded && d < b.s * 0.45 && Math.abs(p.pos.y - by) < 0.4) {
      landed = true;
      break;
    }
  }
  console.log(`hop ${h}->${h + 1} landed=${landed} closest=${best.toFixed(2)} y=${p.pos.y.toFixed(1)} waterish=${p.pos.y < 1}`);
}

// Glide from crown
const crown = city.marks.find((m) => m.id === 'crown')!;
p.launchAir(crown.x, crown.y + 1.2, crown.z, Math.PI);
let minY = p.pos.y;
let maxS = 0;
let flew = 0;
for (let i = 0; i < 60 * 90; i++) {
  const w = breeze(t);
  const up = updraftAt(p.pos.x, p.pos.y, p.pos.z);
  w.y = up.up;
  const ev = p.update(dt, frame({ pull: 0, camYaw: p.heading }), city.collision, w, 0.00215);
  t += dt;
  minY = Math.min(minY, p.pos.y);
  maxS = Math.max(maxS, p.airSpeed);
  flew = p.flown;
  if (ev === 'land' || ev === 'hard' || ev === 'splash' || !p.gliding) {
    console.log('glide end', ev, 'at', p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), 'flown', flew.toFixed(0), 'minY', minY.toFixed(1), 'maxS', maxS.toFixed(1));
    break;
  }
  if (i < 8 * 60 && i % 30 === 0) console.log('  glide t', (i / 60).toFixed(1), p.pos.x.toFixed(0), p.pos.y.toFixed(1), p.pos.z.toFixed(0), 'spd', p.airSpeed.toFixed(1), 'hdg', p.heading.toFixed(2), 'bank', p.bank.toFixed(2), 'aoa', p.aoa.toFixed(2));
  else if (i % 600 === 0) console.log('  glide t', (i / 60).toFixed(0), p.pos.x.toFixed(0), p.pos.y.toFixed(1), p.pos.z.toFixed(0), 'spd', p.airSpeed.toFixed(1), 'hdg', p.heading.toFixed(2), 'bank', p.bank.toFixed(2));
  if (i === 60 * 90 - 1) console.log('glide still up', p.pos.y.toFixed(1), 'flown', flew.toFixed(0));
}

// Climb crown stairs: walk toward crown from the road
p.spawn(0, city.collision.support(0, -200, 20), -200, 0);
let stuck = 0;
let prevZ = p.pos.z;
for (let i = 0; i < 60 * 25; i++) {
  step({ forward: 1, sprint: true, camYaw: 0 });
  if (Math.abs(p.pos.z - prevZ) < 0.002) stuck++;
  else stuck = 0;
  prevZ = p.pos.z;
  if (p.pos.z < -320 && p.pos.y > 70) break;
  if (stuck > 40) break;
}
console.log('road climb', p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), 'stuck', stuck);
for (const z of [-352, -346, -340, -336, -334]) {
  console.log(' ramp support', z, city.collision.support(15, z, 120).toFixed(1));
}

// Continue onto the observatory roof.
const crownRoof = city.marks.find((m) => m.id === 'crown')!;
p.spawn(15, city.collision.support(15, -318, 120), -318, 0);
const crownLegs = [
  { x: 15.2, z: -346 },
  { x: 8, z: -346 },
  { x: crownRoof.x, z: crownRoof.z },
];
let ci = 0;
let roof = false;
console.log('crown start', p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1));
for (let i = 0; i < 60 * 25 && ci < crownLegs.length; i++) {
  const goal = crownLegs[ci];
  const yaw = Math.atan2(goal.x - p.pos.x, -(goal.z - p.pos.z));
  step({ forward: 1, sprint: true, camYaw: yaw });
  if (i % 30 === 0) console.log('  c', (i / 60).toFixed(1), p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), 'leg', ci);
  if (Math.hypot(p.pos.x - goal.x, p.pos.z - goal.z) < 1.5) ci++;
  if (Math.hypot(p.pos.x - crownRoof.x, p.pos.z - crownRoof.z) < 2.4 && p.pos.y > crownRoof.y - 1.4) roof = true;
}
console.log('crown roof', roof, 'leg', ci, p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), 'target', crownRoof.y.toFixed(1));

// Clock switchbacks: south up, north up, south onto the roof.
const clock = city.marks.find((m) => m.id === 'clock')!;
p.spawn(clock.x + 8.8, city.collision.support(clock.x + 8.8, clock.z - 34, 80), clock.z - 34, 0);
const legs: { x: number; z: number }[] = [
  { x: clock.x + 8.6, z: clock.z + 15 },
  { x: clock.x + 2, z: clock.z + 8 },
  { x: clock.x, z: clock.z },
];
let clockOk = false;
const crest = { x: clock.x + 8.8, z: clock.z + 14.2 };
for (let i = 0; i < 60 * 20; i++) {
  const goal = p.pos.z > clock.z + 13.6 && p.pos.y > clock.y - 1.5 ? { x: clock.x, z: clock.z + 2 } : crest;
  const yaw = Math.atan2(goal.x - p.pos.x, -(goal.z - p.pos.z));
  step({ forward: 1, sprint: false, camYaw: yaw });
  if (Math.hypot(p.pos.x - clock.x, p.pos.z - clock.z) < 3 && p.pos.y > clock.y - 1.6) clockOk = true;
}
console.log('clock climb', clockOk, p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), 'markY', clock.y.toFixed(1));

const meshes = city.group.children.filter((c) => c.type === 'Mesh').length;
console.log('city meshes', meshes, 'children', city.group.children.length);
