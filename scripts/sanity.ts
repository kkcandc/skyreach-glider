import { isWater, shoreZ, terrainHeight } from '../src/game/terrain';

const samples = [-400, -250, -155, -80, 0, 92, 230, 340, 420];
for (const x of samples) {
  const sz = shoreZ(x);
  console.log(
    `x=${x} shore=${sz.toFixed(1)} h(shore-12)=${terrainHeight(x, sz - 12).toFixed(2)} waterAt+20=${isWater(x, sz + 20)}`,
  );
}

console.log('crown-272', terrainHeight(0, -272).toFixed(2));
console.log('crown-330', terrainHeight(0, -330).toFixed(2));
console.log('crown-350', terrainHeight(0, -350).toFixed(2));
console.log('plaza', terrainHeight(0, 42).toFixed(2));
console.log('promenade', terrainHeight(-30, shoreZ(-30) - 10).toFixed(2), 'z', (shoreZ(-30) - 10).toFixed(1));
console.log('radio', terrainHeight(-348, -128).toFixed(2));
console.log('spire', terrainHeight(92, -18).toFixed(2));
console.log('market', terrainHeight(-164, 6).toFixed(2));
console.log('terraces', terrainHeight(188, -84).toFixed(2));
console.log('harbor mouth', terrainHeight(-150, 156).toFixed(2), 'water', isWater(-150, 156), 'shore', shoreZ(-150).toFixed(1));
console.log('bridge ends', 'W', isWater(-270, 156), shoreZ(-270).toFixed(1), 'E', isWater(-40, 156), shoreZ(-40).toFixed(1));
console.log('light', isWater(328, 330), 'shore', shoreZ(328).toFixed(1), 'h', terrainHeight(328, shoreZ(328) - 12).toFixed(2));

let minH = 99;
let maxH = -99;
for (let z = -350; z <= 200; z += 10) {
  const h = terrainHeight(0, z);
  minH = Math.min(minH, h);
  maxH = Math.max(maxH, h);
}
console.log('grand road range', minH.toFixed(1), maxH.toFixed(1));
