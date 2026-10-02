import { Vector3 } from 'three';
import { CollisionWorld } from './collision';
import { flightBasis, stepFlight, type FlightState, type Vec3 } from './flight';
import type { FrameInput } from './input';
import { WORLD, isWater } from './terrain';
import { clamp, dampAngle } from './util';

const WALK = 6.5;
const SPRINT = 11.6;
const GRAVITY = 27;
const JUMP = 9.55;
const HEIGHT = 1.72;
const RADIUS = 0.4;
const STEP = 0.95;

export type MoveEvent = 'splash' | 'land' | 'hard' | 'launch' | 'stow' | 'need-air';

export class Player {
  pos = new Vector3();
  vel = new Vector3();
  heading = 0;
  aoa = 0.04;
  pitch = 0;
  bank = 0;
  grounded = true;
  gliding = false;
  deploy = 0;
  coyote = 0;
  jumpBuffer = 0;
  walkPhase = 0;
  stumble = 0;
  lastSafe = new Vector3();
  private safeT = 1;
  flown = 0;
  walked = 0;
  maxAlt = 0;
  maxSpeed = 0;
  launches = 0;
  landings = 0;
  airSpeed = 0;

  spawn(x: number, y: number, z: number, heading = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.aoa = 0.04;
    this.pitch = 0;
    this.bank = 0;
    this.grounded = true;
    this.gliding = false;
    this.deploy = 0;
    this.lastSafe.copy(this.pos);
    this.safeT = 1;
  }

  /** Drop into a glide, used by the Crown entrance. */
  launchAir(x: number, y: number, z: number, heading: number) {
    this.pos.set(x, y, z);
    this.heading = heading;
    this.aoa = 0.02;
    this.bank = 0;
    const spd = 18;
    this.vel.set(Math.sin(heading) * spd, -0.8, -Math.cos(heading) * spd);
    this.gliding = true;
    this.deploy = 1;
    this.grounded = false;
    this.launches++;
    this.lastSafe.set(x, Math.max(8, y - 30), z);
  }

  update(dt: number, input: FrameInput, world: CollisionWorld, wind: Vec3, sens: number): MoveEvent | null {
    let event: MoveEvent | null = null;
    if (input.glidePressed) event = this.toggleGlide(input.camYaw);
    if (input.jumpPressed) this.jumpBuffer = 0.14;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.gliding) event = this.updateGlide(dt, input, world, wind, sens) ?? event;
    else this.updateWalk(dt, input, world);

    this.deploy = clamp(this.deploy + (this.gliding ? 3.2 : -3.4) * dt, 0, 1);
    const speed = this.vel.length();
    this.maxSpeed = Math.max(this.maxSpeed, speed);
    this.maxAlt = Math.max(this.maxAlt, this.pos.y);
    if (this.gliding) this.flown += Math.hypot(this.vel.x, this.vel.z) * dt;
    else if (this.grounded) this.walked += Math.hypot(this.vel.x, this.vel.z) * dt;

