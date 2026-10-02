import { stepFlight, type FlightState } from '../src/game/flight';

function run(
  label: string,
  s: FlightState,
  seconds: number,
  wind = { x: 1.2, y: 0, z: -2.4 },
  holdAoa: number | null = null,
) {
  const dt = 1 / 60;
  let minY = s.y;
  let maxY = s.y;
  let maxS = 0;
  const x0 = s.x;
  const z0 = s.z;
  for (let t = 0; t < seconds; t += dt) {
    if (holdAoa !== null) s.aoa = holdAoa;
    else s.aoa += (0.04 - s.aoa) * (1 - Math.exp(-0.8 * dt));
    stepFlight(s, dt, wind, 0, false);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
    maxS = Math.max(maxS, Math.hypot(s.vx, s.vy, s.vz));
    if (s.y < 1) break;
  }
  const dist = Math.hypot(s.x - x0, s.z - z0);
  console.log(
    label,
    `end y=${s.y.toFixed(1)} dist=${dist.toFixed(0)} maxS=${maxS.toFixed(1)} minY=${minY.toFixed(1)} maxY=${maxY.toFixed(1)} vy=${s.vy.toFixed(2)} pitch=${s.pitch.toFixed(2)}`,
  );
}

const base = (): FlightState => ({
  x: 0, y: 90, z: 0,
  vx: Math.sin(0) * 18, vy: -1.2, vz: -Math.cos(0) * 18,
  heading: 0, aoa: 0.04, pitch: -0.08, bank: 0,
});

run('hands off 90m', base(), 90);
run('dive hold', { ...base(), y: 180, vy: -1 }, 16, { x: 0, y: 0, z: 0 }, -0.36);
run('climb', { ...base(), y: 50, vx: 0, vy: 0, vz: -18 }, 8, { x: 0, y: 0, z: 0 }, 0.2);
run('stall', { ...base(), y: 50 }, 8, { x: 0, y: 0, z: 0 }, 0.55);
run('thermal', { ...base(), y: 40 }, 16, { x: 0.3, y: 7.2, z: -0.4 }, 0.06);

const turn = { ...base(), y: 60 };
const dt = 1 / 60;
for (let i = 0; i < 60 * 8; i++) {
  turn.bank = 0.75;
  stepFlight(turn, dt, { x: 0, y: 0, z: 0 }, 0, true);
}
console.log('banked 8s', `pos ${turn.x.toFixed(0)},${turn.y.toFixed(0)},${turn.z.toFixed(0)} hdg ${(turn.heading * 180 / Math.PI).toFixed(0)} spd ${Math.hypot(turn.vx, turn.vy, turn.vz).toFixed(1)}`);
