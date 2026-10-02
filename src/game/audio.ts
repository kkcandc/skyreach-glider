export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(filter);
    filter.connect(windGain);
    windGain.connect(master);
    src.start();
    this.ctx = ctx;
    this.master = master;
    this.windGain = windGain;
    this.filter = filter;
  }

  wind(speed: number, gliding: boolean) {
    if (!this.windGain || !this.filter) return;
    const amount = gliding ? Math.min(0.55, speed / 55) : Math.min(0.08, speed / 80);
    this.windGain.gain.setTargetAtTime(amount, this.ctx!.currentTime, 0.08);
    this.filter.frequency.setTargetAtTime(280 + speed * 18, this.ctx!.currentTime, 0.1);
  }

  tone(freq: number, dur = 0.14, type: OscillatorType = 'sine', gain = 0.08) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  chord(freqs: number[]) {
    freqs.forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.05 - i * 0.01));
  }
}
