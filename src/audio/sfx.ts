/**
 * Tiny procedural sound kit (Web Audio) — no audio files needed.
 * The context is created lazily on the first user gesture (autoplay policy).
 */
class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private get ready(): AudioContext | null {
    return this.muted || !this.ctx || this.ctx.state !== 'running' ? null : this.ctx;
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private env(ctx: AudioContext, peak: number, attack: number, decay: number, at = 0): GainNode {
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Stone grinding across stone. */
  slide(duration = 0.5): void {
    const ctx = this.ready;
    if (!ctx) return;
    const src = this.noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.06);
    g.gain.setValueAtTime(0.18, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  /** Heavy piece landing. */
  thud(strength = 1): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    osc.connect(this.env(ctx, 0.7 * strength, 0.005, 0.3)).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.4);

    const src = this.noiseSource(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    src.connect(lp).connect(this.env(ctx, 0.35 * strength, 0.002, 0.12)).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + 0.2);
  }

  whoosh(duration = 0.35): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + duration);
    src.connect(bp).connect(this.env(ctx, 0.35, duration * 0.6, duration * 0.5)).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + duration * 1.2);
  }

  /** Stone exploding: boom + crackle of debris. */
  shatter(): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    const boom = ctx.createOscillator();
    boom.frequency.setValueAtTime(90, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    boom.connect(this.env(ctx, 0.9, 0.004, 0.7)).connect(this.master!);
    boom.start(t);
    boom.stop(t + 0.8);

    const src = this.noiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    src.connect(hp).connect(this.env(ctx, 0.6, 0.002, 0.45)).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + 0.6);

    // falling debris clicks
    for (let i = 0; i < 14; i++) {
      const at = 0.25 + Math.random() * 1.1;
      const c = this.noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500 + Math.random() * 3500;
      bp.Q.value = 4;
      c.connect(bp).connect(this.env(ctx, 0.25 * Math.random() + 0.05, 0.001, 0.05, at)).connect(this.master!);
      c.start(t + at, Math.random());
      c.stop(t + at + 0.08);
    }
  }

  /** Shimmering spell charge. */
  magic(duration = 0.8, base = 520): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    [1, 1.25, 1.5, 2, 2.5].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(base * m, t);
      o.frequency.exponentialRampToValueAtTime(base * m * 1.5, t + duration);
      o.detune.value = (Math.random() - 0.5) * 20;
      o.connect(this.env(ctx, 0.06, duration * 0.5, duration * 0.6, i * 0.05)).connect(this.master!);
      o.start(t + i * 0.05);
      o.stop(t + duration * 1.3 + i * 0.05);
    });
  }

  zap(): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    o.connect(lp).connect(this.env(ctx, 0.18, 0.005, 0.3)).connect(this.master!);
    o.start(t);
    o.stop(t + 0.4);
  }

  select(): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.08);
    o.connect(this.env(ctx, 0.08, 0.005, 0.15)).connect(this.master!);
    o.start(t);
    o.stop(t + 0.2);
  }

  check(): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    [220, 233].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      o.connect(lp).connect(this.env(ctx, 0.12, 0.02, 0.7)).connect(this.master!);
      o.start(t);
      o.stop(t + 0.8);
    });
  }

  fanfare(): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 523, 659, 784].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(this.env(ctx, 0.15, 0.01, 0.9, i * 0.14)).connect(this.master!);
      o.start(t + i * 0.14);
      o.stop(t + i * 0.14 + 1.0);
    });
  }
}

export const sfx = new Sfx();
