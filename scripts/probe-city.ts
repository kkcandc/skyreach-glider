import { buildCity } from '../src/game/city';
import { promenadePoint, terrainHeight, isWater, shoreZ } from '../src/game/terrain';
import { BRIDGE_X0, BRIDGE_X1, BRIDGE_Y, BRIDGE_Z, HOPS } from '../src/game/places';
import { Activities } from '../src/game/content';

const t0 = Date.now();
const city = buildCity();
console.log('build ms', Date.now() - t0);
console.log('blocks', city.collision.blocks.length, 'ramps', city.collision.ramps.length);
console.log('roofs', city.roofs.length, 'marks', city.marks.length, 'boats', city.boats.length);
for (const m of city.marks) {
  const inside = city.collision.inside(m.x, m.y + 1.2, m.z);
  const support = city.collision.support(m.x, m.z, m.y + 2);
  console.log(
    `mark ${m.id} xyz ${m.x.toFixed(1)},${m.y.toFixed(1)},${m.z.toFixed(1)} inside=${inside} support=${support.toFixed(1)} dy=${(m.y - support).toFixed(2)}`,
  );
}

const spawn = promenadePoint(-18);
const feet = spawn.y;
const resolved = city.collision.resolve(spawn.x, spawn.z, feet, 1.72, 0.4);
const sup = city.collision.support(resolved.x, resolved.z, feet + 0.2);
console.log('spawn', spawn, 'resolved', resolved, 'support', sup.toFixed(2), 'inside', city.collision.inside(spawn.x, feet + 1, spawn.z));

console.log('bridge mid water', isWater((BRIDGE_X0 + BRIDGE_X1) / 2, BRIDGE_Z), 'shore', shoreZ((BRIDGE_X0 + BRIDGE_X1) / 2).toFixed(1));
console.log('bridge W land', isWater(BRIDGE_X0, BRIDGE_Z), 'h', terrainHeight(BRIDGE_X0, BRIDGE_Z).toFixed(1), 'shore', shoreZ(BRIDGE_X0).toFixed(1));
console.log('bridge E land', isWater(BRIDGE_X1, BRIDGE_Z), 'h', terrainHeight(BRIDGE_X1, BRIDGE_Z).toFixed(1), 'shore', shoreZ(BRIDGE_X1).toFixed(1));

const acts = new Activities(city.roofs, city.marks, city.collision, [], [], {});
console.log('motes', acts.moteTotal, 'trials', acts.trials.length);
for (const t of acts.trials) {
  console.log(' trial', t.id, t.rings.length, t.rings.map((r) => `${r.x.toFixed(0)},${r.y.toFixed(0)},${r.z.toFixed(0)} r${r.r}`).join(' | '));
}

for (const hop of HOPS) {
  const y = terrainHeight(hop.x, hop.z) + hop.h;
  const inside = city.collision.inside(hop.x, y + 1, hop.z);
  console.log('hop', hop.x, hop.z, 'y', y.toFixed(1), 'inside', inside, 'water', isWater(hop.x, hop.z));
}

const crown = city.marks.find((m) => m.id === 'crown')!;
console.log('crown terrain', terrainHeight(0, -332).toFixed(2), 'mark y', crown.y.toFixed(2));
