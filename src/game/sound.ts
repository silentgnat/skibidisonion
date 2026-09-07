export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volumePct = 100;
  private drawSrc: AudioBufferSourceNode | null = null;
  private drawGain: GainNode | null = null;

  ensure(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.gain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  get volume(): number {
    return this.volumePct;
  }

  setVolume(pct: number): void {
    this.volumePct = pct;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.gain(), this.ctx.currentTime, 0.01);
    }
  }

  private gain(): number {
    return (0.5 * this.volumePct) / 100;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopDraw();
    }
    return this.enabled;
  }

  get muted(): boolean {
    return !this.enabled;
  }

  private osc(
    type: OscillatorType,
    freq: number,
    endFreq: number,
    start: number,
    dur: number,
    vol: number,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq !== freq) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + dur);
    }
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, vol: number, filterFreq: number, filterEnd: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, start);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, filterEnd), start + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(start);
  }

  kill(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.25, 0.6, 2000, 200);
    this.osc('sine', 160, 40, t, 0.3, 0.5);
    this.osc('square', 700, 300, t, 0.08, 0.12);
  }

  bounce(strength: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = Math.min(0.25, 0.05 + strength * 0.002);
    this.osc('sine', 120, 80, t, 0.08, vol);
  }

  buy(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc('sine', 660, 660, t, 0.07, 0.2);
    this.osc('sine', 880, 880, t + 0.07, 0.09, 0.2);
  }

  deny(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc('square', 130, 90, t, 0.15, 0.15);
  }

  respawn(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc('sine', 320, 480, t, 0.08, 0.12);
  }

  border(strength: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = Math.min(0.3, 0.1 + strength * 0.001);
    this.noise(t, 0.12, vol, 600, 150);
    this.osc('sine', 90, 45, t, 0.12, vol);
  }

  startDraw(): void {
    if (!this.ctx || !this.master || !this.enabled || this.drawSrc) return;
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.04, this.ctx.currentTime + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    this.drawSrc = src;
    this.drawGain = g;
  }

  stopDraw(): void {
    if (!this.ctx || !this.drawGain || !this.drawSrc) return;
    const t = this.ctx.currentTime;
    this.drawGain.gain.cancelScheduledValues(t);
    this.drawGain.gain.setValueAtTime(this.drawGain.gain.value, t);
    this.drawGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    this.drawSrc.stop(t + 0.1);
    this.drawSrc = null;
    this.drawGain = null;
  }
}