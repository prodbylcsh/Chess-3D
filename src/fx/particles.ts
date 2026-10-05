import * as THREE from 'three';

export interface ParticleInit {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  /** Linear colour; values > 1 bloom when additive. */
  color: THREE.Color;
  life: number;
  size: number;
  sizeEnd?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  /** Angular speed (rad/s) around a vertical axis through `swirlCenter`. */
  swirl?: number;
  swirlCenter?: THREE.Vector3;
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uHardness;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  float a = (exp(-d2 * uHardness) - exp(-uHardness)) / (1.0 - exp(-uHardness));
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

/**
 * CPU-simulated point particles. One draw call per system, fixed capacity,
 * dead particles are swap-removed so the live range stays packed.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly cap: number;
  private count = 0;

  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;

  private readonly vel: Float32Array;
  private readonly baseCol: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly swirl: Float32Array;
  private readonly swirlC: Float32Array;

  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor(capacity: number, mode: 'additive' | 'normal', hardness = 3) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.baseCol = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.swirl = new Float32Array(capacity);
    this.swirlC = new Float32Array(capacity * 2);

    const attr = (arr: Float32Array, n: number) =>
      new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', attr(this.pos, 3));
    this.geometry.setAttribute('aColor', attr(this.col, 3));
    this.geometry.setAttribute('aSize', attr(this.size, 1));
    this.geometry.setAttribute('aAlpha', attr(this.alpha, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 500 }, uHardness: { value: hardness } },
      transparent: true,
      depthWrite: false,
      blending: mode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = mode === 'additive' ? 20 : 10;
  }

  setViewport(pixelHeight: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  spawn(p: ParticleInit): void {
    if (this.count >= this.cap) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = p.position.x;
    this.pos[i3 + 1] = p.position.y;
    this.pos[i3 + 2] = p.position.z;
    this.vel[i3] = p.velocity?.x ?? 0;
    this.vel[i3 + 1] = p.velocity?.y ?? 0;
    this.vel[i3 + 2] = p.velocity?.z ?? 0;
    this.baseCol[i3] = p.color.r;
    this.baseCol[i3 + 1] = p.color.g;
    this.baseCol[i3 + 2] = p.color.b;
    this.life[i] = 0;
    this.maxLife[i] = p.life;
    this.size0[i] = p.size;
    this.size1[i] = p.sizeEnd ?? p.size;
    this.alpha0[i] = p.alpha ?? 1;
    this.gravity[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.swirl[i] = p.swirl ?? 0;
    this.swirlC[i * 2] = p.swirlCenter?.x ?? 0;
    this.swirlC[i * 2 + 1] = p.swirlCenter?.z ?? 0;
    this.size[i] = 0;
    this.alpha[i] = 0;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const t = this.life[i] / this.maxLife[i];

      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp - this.gravity[i] * dt;
      this.vel[i3 + 2] *= damp;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      const w = this.swirl[i];
      if (w !== 0) {
        const cx = this.swirlC[i * 2];
        const cz = this.swirlC[i * 2 + 1];
        const a = w * dt;
        const s = Math.sin(a);
        const c = Math.cos(a);
        const x = this.pos[i3] - cx;
        const z = this.pos[i3 + 2] - cz;
        this.pos[i3] = cx + x * c - z * s;
        this.pos[i3 + 2] = cz + x * s + z * c;
      }

      // floor
      if (this.pos[i3 + 1] < 0.01) {
        this.pos[i3 + 1] = 0.01;
        this.vel[i3 + 1] *= -0.3;
      }

      const fadeIn = Math.min(1, t * 10);
      const fadeOut = 1 - t * t;
      this.alpha[i] = this.alpha0[i] * fadeIn * fadeOut;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.col[i3] = this.baseCol[i3];
      this.col[i3 + 1] = this.baseCol[i3 + 1];
      this.col[i3 + 2] = this.baseCol[i3 + 2];
      i++;
    }

    this.geometry.setDrawRange(0, this.count);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      const a = this.geometry.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    const copy3 = (a: Float32Array) => {
      a[i * 3] = a[last * 3];
      a[i * 3 + 1] = a[last * 3 + 1];
      a[i * 3 + 2] = a[last * 3 + 2];
    };
    const copy1 = (a: Float32Array) => {
      a[i] = a[last];
    };
    copy3(this.pos);
    copy3(this.vel);
    copy3(this.baseCol);
    copy3(this.col);
    copy1(this.size);
    copy1(this.alpha);
    copy1(this.life);
    copy1(this.maxLife);
    copy1(this.size0);
    copy1(this.size1);
    copy1(this.alpha0);
    copy1(this.gravity);
    copy1(this.drag);
    copy1(this.swirl);
    this.swirlC[i * 2] = this.swirlC[last * 2];
    this.swirlC[i * 2 + 1] = this.swirlC[last * 2 + 1];
  }
}

const MOTES_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uScale;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime * (0.15 + aSeed * 0.1);
  p.x += sin(t + aSeed * 31.0) * 0.6;
  p.z += cos(t * 0.8 + aSeed * 17.0) * 0.6;
  p.y = mod(p.y + uTime * (0.05 + aSeed * 0.08), 6.0) + 0.3;
  vAlpha = smoothstep(0.3, 1.2, p.y) * (1.0 - smoothstep(4.5, 6.3, p.y)) * (0.4 + 0.6 * sin(uTime * 2.0 + aSeed * 50.0) * sin(uTime * 2.0 + aSeed * 50.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.035 + aSeed * 0.04) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const MOTES_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(uColor, exp(-d2 * 3.0) * vAlpha);
}
`;

/** Slowly drifting glowing dust in the air — fully GPU animated. */
export class AmbientMotes {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(count = 260) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2 + Math.random() * 9;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: MOTES_VERT,
      fragmentShader: MOTES_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 500 }, uColor: { value: new THREE.Color(1.6, 1.1, 0.6) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
  }

  setViewport(pixelHeight: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }
}
