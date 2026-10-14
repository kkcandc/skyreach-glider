import { clamp } from './util';

type Streak = {
  ang: number;
  len: number;
  width: number;
  phase: number;
  alpha: number;
};

/**
 * Screen-space speed lines. They stay quiet in a cruise and stretch
 * when the wing is fast or the nose is down.
 */
export class SpeedLines {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private streaks: Streak[];
  private visible = false;

  constructor() {
    const existing = document.getElementById('streaks') as HTMLCanvasElement | null;
    this.canvas = existing ?? document.createElement('canvas');
    if (!existing) {
      this.canvas.id = 'streaks';
      document.body.appendChild(this.canvas);
    }
    this.ctx = this.canvas.getContext('2d');
    this.streaks = Array.from({ length: 22 }, (_, i) => {
      const band = i / 22;
      return {
        ang: band * Math.PI * 2 + (i % 3) * 0.07,
        len: 0.35 + ((i * 17) % 10) / 14,
        width: i % 5 === 0 ? 1.7 : 1,
        phase: (i * 0.37) % 1,
        alpha: 0.35 + (i % 4) * 0.12,
      };
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const dpr = 1;
    this.canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  }

  update(dt: number, airSpeed: number, vy: number, gliding: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const fast = clamp((airSpeed - 16) / 18, 0, 1);
    const dive = clamp(-vy / 7.5, 0, 1);
    const intensity = gliding ? clamp(dive * 0.92 + Math.max(0, fast - 0.35) * 0.5, 0, 1) : 0;
    if (intensity < 0.22) {
      if (this.visible) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.visible = false;
      }
      return;
    }
    this.visible = true;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.56;
    const squash = 0.62;
    ctx.lineCap = 'round';
    const flow = dt * (1.1 + airSpeed * 0.08 + dive * 1.4);
    for (const s of this.streaks) {
      s.phase = (s.phase + flow * (0.55 + s.len)) % 1;
      const travel = s.phase;
      const inner = (46 + travel * 210) * (w / 1280);
      const len = (28 + s.len * 240 * (0.35 + intensity)) * (w / 1280);
      const a = s.alpha * intensity * (0.45 + travel);
      ctx.strokeStyle = `rgba(255, 236, 214, ${a.toFixed(3)})`;
      ctx.lineWidth = s.width * (w / 1280) * (0.8 + dive * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(s.ang) * inner, cy + Math.sin(s.ang) * inner * squash);
      ctx.lineTo(cx + Math.cos(s.ang) * (inner + len), cy + Math.sin(s.ang) * (inner + len) * squash);
      ctx.stroke();
    }
  }
}
