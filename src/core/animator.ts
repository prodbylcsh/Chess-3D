export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inExpo: (t: number) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  inBack: (t: number) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
} satisfies Record<string, Ease>;

interface Tween {
  elapsed: number;
  duration: number;
  ease: Ease;
  fn: (k: number, raw: number) => void;
  resolve: () => void;
}

/** Return `false` to unregister. */
export type FrameFn = (dt: number, time: number) => boolean | void;

interface BulletTime {
  elapsed: number;
  min: number;
  attack: number;
  hold: number;
  release: number;
}

/**
 * A single game clock for every tween, effect and simulation, so slow motion
 * ("bullet time" on impacts) affects everything consistently.
 */
export class Animator {
  timeScale = 1;
  time = 0;
  private tweens: Tween[] = [];
  private frameFns: FrameFn[] = [];
  private bullet: BulletTime | null = null;

  update(realDt: number): void {
    this.updateBulletTime(realDt);
    const dt = realDt * this.timeScale;
    this.time += dt;

    for (const tw of this.tweens.slice()) {
      tw.elapsed += dt;
      const raw = Math.min(1, tw.elapsed / tw.duration);
      tw.fn(tw.ease(raw), raw);
      if (raw >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }

    for (const fn of this.frameFns.slice()) {
      if (fn(dt, this.time) === false) this.removeFrame(fn);
    }
  }

  tween(duration: number, fn: (k: number, raw: number) => void, easing: Ease = ease.inOutCubic): Promise<void> {
    if (duration <= 0) {
      fn(1, 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tweens.push({ elapsed: 0, duration, ease: easing, fn, resolve });
    });
  }

  wait(seconds: number): Promise<void> {
    return this.tween(seconds, () => {}, ease.linear);
  }

  onFrame(fn: FrameFn): () => void {
    this.frameFns.push(fn);
    return () => this.removeFrame(fn);
  }

  /** Dip into slow motion and smoothly recover. Times are in real seconds. */
  bulletTime(min = 0.2, hold = 0.35, release = 0.6, attack = 0.05): void {
    this.bullet = { elapsed: 0, min, attack, hold, release };
  }

  private removeFrame(fn: FrameFn): void {
    const i = this.frameFns.indexOf(fn);
    if (i >= 0) this.frameFns.splice(i, 1);
  }

  private updateBulletTime(realDt: number): void {
    const b = this.bullet;
    if (!b) return;
    b.elapsed += realDt;
    const { elapsed: e, attack, hold, release, min } = b;
    if (e < attack) {
      this.timeScale = 1 + (min - 1) * (e / attack);
    } else if (e < attack + hold) {
      this.timeScale = min;
    } else if (e < attack + hold + release) {
      const k = ease.inOutSine((e - attack - hold) / release);
      this.timeScale = min + (1 - min) * k;
    } else {
      this.timeScale = 1;
      this.bullet = null;
    }
  }
}

export const animator = new Animator();

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
