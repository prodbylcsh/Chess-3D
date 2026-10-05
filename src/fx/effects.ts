import * as THREE from 'three';
import { animator, ease, rand } from '../core/animator';
import { layout } from '../core/layout';
import { AmbientMotes, ParticleSystem } from './particles';

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uRadius;
uniform float uWidth;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(uRadius - uWidth, uRadius, d) * (1.0 - smoothstep(uRadius, uRadius + uWidth * 0.35, d));
  float fill = (1.0 - smoothstep(0.0, uRadius, d)) * 0.12;
  gl_FragColor = vec4(uColor, (ring + fill) * uAlpha);
}
`;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/** Reusable one-shot visual effects. */
export class Effects {
  readonly sparks = new ParticleSystem(5000, 'additive', 4);
  readonly dust = new ParticleSystem(2500, 'normal', 2);
  readonly motes = new AmbientMotes();
  private readonly flashLights: THREE.PointLight[] = [];
  private flashCursor = 0;
  private readonly ringGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly orbGeometry = new THREE.SphereGeometry(1, 20, 14);

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.sparks.points, this.dust.points, this.motes.points);
    // Lights are created once and only their intensity changes: adding/removing
    // lights at runtime would force every material to recompile.
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 0, 2);
      this.flashLights.push(light);
      scene.add(light);
    }
    animator.onFrame((dt, time) => {
      this.sparks.update(dt);
      this.dust.update(dt);
      this.motes.update(time);
    });
  }

  setViewport(pixelHeight: number, fov: number): void {
    this.sparks.setViewport(pixelHeight, fov);
    this.dust.setViewport(pixelHeight, fov);
    this.motes.setViewport(pixelHeight, fov);
  }

  /** Short bright point-light flash (no shader recompiles; lights are pooled). */
  flash(position: THREE.Vector3, color: THREE.Color, intensity = 5, duration = 0.5): void {
    const light = this.flashLights[this.flashCursor++ % this.flashLights.length];
    light.position.copy(position);
    light.color.copy(color);
    void animator.tween(duration, (k) => {
      light.intensity = intensity * (1 - k);
    }, ease.outCubic);
  }

  sparkBurst(at: THREE.Vector3, color: THREE.Color, count = 80, speed = 6, opts: { up?: number; dir?: THREE.Vector3; size?: number } = {}): void {
    const up = opts.up ?? 0.4;
    for (let i = 0; i < count; i++) {
      const v = randomUnit(tmp).multiplyScalar(speed * rand(0.25, 1));
      v.y = Math.abs(v.y) * up + v.y * (1 - up) + speed * 0.15;
      if (opts.dir) v.addScaledVector(opts.dir, speed * rand(0.2, 0.8));
      const c = color.clone().multiplyScalar(rand(2.5, 6));
      this.sparks.spawn({
        position: at,
        velocity: v,
        color: c,
        life: rand(0.35, 1.1),
        size: (opts.size ?? 0.07) * rand(0.6, 1.4),
        sizeEnd: 0.01,
        gravity: 9,
        drag: 1.6,
      });
    }
  }

  dustPuff(at: THREE.Vector3, count = 18, radius = 0.4, strength = 1): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const p = tmp.set(at.x + Math.cos(a) * r, at.y + rand(0, 0.15), at.z + Math.sin(a) * r);
      const v = tmp2.set(Math.cos(a), rand(0.2, 0.8), Math.sin(a)).multiplyScalar(rand(0.3, 1.4) * strength);
      const g = rand(0.16, 0.28);
      this.dust.spawn({
        position: p,
        velocity: v,
        color: new THREE.Color(g * 1.05, g * 0.95, g * 0.85),
        life: rand(0.9, 2.0),
        size: rand(0.25, 0.45) * strength,
        sizeEnd: rand(0.8, 1.4) * strength,
        alpha: 0.35,
        gravity: -0.15,
        drag: 2.2,
      });
    }
  }

  shockwave(at: THREE.Vector3, color: THREE.Color, radius = 3, duration = 0.7): void {
    const material = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: {
        uColor: { value: color.clone().multiplyScalar(5) },
        uRadius: { value: 0 },
        uWidth: { value: 0.25 },
        uAlpha: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(this.ringGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, layout.boardTop + 0.02, at.z);
    ring.scale.setScalar(radius * 2);
    ring.renderOrder = 15;
    this.scene.add(ring);
    void animator
      .tween(duration, (k, raw) => {
        material.uniforms.uRadius.value = 0.05 + k * 0.95;
        material.uniforms.uWidth.value = 0.3 * (1 - raw) + 0.05;
        material.uniforms.uAlpha.value = 1 - raw;
      }, ease.outCubic)
      .then(() => {
        this.scene.remove(ring);
        material.dispose();
      });
  }

  /** Motes spiralling inwards towards a point (charging a spell). */
  gather(at: THREE.Vector3, color: THREE.Color, duration = 0.6, count = 70): void {
    for (let i = 0; i < count; i++) {
      const dir = randomUnit(tmp).multiplyScalar(rand(0.8, 1.6));
      const start = tmp2.copy(at).add(dir);
      const life = duration * rand(0.6, 1);
      const vel = dir.clone().multiplyScalar(-1 / life);
      this.sparks.spawn({
        position: start,
        velocity: vel,
        color: color.clone().multiplyScalar(rand(3, 7)),
        life,
        size: rand(0.04, 0.09),
        sizeEnd: 0.02,
        swirl: rand(3, 6),
        swirlCenter: at,
      });
    }
  }

  /** A swirling column of magic around a piece (promotion). */
  vortex(at: THREE.Vector3, color: THREE.Color, height = 2.2, duration = 1.2): void {
    const count = 220;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.35, 0.6);
      const p = tmp.set(at.x + Math.cos(a) * r, at.y + rand(0, 0.2), at.z + Math.sin(a) * r);
      this.sparks.spawn({
        position: p,
        velocity: tmp2.set(0, rand(0.6, 1.2) * height / duration, 0),
        color: color.clone().multiplyScalar(rand(3, 7)),
        life: duration * rand(0.5, 1),
        size: rand(0.04, 0.09),
        sizeEnd: 0.01,
        swirl: rand(4, 7),
        swirlCenter: at,
        drag: 0.3,
      });
    }
  }

  /** A glowing orb flying along an arc; resolves on arrival. */
  async bolt(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, size = 0.13, speed = 11): Promise<void> {
    const material = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(14), toneMapped: true });
    const orb = new THREE.Mesh(this.orbGeometry, material);
    orb.scale.setScalar(size);
    this.scene.add(orb);
    const halo = color.clone().multiplyScalar(5);

    const ctrl = from.clone().lerp(to, 0.5);
    ctrl.y += 0.6 + from.distanceTo(to) * 0.12;
    const duration = Math.max(0.22, from.distanceTo(to) / speed);
    const prev = from.clone();
    const p = new THREE.Vector3();
    await animator.tween(duration, (k) => {
      quadBezier(from, ctrl, to, k, p);
      orb.position.copy(p);
      orb.scale.setScalar(size * (0.9 + Math.random() * 0.25));
      // trail
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        tmp.copy(prev).lerp(p, s / steps);
        this.sparks.spawn({
          position: tmp,
          velocity: randomUnit(tmp2).multiplyScalar(0.4),
          color: halo,
          life: rand(0.25, 0.5),
          size: size * rand(1.2, 2.2),
          sizeEnd: 0.02,
          drag: 2,
        });
      }
      prev.copy(p);
    }, ease.inQuad);
    this.scene.remove(orb);
    material.dispose();
  }
}

function quadBezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  );
}

export function randomUnit(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(Math.cos(a) * s, u, Math.sin(a) * s);
}
