// A puzzle module's map as a small 3D world (docs/PLATFORM.md §4.2): a winding path of 100
// stepping stones through the module's landscape, a chest every 10 levels, the reward at the
// end, and the player's own chess piece standing on the next puzzle. It hops on to the next
// stone when a puzzle is solved. Drag or scroll to travel along the path; tap a stone to pick
// a puzzle. Independent of the game's engine (its own renderer, created and disposed with
// the page).
import * as THREE from 'three';
import { BONUS_EVERY, PUZZLES_PER_MODULE } from '#shared/puzzles.ts';
import type { Decor, Particles, WorldTheme } from './themes';

const SPACING = 3.3;
const TILE_TOP = 0.24;
const LAST = PUZZLES_PER_MODULE - 1;

/** The middle of the path at (fractional) level i. */
export function pathPoint(i: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(i * 0.33) * 4.2 + Math.sin(i * 0.09 + 1) * 2.6, 0, -i * SPACING);
}

/** Which way the path goes at level i (unit vector on the ground). */
function pathDir(i: number): THREE.Vector3 {
  return pathPoint(i + 0.01).sub(pathPoint(i - 0.01)).normalize();
}

/** A small seeded random generator, so a module's world looks the same every visit. */
function random(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function ease(k: number) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

export interface WorldOptions {
  /** the module's id (seeds the layout) and colour */
  id: string;
  color: string;
  theme: WorldTheme;
  /** a phone: fewer pixels, closer camera */
  compact: boolean;
}

interface Chest {
  group: THREE.Group;
  lid: THREE.Group;
  glow: THREE.Sprite;
  open: boolean;
  /** 0 → 1 while the lid opens */
  opening: number;
}

export class World {
  readonly canvas: HTMLCanvasElement;
  /** a stone was tapped (only open ones) */
  onPick: (index: number) => void = () => {};

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rand: () => number;
  private readonly color: THREE.Color;
  private readonly theme: WorldTheme;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly tiles: THREE.InstancedMesh;
  private readonly dots: THREE.InstancedMesh;
  private readonly labels: THREE.Sprite[] = [];
  private readonly chests: Chest[] = [];
  private readonly ring: THREE.Mesh;
  private readonly pick: THREE.Mesh;
  private readonly token = new THREE.Group();
  private readonly tokenShadow: THREE.Mesh;
  private readonly particles: THREE.Points;
  private readonly particleVel: Float32Array;
  private readonly particleKind: Particles;
  private readonly reward: THREE.Group;
  private readonly dust: THREE.Mesh;
  private readonly host: HTMLElement;
  private readonly resizer: ResizeObserver;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly offset: THREE.Vector3;
  /** looks a little right of the path on wide screens, so the card on the right doesn't cover it */
  private readonly lookShift: number;

  private stars: number[] = Array(PUZZLES_PER_MODULE).fill(0);
  private next = 0;
  private camAt = 0;
  private camGoal = 0;
  private tokenAt = 0;
  private hopping = false;
  private dustAge = 9;
  private time = 0;
  private drag: { id: number; y: number; x: number; moved: number; at: number } | null = null;

  constructor(host: HTMLElement, opts: WorldOptions) {
    this.host = host;
    this.theme = opts.theme;
    this.color = new THREE.Color(opts.color);
    this.rand = random(opts.id);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.compact ? 1.75 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'world-canvas';
    host.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(opts.compact ? 52 : 44, 1, 0.1, 600);
    this.offset = opts.compact ? new THREE.Vector3(0, 13.5, 14) : new THREE.Vector3(0, 12.5, 15);
    this.lookShift = opts.compact ? 0 : 3.2;
    this.scene.fog = new THREE.Fog(this.theme.fog, 26, 95);

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.tiles = this.buildTiles();
    this.dots = this.buildDots();
    this.buildLabels();
    this.buildChests();
    this.reward = this.buildReward();
    this.buildDecor(this.theme.decor);
    this.particleKind = this.theme.particles;
    [this.particles, this.particleVel] = this.buildParticles();

    // the ring that marks the next puzzle (pulses) and the one the player picked
    const ringGeo = this.own(new THREE.RingGeometry(1.35, 1.6, 40));
    this.ring = new THREE.Mesh(ringGeo, this.own(new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false })));
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);
    this.pick = new THREE.Mesh(ringGeo, this.own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide })));
    this.pick.rotation.x = -Math.PI / 2;
    this.pick.visible = false;
    this.scene.add(this.pick);

    // the piece's shadow and the puff of dust when it lands
    const blob = this.own(radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'));
    this.tokenShadow = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.6, 1.6)), this.own(new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false })));
    this.tokenShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.tokenShadow, this.token);
    this.dust = new THREE.Mesh(
      this.own(new THREE.RingGeometry(0.4, 0.9, 32)),
      this.own(new THREE.MeshBasicMaterial({ color: this.theme.stone, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })),
    );
    this.dust.rotation.x = -Math.PI / 2;
    this.scene.add(this.dust);

    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(host);
    this.resize();
    this.listen();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ state

  /**
   * The stars of every level and the next one to play (-1 when all are solved). The chests
   * of the first `openUpTo` solved puzzles are open (openChests opens more with a flourish).
   */
  setProgress(stars: number[], next: number, openUpTo = stars.filter((s) => s > 0).length): void {
    this.stars = stars;
    this.next = next;
    const stone = new THREE.Color(this.theme.stone);
    const solved = stone.clone().lerp(this.color, 0.7).multiplyScalar(1.15);
    const locked = stone.clone().multiplyScalar(0.3);
    const open = stone.clone().lerp(this.color, 0.3);
    for (let i = 0; i < PUZZLES_PER_MODULE; i++) {
      const isOpen = next === -1 || i <= next;
      this.tiles.setColorAt(i, stars[i] > 0 ? solved : isOpen ? open : locked);
      this.drawLabel(i);
    }
    this.tiles.instanceColor!.needsUpdate = true;
    const dotDone = this.color.clone().multiplyScalar(1.2);
    const dotTodo = stone.clone().multiplyScalar(0.35);
    for (let i = 0; i < this.dots.count; i++) this.dots.setColorAt(i, stars[Math.floor(i / 2)] > 0 ? dotDone : dotTodo);
    this.dots.instanceColor!.needsUpdate = true;
    this.chests.forEach((c, k) => {
      c.open = openUpTo >= (k + 1) * BONUS_EVERY;
      c.opening = 0;
    });
    const ringAt = next === -1 ? LAST : next;
    pathPoint(ringAt, this.ring.position).y = TILE_TOP + 0.02;
  }

  /** Open the chests earned up to `solved` puzzles that are still closed, lid flying. */
  openChests(solved: number): void {
    this.chests.forEach((c, k) => {
      if (!c.open && solved >= (k + 1) * BONUS_EVERY) {
        c.open = true;
        c.opening = 1;
        this.camGoal = k * BONUS_EVERY + BONUS_EVERY - 1;
      }
    });
  }

  /** Mark the stone the player picked (or none). */
  select(index: number): void {
    this.pick.visible = index >= 0 && index !== this.next;
    if (this.pick.visible) pathPoint(index, this.pick.position).y = TILE_TOP + 0.03;
    if (index >= 0) this.camGoal = index;
  }

  /** Bring the camera to a level; instantly on the first look. */
  focus(index: number, instant = false): void {
    this.camGoal = index;
    if (instant) this.camAt = index;
  }

  /** The player's chess piece (any model standing on the ground at y = 0). */
  setToken(model: THREE.Object3D): void {
    this.token.clear();
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y || 1;
    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(1.9 / height);
    model.position.y -= box.min.y;
    holder.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = false;
    });
    this.token.add(holder);
    this.placeToken(this.tokenAt);
  }

  /** Put the piece on a stone without animation. */
  placeToken(index: number): void {
    this.tokenAt = index;
    pathPoint(index, this.token.position).y = TILE_TOP;
    this.faceAlongPath(index);
  }

  /** Hop the piece from stone to stone; resolves when it has landed on the last one. */
  async hop(from: number, to: number): Promise<void> {
    this.placeToken(from);
    this.camGoal = from;
    this.camAt = from;
    await sleep(500);
    for (let i = from; i < to; i++) await this.hopOnce(i, i + 1);
  }

  private hopOnce(a: number, b: number): Promise<void> {
    this.hopping = true;
    const start = pathPoint(a);
    const end = pathPoint(b);
    const dir = end.clone().sub(start);
    const yaw = Math.atan2(dir.x, dir.z);
    return new Promise((resolve) => {
      const duration = 0.72;
      let t = 0;
      const step = (dt: number) => {
        t += dt;
        const k = Math.min(1, t / duration);
        const e = ease(k);
        this.token.position.lerpVectors(start, end, e);
        this.token.position.y = TILE_TOP + Math.sin(Math.PI * k) * 1.8;
        this.token.rotation.y = yaw;
        this.token.rotation.x = Math.sin(Math.PI * k) * -0.25;
        // squash before take-off and on landing
        const squash = k < 0.12 ? 1 - Math.sin((k / 0.12) * Math.PI) * 0.12 : 1;
        this.token.scale.set(2 - squash, squash, 2 - squash);
        this.camGoal = a + (b - a) * e;
        if (k < 1) return false;
        this.tokenAt = b;
        this.token.rotation.x = 0;
        this.token.scale.setScalar(1);
        this.dust.position.copy(end).setY(TILE_TOP + 0.02);
        this.dustAge = 0;
        this.hopping = false;
        resolve();
        return true;
      };
      this.tweens.push(step);
    });
  }

  private readonly tweens: ((dt: number) => boolean)[] = [];

  private faceAlongPath(i: number): void {
    const dir = pathDir(i);
    this.token.rotation.set(0, Math.atan2(dir.x, dir.z) + Math.PI, 0);
  }

  // ------------------------------------------------------------------ build

  private own<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  private buildSky(): void {
    const [top, horizon] = this.theme.sky;
    const material = this.own(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(top) },
          horizon: { value: new THREE.Color(horizon) },
          sun: { value: new THREE.Color(this.theme.sun) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 sun;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, -0.2, 1.0);
            vec3 c = mix(horizon, top, smoothstep(-0.05, 0.55, h));
            // the sun's glow far ahead, low on the horizon
            float s = max(dot(vDir, normalize(vec3(0.15, 0.12, -1.0))), 0.0);
            c += sun * (pow(s, 24.0) * 0.9 + pow(s, 4.0) * 0.25);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    const sky = new THREE.Mesh(this.own(new THREE.SphereGeometry(500, 32, 16)), material);
    sky.onBeforeRender = () => sky.position.copy(this.camera.position);
    this.scene.add(sky);
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(this.theme.sky[1], this.theme.ground[0], 1.15));
    const sun = new THREE.DirectionalLight(this.theme.light, 2.2);
    sun.position.set(6, 14, 10);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(this.theme.sun, 1.2);
    rim.position.set(-4, 6, -14);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  }

  private buildGround(): void {
    const length = PUZZLES_PER_MODULE * SPACING + 120;
    const geo = this.own(new THREE.PlaneGeometry(110, length, 70, 260));
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -length / 2 + 40);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const low = new THREE.Color(this.theme.ground[0]);
    const high = new THREE.Color(this.theme.ground[1]);
    const c = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const i = -z / SPACING;
      const d = Math.abs(x - pathPoint(i).x);
      const hills =
        Math.sin(x * 0.11 + z * 0.05) * 1.6 + Math.sin(x * 0.27 - z * 0.13) * 0.7 + Math.sin(z * 0.04 + x * 0.02) * 2.2 + d * 0.06 * Math.max(0, d - 10);
      const away = smooth(2.6, 9, d);
      const y = -0.55 - (1 - away) * 0.15 + away * (hills + 1.4);
      pos.setY(v, y);
      c.copy(low).lerp(high, Math.min(1, Math.max(0, (y + 0.6) / 4.5)) * 0.85 + (1 - away) * 0.15);
      colors.set([c.r, c.g, c.b], v * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, this.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
    this.scene.add(ground);
  }

  private buildTiles(): THREE.InstancedMesh {
    const geo = this.own(new THREE.CylinderGeometry(1.15, 1.32, 0.48, 8));
    const mat = this.own(new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.05, flatShading: true }));
    const mesh = new THREE.InstancedMesh(geo, mat, PUZZLES_PER_MODULE);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    for (let i = 0; i < PUZZLES_PER_MODULE; i++) {
      pathPoint(i, p);
      q.setFromEuler(new THREE.Euler(0, this.rand() * Math.PI, 0));
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(this.theme.stone));
    }
    this.scene.add(mesh);
    return mesh;
  }

  private buildDots(): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.own(new THREE.SphereGeometry(0.13, 10, 8)), this.own(new THREE.MeshStandardMaterial({ roughness: 0.5 })), LAST * 2);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < LAST; i++) {
      for (const [k, f] of [0.36, 0.64].entries()) {
        pathPoint(i + f, p).y = 0.02;
        m.makeTranslation(p.x, p.y, p.z);
        mesh.setMatrixAt(i * 2 + k, m);
        mesh.setColorAt(i * 2 + k, new THREE.Color(this.theme.stone));
      }
    }
    this.scene.add(mesh);
    return mesh;
  }

  private buildLabels(): void {
    for (let i = 0; i < PUZZLES_PER_MODULE; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 112;
      const texture = this.own(new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const sprite = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })));
      pathPoint(i, sprite.position).y = 1.25;
      sprite.scale.set(1.55, 1.08, 1);
      sprite.renderOrder = 2;
      this.labels.push(sprite);
      this.scene.add(sprite);
    }
  }

  private drawLabel(i: number): void {
    const sprite = this.labels[i];
    const texture = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d')!;
    const open = this.next === -1 || i <= this.next;
    const stars = this.stars[i];
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${open ? 54 : 46}px Inter, system-ui, sans-serif`;
    g.shadowColor = 'rgba(0,0,0,0.65)';
    g.shadowBlur = 10;
    g.fillStyle = !open ? 'rgba(255,255,255,0.38)' : i === this.next ? '#ffffff' : 'rgba(255,255,255,0.92)';
    g.fillText(String(i + 1), 80, 44);
    if (stars > 0) {
      g.font = '700 30px Inter, system-ui, sans-serif';
      g.shadowBlur = 6;
      for (let s = 0; s < 3; s++) {
        g.fillStyle = s < stars ? '#f2c27a' : 'rgba(255,255,255,0.25)';
        g.fillText('★', 50 + s * 30, 92);
      }
    }
    texture.needsUpdate = true;
  }

  private buildChests(): void {
    const wood = this.own(new THREE.MeshStandardMaterial({ color: '#6b4325', roughness: 0.7 }));
    const gold = this.own(new THREE.MeshStandardMaterial({ color: '#f2c27a', roughness: 0.3, metalness: 0.8, emissive: '#5a3a10', emissiveIntensity: 0.4 }));
    const body = this.own(new THREE.BoxGeometry(1.1, 0.62, 0.74));
    const band = this.own(new THREE.BoxGeometry(1.14, 0.12, 0.78));
    const lidGeo = this.own(new THREE.CylinderGeometry(0.37, 0.37, 1.1, 14, 1, false, 0, Math.PI));
    lidGeo.rotateZ(Math.PI / 2);
    lidGeo.translate(0, 0, 0.37);
    const lock = this.own(new THREE.BoxGeometry(0.18, 0.22, 0.08));
    const glowTex = this.own(radialTexture('rgba(255,214,140,1)', 'rgba(255,170,60,0)'));
    for (let k = 0; k < PUZZLES_PER_MODULE / BONUS_EVERY - 1; k++) {
      const i = k * BONUS_EVERY + BONUS_EVERY - 1;
      const group = new THREE.Group();
      const side = new THREE.Vector3(0, 1, 0).cross(pathDir(i)).normalize();
      const flip = pathPoint(i).x > pathPoint(i + 1).x ? -1 : 1;
      group.position.copy(pathPoint(i)).addScaledVector(side, 2.3 * flip);
      group.position.y = 0.2;
      group.lookAt(pathPoint(i).setY(0.2));
      const box = new THREE.Mesh(body, wood);
      box.position.y = 0.31;
      const b1 = new THREE.Mesh(band, gold);
      b1.position.y = 0.5;
      const lid = new THREE.Group();
      lid.position.set(0, 0.62, -0.37);
      lid.add(new THREE.Mesh(lidGeo, wood));
      const latch = new THREE.Mesh(lock, gold);
      latch.position.set(0, 0.5, 0.39);
      const glow = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
      glow.position.y = 1.1;
      glow.scale.setScalar(2.6);
      group.add(box, b1, lid, latch, glow);
      this.scene.add(group);
      this.chests.push({ group, lid, glow, open: false, opening: 0 });
    }
  }

  private buildReward(): THREE.Group {
    const group = new THREE.Group();
    pathPoint(LAST + 1.6, group.position).y = 0;
    const stone = this.own(new THREE.MeshStandardMaterial({ color: this.theme.stone, roughness: 0.6, flatShading: true }));
    const base = new THREE.Mesh(this.own(new THREE.CylinderGeometry(1.9, 2.3, 0.9, 10)), stone);
    base.position.y = 0.2;
    const step = new THREE.Mesh(this.own(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 10)), stone);
    step.position.y = 0.85;
    const gift = new THREE.Group();
    const box = new THREE.Mesh(this.own(new THREE.BoxGeometry(1.1, 1.1, 1.1)), this.own(new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.4, emissive: this.color, emissiveIntensity: 0.25 })));
    const ribbonMat = this.own(new THREE.MeshStandardMaterial({ color: '#f2c27a', metalness: 0.7, roughness: 0.3 }));
    const r1 = new THREE.Mesh(this.own(new THREE.BoxGeometry(1.14, 1.14, 0.22)), ribbonMat);
    const r2 = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.22, 1.14, 1.14)), ribbonMat);
    gift.add(box, r1, r2);
    gift.position.y = 2.4;
    gift.name = 'gift';
    const beam = new THREE.Mesh(
      this.own(new THREE.CylinderGeometry(1.1, 1.6, 40, 24, 1, true)),
      this.own(new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    );
    beam.position.y = 20;
    group.add(base, step, gift, beam);
    this.scene.add(group);
    return group;
  }

  private buildDecor(kind: Decor): void {
    const color = new THREE.Color(this.theme.decorColor);
    const accent = new THREE.Color(this.theme.accent);
    const parts = decorParts(kind, color, accent, (t) => this.own(t));
    const count = kind === 'trees' ? 170 : kind === 'crystals' ? 150 : 120;
    const meshes = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geometry, p.material, count);
      this.scene.add(mesh);
      return mesh;
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = -6 + this.rand() * (PUZZLES_PER_MODULE + 18);
      const side = this.rand() < 0.5 ? -1 : 1;
      const far = (kind === 'statues' || kind === 'towers' || kind === 'pillars' ? 7 : 5) + Math.pow(this.rand(), 1.4) * 30;
      pathPoint(i, pos);
      pos.x += side * far;
      pos.y = -0.4;
      const size = (0.55 + this.rand() * 0.75) * (0.8 + far / 22);
      const yaw = this.rand() * Math.PI * 2;
      const tilt = (this.rand() - 0.5) * (kind === 'crystals' || kind === 'obsidian' ? 0.6 : kind === 'statues' ? 0.04 : 0.08);
      q.setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.6));
      const bright = 0.8 + this.rand() * 0.35;
      parts.forEach((p, k) => {
        s.set(size * p.scale.x, size * p.scale.y * (0.75 + this.rand() * 0.6), size * p.scale.z);
        m.compose(pos, q, s);
        meshes[k].setMatrixAt(n, m);
        meshes[k].setColorAt(n, tint.setRGB(bright, bright, bright));
      });
    }
  }

  private buildParticles(): [THREE.Points, Float32Array] {
    const n = 420;
    const geo = this.own(new THREE.BufferGeometry());
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = (this.rand() - 0.5) * 60;
      pos[k * 3 + 1] = this.rand() * 14;
      pos[k * 3 + 2] = -this.rand() * 80 + 15;
      vel[k * 4] = (this.rand() - 0.5) * 0.4;
      vel[k * 4 + 1] = this.rand();
      vel[k * 4 + 2] = (this.rand() - 0.5) * 0.4;
      vel[k * 4 + 3] = this.rand() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const kind = this.theme.particles;
    const tint = kind === 'snow' ? '#ffffff' : kind === 'dust' ? this.theme.stone : this.theme.accent;
    const mat = this.own(
      new THREE.PointsMaterial({
        size: kind === 'snow' ? 0.22 : kind === 'dust' ? 0.16 : 0.2,
        map: this.own(radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)')),
        color: tint,
        transparent: true,
        depthWrite: false,
        blending: kind === 'snow' || kind === 'dust' ? THREE.NormalBlending : THREE.AdditiveBlending,
        opacity: kind === 'dust' ? 0.5 : 0.95,
      }),
    );
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    return [points, vel];
  }

  // ------------------------------------------------------------------ input

  private listen(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private readonly onDown = (e: PointerEvent) => {
    this.drag = { id: e.pointerId, y: e.clientY, x: e.clientX, moved: 0, at: performance.now() };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent) => {
    if (!this.drag || this.drag.id !== e.pointerId) {
      if (e.pointerType === 'mouse') this.canvas.style.cursor = this.stoneAt(e) >= 0 ? 'pointer' : 'grab';
      return;
    }
    const dy = e.clientY - this.drag.y;
    const dx = e.clientX - this.drag.x;
    this.drag.moved += Math.abs(dy) + Math.abs(dx);
    this.drag.y = e.clientY;
    this.drag.x = e.clientX;
    // dragging down pulls the path towards you, like scrolling a page
    this.camGoal = Math.min(LAST + 2, Math.max(-1, this.camGoal + (dy * 22) / this.host.clientHeight));
  };

  private readonly onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved < 8 && performance.now() - d.at < 600) {
      const i = this.stoneAt(e);
      if (i >= 0) this.onPick(i);
    }
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camGoal = Math.min(LAST + 2, Math.max(-1, this.camGoal - e.deltaY * 0.012));
  };

  /** The open stone under the pointer, or -1. */
  private stoneAt(e: PointerEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([this.tiles, ...this.labels], false);
    for (const hit of hits) {
      const i = hit.object === this.tiles ? (hit.instanceId ?? -1) : this.labels.indexOf(hit.object as THREE.Sprite);
      if (i >= 0 && (this.next === -1 || i <= this.next)) return i;
    }
    return -1;
  }

  // ------------------------------------------------------------------ frame

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    for (let k = this.tweens.length - 1; k >= 0; k--) if (this.tweens[k](dt)) this.tweens.splice(k, 1);

    // the camera glides after its goal along the path
    this.camAt += (this.camGoal - this.camAt) * Math.min(1, dt * (this.hopping ? 7 : 4.5));
    const focus = pathPoint(this.camAt);
    const look = pathPoint(this.camAt + 2.2);
    this.camera.position.set(focus.x * 0.7 + this.lookShift, this.offset.y, focus.z + this.offset.z);
    this.camera.lookAt(look.x * 0.85 + this.lookShift, 0, look.z);

    // the next stone's ring breathes, the piece bobs while it waits
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    this.ring.scale.setScalar(1 + pulse * 0.08);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.4;
    if (!this.hopping && this.token.children.length) {
      this.token.position.y = TILE_TOP + Math.abs(Math.sin(this.time * 2.2)) * 0.06;
      this.token.rotation.y += Math.sin(this.time * 0.8) * 0.002;
    }
    this.tokenShadow.position.set(this.token.position.x, TILE_TOP + 0.01, this.token.position.z);
    this.tokenShadow.scale.setScalar(1 - Math.min(0.5, (this.token.position.y - TILE_TOP) * 0.25));

    // dust ring after a landing
    this.dustAge += dt;
    const dustMat = this.dust.material as THREE.MeshBasicMaterial;
    dustMat.opacity = Math.max(0, 0.7 - this.dustAge * 1.6);
    this.dust.scale.setScalar(1 + this.dustAge * 3);

    // chests open, the reward turns
    for (const c of this.chests) {
      if (c.open && c.opening > 0) c.opening = Math.max(0, c.opening - dt * 1.4);
      const k = c.open ? 1 - c.opening : 0;
      c.lid.rotation.x = -1.9 * ease(k);
      (c.glow.material as THREE.SpriteMaterial).opacity = c.open ? 0.55 + 0.25 * Math.sin(this.time * 2.5) : 0;
    }
    const gift = this.reward.getObjectByName('gift')!;
    gift.rotation.y += dt * 0.6;
    gift.position.y = 2.4 + Math.sin(this.time * 1.5) * 0.18;

    this.animateParticles(dt, focus);
    this.renderer.render(this.scene, this.camera);
  }

  private animateParticles(dt: number, focus: THREE.Vector3): void {
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const v = this.particleVel;
    const kind = this.particleKind;
    const rise = kind === 'embers' ? 1.2 : kind === 'snow' ? -1.1 : kind === 'motes' ? 0.25 : 0;
    for (let k = 0; k < arr.length / 3; k++) {
      const phase = v[k * 4 + 3] + this.time * (0.5 + v[k * 4 + 1]);
      arr[k * 3] += (v[k * 4] + Math.sin(phase) * (kind === 'fireflies' ? 0.6 : 0.25) + (kind === 'dust' ? 0.9 : 0)) * dt;
      arr[k * 3 + 1] += (rise * (0.5 + v[k * 4 + 1]) + (kind === 'fireflies' ? Math.cos(phase * 1.3) * 0.4 : 0)) * dt;
      arr[k * 3 + 2] += (v[k * 4 + 2] + Math.cos(phase) * 0.2) * dt;
      // keep them around the camera's focus
      const dz = arr[k * 3 + 2] - focus.z;
      if (dz > 18) arr[k * 3 + 2] -= 70;
      else if (dz < -52) arr[k * 3 + 2] += 70;
      const dx = arr[k * 3] - focus.x;
      if (dx > 30) arr[k * 3] -= 60;
      else if (dx < -30) arr[k * 3] += 60;
      if (arr[k * 3 + 1] > 15) arr[k * 3 + 1] = 0;
      else if (arr[k * 3 + 1] < 0) arr[k * 3 + 1] = 15;
    }
    pos.needsUpdate = true;
    if (kind === 'fireflies' || kind === 'embers') {
      (this.particles.material as THREE.PointsMaterial).opacity = 0.75 + Math.sin(this.time * 6) * 0.2;
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizer.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('wheel', this.onWheel);
    this.token.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    c.remove();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A soft round spot, for glows, particles and shadows. */
function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface DecorPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** scale of this part relative to the decoration's size */
  scale: THREE.Vector3;
}

/** The shapes that stand around a module's path. */
function decorParts(kind: Decor, color: THREE.Color, accent: THREE.Color, own: <T extends { dispose(): void }>(t: T) => T): DecorPart[] {
  const one = new THREE.Vector3(1, 1, 1);
  const solid = (c: THREE.Color, extra: THREE.MeshStandardMaterialParameters = {}) =>
    own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true, ...extra }));
  const lathe = (profile: [number, number][], segments = 14) => {
    const g = own(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), segments));
    return g;
  };
  switch (kind) {
    case 'statues': {
      // giant stone pawns, like chessmen left on a field at dawn
      const pawn = lathe([
        [0, 0],
        [0.9, 0],
        [0.95, 0.25],
        [0.7, 0.4],
        [0.5, 0.55],
        [0.32, 1.3],
        [0.55, 1.45],
        [0.55, 1.55],
        [0.3, 1.62],
        [0.48, 1.85],
        [0.5, 2.1],
        [0.4, 2.35],
        [0.2, 2.48],
        [0, 2.52],
      ]);
      return [{ geometry: pawn, material: solid(color, { roughness: 0.55 }), scale: one.clone().multiplyScalar(1.5) }];
    }
    case 'trees': {
      const trunk = own(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 6));
      trunk.translate(0, 0.65, 0);
      const crown = own(new THREE.IcosahedronGeometry(1, 0));
      crown.scale(1.1, 1.25, 1.1);
      crown.translate(0, 2.0, 0);
      return [
        { geometry: trunk, material: solid(color), scale: one.clone() },
        { geometry: crown, material: solid(accent, { roughness: 0.85 }), scale: one.clone() },
      ];
    }
    case 'pillars': {
      const shaft = own(new THREE.CylinderGeometry(0.42, 0.48, 5, 12));
      shaft.translate(0, 2.5, 0);
      const cap = own(new THREE.BoxGeometry(1.25, 0.35, 1.25));
      cap.translate(0, 5.15, 0);
      const fire = own(new THREE.IcosahedronGeometry(0.32, 0));
      fire.translate(0, 5.6, 0);
      return [
        { geometry: shaft, material: solid(color, { roughness: 0.5 }), scale: one.clone() },
        { geometry: cap, material: solid(color, { roughness: 0.5 }), scale: one.clone() },
        { geometry: fire, material: solid(accent, { emissive: accent, emissiveIntensity: 1.6 }), scale: one.clone() },
      ];
    }
    case 'spires': {
      const spire = own(new THREE.ConeGeometry(1.3, 7, 6, 3));
      spire.translate(0, 3.3, 0);
      const rock = own(new THREE.DodecahedronGeometry(0.9, 0));
      rock.translate(1.6, 0.3, 0.4);
      return [
        { geometry: spire, material: solid(color), scale: one.clone() },
        { geometry: rock, material: solid(color.clone().multiplyScalar(0.8)), scale: one.clone() },
      ];
    }
    case 'crystals': {
      const crystal = own(new THREE.OctahedronGeometry(1, 0));
      crystal.scale(0.55, 2.6, 0.55);
      crystal.translate(0, 2.2, 0);
      const mound = own(new THREE.SphereGeometry(1.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2));
      mound.scale(1, 0.45, 1);
      return [
        {
          geometry: crystal,
          material: solid(color, { roughness: 0.15, metalness: 0.1, emissive: accent, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 }),
          scale: one.clone(),
        },
        { geometry: mound, material: solid(new THREE.Color('#f4f8ff'), { roughness: 0.95 }), scale: one.clone() },
      ];
    }
    case 'obsidian': {
      const spike = own(new THREE.ConeGeometry(0.9, 5, 4, 1));
      spike.translate(0, 2.4, 0);
      const pool = own(new THREE.CircleGeometry(1.4, 10));
      pool.rotateX(-Math.PI / 2);
      pool.translate(1.8, 0.5, 0);
      return [
        { geometry: spike, material: solid(color, { roughness: 0.2, metalness: 0.3, emissive: accent, emissiveIntensity: 0.12 }), scale: one.clone() },
        { geometry: pool, material: solid(accent, { emissive: accent, emissiveIntensity: 1.4 }), scale: one.clone() },
      ];
    }
    case 'towers': {
      const body = own(new THREE.CylinderGeometry(1.1, 1.35, 6, 10));
      body.translate(0, 3, 0);
      const crown = own(new THREE.CylinderGeometry(1.45, 1.3, 0.8, 10));
      crown.translate(0, 6.4, 0);
      const light = own(new THREE.BoxGeometry(0.3, 0.45, 0.1));
      light.translate(0, 4.2, 1.18);
      return [
        { geometry: body, material: solid(color), scale: one.clone() },
        { geometry: crown, material: solid(color.clone().multiplyScalar(0.85)), scale: one.clone() },
        { geometry: light, material: solid(accent, { emissive: accent, emissiveIntensity: 1.5 }), scale: one.clone() },
      ];
    }
  }
}
