import { clamp, damp, dampAngle } from './util';

export type FrameInput = {
  forward: number;
  strafe: number;
  pull: number;
  roll: number;
  jumpPressed: boolean;
  glidePressed: boolean;
  sprint: boolean;
  flare: boolean;
  mouseX: number;
  mouseY: number;
  camYaw: number;
  camPitch: number;
  codexPressed: boolean;
  mapPressed: boolean;
  timePressed: boolean;
  resetTrial: boolean;
};

export class Input {
  keys = new Set<string>();
  camYaw = 0;
  camPitch = 0.42;
  sens = 0.00215;
  invert = false;
  locked = false;
  private mouseX = 0;
  private mouseY = 0;
  private just = new Set<string>();
  escapePressed = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.just.add(e.code);
      if (e.code === 'Escape') this.escapePressed = true;
      if (this.shouldBlock(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas || (e.buttons & 1 && this.locked === false && e.movementX)) {
        if (document.pointerLockElement === this.canvas || e.buttons & 1) {
          this.mouseX += e.movementX;
          this.mouseY += e.movementY;
        }
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  pressVirtual(code: string, down: boolean) {
    if (down) {
      if (!this.keys.has(code)) this.just.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  private down(code: string): boolean {
    return this.keys.has(code);
  }

  private edge(code: string): boolean {
    return this.just.has(code);
  }

  sample(gliding: boolean, dt: number, heading: number): FrameInput {
    const my = this.mouseY * (this.invert ? -1 : 1);
    if (!gliding) {
      this.camYaw -= this.mouseX * this.sens;
      this.camPitch = clamp(this.camPitch + my * this.sens, 0.14, 1.22);
      if (this.down('KeyQ')) this.camYaw += 1.8 * dt;
      if (this.down('KeyE')) this.camYaw -= 1.8 * dt;
    } else {
      this.camYaw = dampAngle(this.camYaw, heading, 5.5, dt);
      this.camPitch = damp(this.camPitch, 0.32, 2.6, dt);
    }

    let forward = 0;
    let strafe = 0;
    let pull = 0;
    let roll = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) forward += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) forward -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) strafe += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) strafe -= 1;
    if (gliding) {
      // Stick forward (W / mouse up) noses down. Pulling back climbs.
      pull = -forward;
      roll = strafe;
      if (this.down('Space')) pull += 0.85;
    }
    const len = Math.hypot(forward, strafe);
    if (!gliding && len > 1) {
      forward /= len;
      strafe /= len;
    }

    const frame: FrameInput = {
      forward: gliding ? 0 : forward,
      strafe: gliding ? 0 : strafe,
      pull,
      roll,
      jumpPressed: !gliding && (this.edge('Space') || this.edge('TouchJump')),
      glidePressed: this.edge('KeyG') || this.edge('TouchGlide'),
      sprint: this.down('ShiftLeft') || this.down('ShiftRight'),
      flare: gliding && this.down('Space'),
      mouseX: gliding ? this.mouseX : 0,
      mouseY: gliding ? my : 0,
      camYaw: this.camYaw,
      camPitch: this.camPitch,
      codexPressed: this.edge('KeyC'),
      mapPressed: this.edge('KeyM'),
      timePressed: this.edge('KeyN'),
      resetTrial: this.edge('KeyR'),
    };
    this.mouseX = 0;
    this.mouseY = 0;
    this.just.clear();
    return frame;
  }

  private shouldBlock(code: string): boolean {
    return ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
  }
}
