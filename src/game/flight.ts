import { clamp, smoothstep } from './util';

/**
 * Hang-glider forces.
 * Lift/drag ratio is about 11:1, so a leap from Crown Hill crosses the bay,
 * and thermals (updraft wind) are how you climb back.
 */
export const FLIGHT = {
  lift: 0.04,
  drag: 0.0044,
  gravity: 9.81,
  maxBank: 1.08,
  minSpeedTurn: 9,
  trimAoa: 0.04,
};

export type Vec3 = { x: number; y: number; z: number };

export type FlightState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  /** Nose relative to the flight path. Positive pulls up. */
  aoa: number;
  pitch: number;
  bank: number;
};

export type FlightBasis = {
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  upX: number;
  upY: number;
  upZ: number;
  rightX: number;
  rightY: number;
  rightZ: number;
  airSpeed: number;
  aoa: number;
};

export function flightBasis(s: FlightState, wind: Vec3): FlightBasis {
  const sh = Math.sin(s.heading);
  const ch = Math.cos(s.heading);
  const sp = Math.sin(s.pitch);
  const cp = Math.cos(s.pitch);
  const sb = Math.sin(s.bank);
  const cb = Math.cos(s.bank);

  const fwdX = sh * cp;
  const fwdY = sp;
  const fwdZ = -ch * cp;

  const ux0 = -sh * sp;
  const uy0 = cp;
  const uz0 = ch * sp;

  const rx0 = fwdY * uz0 - fwdZ * uy0;
  const ry0 = fwdZ * ux0 - fwdX * uz0;
  const rz0 = fwdX * uy0 - fwdY * ux0;

  const upX = ux0 * cb + rx0 * sb;
  const upY = uy0 * cb + ry0 * sb;
  const upZ = uz0 * cb + rz0 * sb;

  const rightX = fwdY * upZ - fwdZ * upY;
  const rightY = fwdZ * upX - fwdX * upZ;
  const rightZ = fwdX * upY - fwdY * upX;

  const ax = s.vx - wind.x;
  const ay = s.vy - wind.y;
  const az = s.vz - wind.z;
  const airSpeed = Math.hypot(ax, ay, az);
  let aoa = 0;
  if (airSpeed > 0.2) {
    const align = (fwdX * ax + fwdY * ay + fwdZ * az) / airSpeed;
    aoa = Math.acos(clamp(align, -1, 1));
  }
  return { fwdX, fwdY, fwdZ, upX, upY, upZ, rightX, rightY, rightZ, airSpeed, aoa };
}

export function stepFlight(
  s: FlightState,
  dt: number,
  wind: Vec3,
  rollDelta: number,
  rollHeld: boolean,
): FlightBasis {
  s.aoa = clamp(s.aoa, -0.42, 0.62);
  s.bank = clamp(s.bank + rollDelta, -FLIGHT.maxBank, FLIGHT.maxBank);
  if (!rollHeld) s.bank *= Math.exp(-1.35 * dt);

  const horiz = Math.hypot(s.vx, s.vz);
  const velPitch = Math.atan2(s.vy, Math.max(horiz, 1.2));
  s.pitch = clamp(velPitch + s.aoa, -1.25, 1.15);

  const speed = Math.hypot(s.vx, s.vy, s.vz);
  const turn = (FLIGHT.gravity * Math.tan(s.bank)) / Math.max(speed, FLIGHT.minSpeedTurn);
  s.heading += turn * dt;

  const b = flightBasis(s, wind);
  const ax = s.vx - wind.x;
  const ay = s.vy - wind.y;
  const az = s.vz - wind.z;
  const as = b.airSpeed;

  if (as < 0.4) {
    s.vy -= FLIGHT.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    return b;
  }

  const inv = 1 / as;
  const adx = ax * inv;
  const ady = ay * inv;
  const adz = az * inv;
  const stall = smoothstep(0.36, 0.7, s.aoa);
  const slow = as < 7.5 ? as / 7.5 : 1;
  const cl = clamp(1 + s.aoa * 3.1, 0.05, 2.5) * (1 - stall) * slow;
  const liftMag = FLIGHT.lift * as * as * cl;

  let lx = b.upX;
  let ly = b.upY;
  let lz = b.upZ;
  const along = lx * adx + ly * ady + lz * adz;
  lx -= adx * along;
  ly -= ady * along;
  lz -= adz * along;
  const ll = Math.hypot(lx, ly, lz) || 1;
  lx /= ll;
  ly /= ll;
  lz /= ll;

  const cd = 1 + Math.max(0, s.aoa) * 2.6 + s.aoa * s.aoa * 1.5 + stall * 3.4;
  const dragMag = FLIGHT.drag * as * as * cd;

  s.vx += (lx * liftMag - adx * dragMag) * dt;
  s.vy += (ly * liftMag - ady * dragMag) * dt;
  s.vz += (lz * liftMag - adz * dragMag) * dt;
  s.vy -= FLIGHT.gravity * dt;

  const slip = ax * b.rightX + ay * b.rightY + az * b.rightZ;
  const slipK = Math.min(1, 3.4 * dt);
  s.vx -= b.rightX * slip * slipK;
  s.vy -= b.rightY * slip * slipK;
  s.vz -= b.rightZ * slip * slipK;

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  return b;
}