    this.contain();
    if (this.pos.y < 0.45 && isWater(this.pos.x, this.pos.z)) {
      this.splash();
      return 'splash';
    }
    if (this.grounded && this.pos.y > 0.6 && !isWater(this.pos.x, this.pos.z)) {
      this.safeT += dt;
      if (this.safeT > 0.28) this.lastSafe.copy(this.pos);
    } else if (!this.grounded) {
      /* keep the last safe point */
    } else {
      this.safeT = 0;
    }
    if (this.stumble > 0) this.stumble -= dt;
    return event;
  }

  private toggleGlide(camYaw: number): MoveEvent | null {
    if (this.gliding) {
      this.gliding = false;
      this.grounded = false;
      return 'stow';
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const dropping = !this.grounded;
    const high = this.pos.y > 9;
    const running = this.grounded && hs > 6;
    if (!dropping && !high && !running) return 'need-air';
    this.heading = camYaw;
    this.gliding = true;
    this.grounded = false;
    this.aoa = 0.02;
    this.bank *= 0.2;
    const spd = Math.max(16.5, hs + (running ? 5 : 2));
    this.vel.x = Math.sin(this.heading) * spd;
    this.vel.z = -Math.cos(this.heading) * spd;
    this.vel.y = Math.max(this.vel.y, dropping ? 1.2 : 3.6);
    this.launches++;
    return 'launch';
  }

  private updateWalk(dt: number, input: FrameInput, world: CollisionWorld) {
    const lookX = Math.sin(input.camYaw);
    const lookZ = -Math.cos(input.camYaw);
    const rightX = Math.cos(input.camYaw);
    const rightZ = Math.sin(input.camYaw);
    let f = input.forward;
    let s = input.strafe;
    if (this.stumble > 0) {
      f = 0;
      s = 0;
    }
    const wishX = lookX * f + rightX * s;
    const wishZ = lookZ * f + rightZ * s;
    const speed = input.sprint ? SPRINT : WALK;
    const rate = this.grounded ? 12 : 2.4;
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (wishX * speed - this.vel.x) * k;
    this.vel.z += (wishZ * speed - this.vel.z) * k;

    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vel.y = JUMP;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    const wasGround = this.grounded;
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.35));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (!this.grounded) this.vel.y -= GRAVITY * h;
      const prevX = this.pos.x;
      const prevZ = this.pos.z;
      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;
      if (!this.grounded) this.pos.y += this.vel.y * h;
      const movedX = this.pos.x;
      const movedZ = this.pos.z;
      const pushed = world.resolve(this.pos.x, this.pos.z, this.pos.y, HEIGHT, RADIUS);
      this.killWall(movedX, movedZ, pushed.x, pushed.z);
      this.pos.x = pushed.x;
      this.pos.z = pushed.z;
      const support = world.support(this.pos.x, this.pos.z, this.pos.y);
      if (support > this.pos.y + STEP && this.vel.y <= 0.01) {
        this.pos.x = prevX;
        this.pos.z = prevZ;
        this.vel.x *= 0.15;
        this.vel.z *= 0.15;
      } else {
        const dy = this.pos.y - support;
        const near = dy <= Math.max(STEP, -this.vel.y * h + 0.28) && dy >= -STEP;
        if (this.vel.y <= 0.6 && near && support > -20) {
          this.pos.y = support;
          this.vel.y = 0;
          this.grounded = true;
        } else {
          this.grounded = false;
        }
      }
    }
    if (wasGround && !this.grounded) this.coyote = 0.14;
    else this.coyote = Math.max(0, this.coyote - dt);

    const moving = Math.hypot(wishX, wishZ) > 0.2 && Math.hypot(this.vel.x, this.vel.z) > 0.7;
    if (moving) {
      const face = Math.atan2(this.vel.x, -this.vel.z);
      this.heading = dampAngle(this.heading, face, 12, dt);
      this.walkPhase += Math.hypot(this.vel.x, this.vel.z) * dt * 1.55;
    }
    this.pitch = 0;
    this.bank = 0;
    this.airSpeed = 0;
  }

  private updateGlide(dt: number, input: FrameInput, world: CollisionWorld, wind: Vec3, sens: number): MoveEvent | null {
    const mousePull = input.mouseY * sens * 1.55;
    const mouseRoll = input.mouseX * sens * 1.85;
    this.aoa += mousePull + input.pull * 0.95 * dt;
    const stick = Math.abs(input.pull) > 0.15 || Math.abs(input.mouseY) > 0.5;
    if (!stick) this.aoa += (0.045 - this.aoa) * (1 - Math.exp(-0.85 * dt));
    this.aoa = clamp(this.aoa, -0.42, 0.6);
    this.bank += mouseRoll + input.roll * 1.85 * dt;
    this.bank = clamp(this.bank, -1.08, 1.08);
    const rollHeld = Math.abs(input.roll) > 0.2 || Math.abs(input.mouseX) > 0.5;

    const speed = Math.max(6, this.vel.length());
    const steps = clamp(Math.ceil((speed * dt) / 0.42), 1, 8);
    const h = dt / steps;
    let landed: MoveEvent | null = null;
    for (let i = 0; i < steps; i++) {
      const result = this.glideSub(h, wind, rollHeld && i === 0, world);
      if (result === 'splash') return 'splash';
      if (result === 'land' || result === 'hard') {
        landed = result;
        break;
      }
    }
    const basis = flightBasis(
      {
        x: this.pos.x,
        y: this.pos.y,
        z: this.pos.z,
        vx: this.vel.x,
        vy: this.vel.y,
        vz: this.vel.z,
        heading: this.heading,
        aoa: this.aoa,
        pitch: this.pitch,
        bank: this.bank,
      },
      wind,
    );
    this.airSpeed = basis.airSpeed;
    return landed;
  }

  private glideSub(h: number, wind: Vec3, rollHeld: boolean, world: CollisionWorld): MoveEvent | 'ok' {
    const s: FlightState = {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      vx: this.vel.x,
      vy: this.vel.y,
      vz: this.vel.z,
      heading: this.heading,
      aoa: this.aoa,
      pitch: this.pitch,
      bank: this.bank,
    };
    stepFlight(s, h, wind, 0, rollHeld);
    this.heading = s.heading;
    this.pitch = s.pitch;
    this.bank = s.bank;
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.set(s.x, s.y, s.z);
    this.vel.set(s.vx, s.vy, s.vz);
    const movedX = this.pos.x;
    const movedZ = this.pos.z;
    const pushed = world.resolve(this.pos.x, this.pos.z, this.pos.y, 1.2, 0.36);
    this.killWall(movedX, movedZ, pushed.x, pushed.z);
    this.pos.x = pushed.x;
    this.pos.z = pushed.z;
    if (this.pos.y < 0.5 && isWater(this.pos.x, this.pos.z)) {
      this.splash();
      return 'splash';
    }
    const support = world.support(this.pos.x, this.pos.z, this.pos.y);
    if (support > this.pos.y + 0.75 && this.vel.y <= 0) {
      this.pos.x = prevX;
      this.pos.z = prevZ;
      this.vel.x *= 0.5;
      this.vel.z *= 0.5;
      return 'ok';
    }
    const dy = this.pos.y - support;
    const maxDrop = Math.max(0.75, -this.vel.y * h + 0.35);
    if (this.vel.y <= 0.4 && dy <= maxDrop && dy >= -0.4 && support > -20) {
      this.pos.y = support;
      const sink = -this.vel.y;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.gliding = false;
      this.grounded = true;
      this.landings++;
      this.vel.y = 0;
      if (sink > 12 || hs > 33) {
        this.vel.x *= 0.08;
        this.vel.z *= 0.08;
        this.stumble = 0.42;
        return 'hard';
      }
      this.vel.x *= 0.48;
      this.vel.z *= 0.48;
      return 'land';
    }
    this.grounded = false;
    return 'ok';
  }

  private killWall(prevX: number, prevZ: number, x: number, z: number) {
    const cx = x - prevX;
    const cz = z - prevZ;
    const len = Math.hypot(cx, cz);
    if (len < 0.0008) return;
    const nx = cx / len;
    const nz = cz / len;
    const into = this.vel.x * nx + this.vel.z * nz;
    if (into < 0) {
      this.vel.x -= nx * into;
      this.vel.z -= nz * into;
    }
  }

  private splash() {
    this.pos.copy(this.lastSafe);
    this.vel.set(0, 0, 0);
    this.gliding = false;
    this.grounded = true;
    this.bank = 0;
    this.aoa = 0.04;
  }

  private contain() {
    const m = 24;
    if (this.pos.x < WORLD.minX + m) {
      this.pos.x = WORLD.minX + m;
      this.vel.x = Math.abs(this.vel.x) * 0.4;
    }
    if (this.pos.x > WORLD.maxX - m) {
      this.pos.x = WORLD.maxX - m;
      this.vel.x = -Math.abs(this.vel.x) * 0.4;
    }
    if (this.pos.z < WORLD.minZ + m) {
      this.pos.z = WORLD.minZ + m;
      this.vel.z = Math.abs(this.vel.z) * 0.4;
    }
    if (this.pos.z > WORLD.maxZ - m) {
      this.pos.z = WORLD.maxZ - m;
      this.vel.z = -Math.abs(this.vel.z) * 0.4;
    }
    if (this.pos.y > 220) {
      this.pos.y = 220;
      this.vel.y = Math.min(0, this.vel.y);
    }
  }
}
