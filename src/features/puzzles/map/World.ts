// A puzzle module's map as a small 3D world (docs/PLATFORM.md §4.2): a winding path of 100
// stepping stones through the module's landscape, a chest every 10 levels, the reward at the
// end, and the player's own chess piece standing on the next puzzle. It hops on to the next
// stone when a puzzle is solved. Drag or scroll to travel along the path; tap a stone to pick
// a puzzle. Independent of the game's engine (its own renderer, created and disposed with
// the page).
import * as THREE from 'three';
import { BONUS_EVERY, PUZZLES_PER_MODULE } from '#shared/puzzles.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { assetUrl } from '../../../cosmetics/assets';
import type { Particles, WorldTheme } from './themes';

const SPACING = 3.3;
const TILE_TOP = 0.24;
const LAST = PUZZLES_PER_MODULE - 1;

const sceneryLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

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

/** A level terrace cut into the valley's side, where a landmark stands. */
interface Pad {
  x: number;
  z: number;
  y: number;
  side: number;
}
const PAD_RADIUS = 8;
/** Stretches of the path the scattered copies are grouped in (for culling). */
const STRETCHES = 6;
/** Where the fog hides everything. */
const FOG_FAR = 95;
const PAD_BLEND = 6;

/** Height of the ground: flat along the path, hills further out, level on the pads. */
function groundHeight(x: number, z: number, pads: readonly Pad[] = []): number {
  const d = Math.abs(x - pathPoint(-z / SPACING).x);
  const hills = Math.sin(x * 0.11 + z * 0.05) * 1.6 + Math.sin(x * 0.27 - z * 0.13) * 0.7 + Math.sin(z * 0.04 + x * 0.02) * 2.2 + d * 0.06 * Math.max(0, d - 10);
  const away = smooth(2.6, 9, d);
  const y = -0.55 - (1 - away) * 0.15 + away * (hills + 1.4);
  let level = y;
  for (const p of pads) {
    const k = smooth(PAD_RADIUS, PAD_RADIUS + PAD_BLEND, Math.hypot(x - p.x, z - p.z));
    if (k < 1) level = p.y + (level - p.y) * k;
  }
  // the terraces never reach the path, its chests and labels
  return level + (y - level) * (1 - smooth(3.5, 6, d));
}

/** The landmarks' terraces: every 17 levels, 16 units off the path, on alternating sides. */
function landmarkPads(id: string): Pad[] {
  const rand = random(`${id}:landmarks`);
  return [9, 26, 43, 60, 77, 94].map((level, k) => {
    const side = k % 2 === 0 ? 1 : -1;
    const at = pathPoint(level + (rand() - 0.5) * 4);
    at.x += side * 16;
    // as high as the ground at the terrace's inner edge, so it opens onto the path
    return { x: at.x, z: at.z, y: groundHeight(at.x - side * PAD_RADIUS, at.z), side };
  });
}

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
  /** settles when the module's scenery has loaded (or failed to) */
  readonly ready: Promise<void>;
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
  /** how far ahead of the focused stone the camera looks */
  private readonly lookAhead: number;
  /** shifts the picture up by this share of the height (a phone's card covers the bottom) */
  private readonly lift: number;
  private readonly compact: boolean;
  private readonly pads: Pad[];
  /** the horizon rings, kept round the camera */
  private readonly horizon = new THREE.Group();
  /** the scattered copies per stretch of the path, shown only while the stretch is out of the fog */
  private readonly stretches: { meshes: THREE.Object3D[]; near: number; far: number }[] = [];
  private disposed = false;

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
    this.pads = landmarkPads(opts.id);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.compact ? 1.75 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'world-canvas';
    host.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(opts.compact ? 52 : 44, 1, 0.1, 600);
    this.offset = opts.compact ? new THREE.Vector3(0, 8.5, 12.5) : new THREE.Vector3(0, 7, 11.5);
    this.lookAhead = opts.compact ? 3.6 : 4.5;
    this.lift = opts.compact ? 0.17 : 0;
    this.lookShift = opts.compact ? 0 : 2.6;
    this.compact = opts.compact;
    this.scene.fog = new THREE.Fog(new THREE.Color(this.theme.fog).lerp(new THREE.Color(this.theme.sky[1]), 0.35), 26, FOG_FAR);

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.tiles = this.buildTiles();
    this.dots = this.buildDots();
    this.buildLabels();
    this.buildChests();
    this.reward = this.buildReward();
    this.scene.add(this.horizon);
    this.ready = this.loadScenery(opts.id);
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
    // the piece looks along the path, the way faceAlongPath turns it
    const yaw = Math.atan2(dir.x, dir.z) + Math.PI;
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

  private ground(x: number, z: number): number {
    return groundHeight(x, z, this.pads);
  }

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
      const away = smooth(2.6, 9, Math.abs(x - pathPoint(-z / SPACING).x));
      const y = this.ground(x, z);
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
      // beside the stone, on the outside of the bend, so the piece never hides it
      const side = new THREE.Vector3(0, 1, 0).cross(pathDir(i)).normalize();
      const out = pathPoint(i).x > pathPoint(i + 1).x ? 1 : -1;
      pathPoint(i, sprite.position).addScaledVector(side, 1.9 * out).setY(0.75);
      sprite.scale.set(1.45, 1.01, 1);
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
      this.own(new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    );
    beam.position.y = 20;
    group.add(base, step, gift, beam);
    this.scene.add(group);
    return group;
  }

  /**
   * What stands round the path: the module's models (public/assets/map/<id>.glb, built by
   * scripts/assets/build-map.ts from the user's PBR models). Many copies of the `big` and
   * `small` ones are scattered along the path, the landmarks stand on their terraces, and
   * the horizon rings follow the camera. The models keep their own textured materials;
   * the horizon is drawn unlit. Without the file the map still works, only bare.
   */
  private async loadScenery(id: string): Promise<void> {
    let root: THREE.Group;
    try {
      root = (await sceneryLoader.loadAsync(assetUrl(`map/${id}.glb`))).scene;
    } catch (e) {
      console.warn('map scenery', e);
      return;
    }
    const materials = new Set<THREE.Material>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) materials.add(mesh.material as THREE.Material);
    });
    if (this.disposed) {
      root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
      for (const material of materials) disposeMaterial(material);
      return;
    }
    root.updateMatrixWorld(true);
    // soft light from all round for the textured materials, so metal and polished stone
    // don't look black (the map has no surroundings to reflect)
    const environment = this.environment();
    for (const material of materials) {
      this.own({ dispose: () => disposeMaterial(material) });
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.isMeshStandardMaterial) {
        standard.envMap = environment;
        standard.envMapIntensity = 0.55;
      }
    }
    const horizonMaterials = this.horizonMaterials();
    /** the meshes of a model with their placement inside it */
    const meshesOf = (node: THREE.Object3D) => {
      const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material as THREE.Material;
        const horizon = node.name.startsWith('horizon');
        out.push({ geometry: this.own(mesh.geometry), material: horizon ? (horizonMaterials[material.name] ?? horizonMaterials.body) : material, matrix: mesh.matrixWorld.clone() });
      });
      return out;
    };
    const models = (prefix: string) => root.children.filter((c) => c.name.startsWith(prefix));

    // landmarks on their terraces, turned towards the path and the camera
    const landmarks = models('landmark-');
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    if (landmarks.length)
      this.pads.forEach((pad, k) => {
        const landmark = landmarks[k % landmarks.length];
        // the front towards the path and the camera; a profile (facing x) shows its side to the camera, looking at the path
        const yaw = landmark.userData.facing === 'x' ? (pad.side > 0 ? Math.PI : 0) + pad.side * 0.25 : Math.atan2(-pad.side * 0.8, 1);
        q.setFromEuler(new THREE.Euler(0, yaw + (this.rand() - 0.5) * 0.3, 0));
        m.compose(new THREE.Vector3(pad.x, pad.y - 0.3, pad.z), q, one);
        for (const part of meshesOf(landmark)) {
          const mesh = new THREE.Mesh(part.geometry, part.material);
          mesh.matrixAutoUpdate = false;
          mesh.matrix.multiplyMatrices(m, part.matrix);
          this.scene.add(mesh);
        }
      });

    // many copies: `big` from 7.5 units off the path, `small` close to it
    const compact = this.compact ? 0.75 : 1;
    this.scatter(models('big-'), meshesOf, Math.round(160 * compact), 7.5, 30, 0.3, (far) => (0.7 + this.rand() * 0.45) * (0.8 + far / 26));
    this.scatter(models('small-'), meshesOf, Math.round(380 * compact), 3.2, 16, 0.08, () => 0.75 + this.rand() * 0.6);

    for (const node of models('horizon-')) {
      for (const part of meshesOf(node)) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(part.matrix);
        mesh.frustumCulled = false;
        this.horizon.add(mesh);
      }
    }
  }

  /**
   * Scatter `count` copies of weighted models beside the path, `near`…`far` units off it.
   * On a slope a copy sinks by how much the ground falls across its footprint, so no side
   * floats; slopes too steep for that are skipped, and so are spots another copy stands on.
   * Models marked `flat` (pools) stay on the flat ground by the path.
   */
  private scatter(
    nodes: THREE.Object3D[],
    meshesOf: (node: THREE.Object3D) => { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[],
    count: number,
    near: number,
    far: number,
    sink: number,
    size: (far: number) => number,
  ): void {
    if (!nodes.length) return;
    const weights = nodes.map((n) => Number(n.userData.weight) || 1);
    const flat = nodes.map((n) => Boolean(n.userData.flat));
    const footprint = nodes.map((n) => {
      const box = new THREE.Box3().setFromObject(n);
      return Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    // the copies of a model go into one mesh per stretch of the path, so the stretches out
    // of sight are skipped (a mesh is drawn whole or not at all)
    const stretch = (PUZZLES_PER_MODULE + 18) / STRETCHES;
    const placed: THREE.Matrix4[][][] = nodes.map(() => Array.from({ length: STRETCHES }, () => []));
    const tints: number[][][] = nodes.map(() => Array.from({ length: STRETCHES }, () => []));
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    /** where copies stand already and how far they reach, so two don't stand in each other */
    const taken: { x: number; z: number; r: number }[] = [];
    for (let n = 0; n < count; n++) {
      let pick = this.rand() * total;
      let k = 0;
      while (k < weights.length - 1 && (pick -= weights[k]) > 0) k++;
      const i = -6 + this.rand() * (PUZZLES_PER_MODULE + 18);
      const side = this.rand() < 0.5 ? -1 : 1;
      const off = flat[k] ? near + this.rand() * Math.min(3, far - near) : near + Math.pow(this.rand(), 2) * (far - near);
      pathPoint(i, pos);
      pos.x += side * off;
      if (this.pads.some((a) => Math.hypot(a.x - pos.x, a.z - pos.z) < PAD_RADIUS + 5)) continue;
      const scale = size(off);
      const reach = footprint[k] * scale * 0.7;
      if (taken.some((t) => Math.hypot(t.x - pos.x, t.z - pos.z) < t.r + reach)) continue;
      taken.push({ x: pos.x, z: pos.z, r: reach });
      const slope = Math.hypot(this.ground(pos.x + 0.5, pos.z) - this.ground(pos.x - 0.5, pos.z), this.ground(pos.x, pos.z + 0.5) - this.ground(pos.x, pos.z - 0.5));
      if (slope > 1.1) continue;
      pos.y = this.ground(pos.x, pos.z) - sink - slope * footprint[k] * scale * 0.8;
      q.setFromEuler(new THREE.Euler((this.rand() - 0.5) * 0.06, this.rand() * Math.PI * 2, (this.rand() - 0.5) * 0.06));
      s.setScalar(scale);
      const at = Math.min(STRETCHES - 1, Math.floor((i + 6) / stretch));
      placed[k][at].push(new THREE.Matrix4().compose(pos, q, s));
      tints[k][at].push(0.82 + this.rand() * 0.3);
    }
    for (let at = this.stretches.length; at < STRETCHES; at++) {
      // the stretch's levels as distances along the path (z falls as the levels rise)
      this.stretches.push({ meshes: [], near: (at * stretch - 6) * SPACING, far: ((at + 1) * stretch - 6) * SPACING });
    }
    const m = new THREE.Matrix4();
    const tint = new THREE.Color();
    nodes.forEach((node, k) => {
      const parts = meshesOf(node);
      placed[k].forEach((matrices, at) => {
        if (!matrices.length) return;
        for (const part of parts) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
          matrices.forEach((placement, j) => {
            mesh.setMatrixAt(j, m.multiplyMatrices(placement, part.matrix));
            mesh.setColorAt(j, tint.setScalar(tints[k][at][j]));
          });
          mesh.computeBoundingSphere();
          this.scene.add(mesh);
          this.stretches[at].meshes.push(mesh);
        }
      });
    });
  }

  /** The horizon's looks: unlit vertex colours (scripts/assets/map/horizon.ts). */
  private horizonMaterials(): Record<string, THREE.Material> {
    return {
      // not tone-mapped, like the fog (three.js mixes it in after tone mapping): the foot of
      // the horizon then has exactly the colour of the fogged ground in front of it
      body: this.own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, toneMapped: false })),
      glow: this.own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, color: new THREE.Color(1.3, 1.3, 1.3) })),
    };
  }

  /** A neutral studio light (three's RoomEnvironment), prefiltered for reflections. */
  private environment(): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const texture = this.own(pmrem.fromScene(room, 0.04).texture);
    room.dispose();
    pmrem.dispose();
    return texture;
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
    if (this.lift) this.camera.setViewOffset(w, h, 0, h * this.lift, w, h);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    for (let k = this.tweens.length - 1; k >= 0; k--) if (this.tweens[k](dt)) this.tweens.splice(k, 1);

    // the camera glides after its goal along the path
    this.camAt += (this.camGoal - this.camAt) * Math.min(1, dt * (this.hopping ? 7 : 4.5));
    const focus = pathPoint(this.camAt);
    const look = pathPoint(this.camAt + this.lookAhead);
    this.camera.position.set(focus.x * 0.7 + this.lookShift, this.offset.y, focus.z + this.offset.z);
    this.camera.lookAt(look.x * 0.85 + this.lookShift, 0.6, look.z);
    this.horizon.position.set(this.camera.position.x, 0, this.camera.position.z);
    // stretches wholly behind the camera or lost in the fog ahead are not drawn
    const ahead = -this.camera.position.z;
    for (const s of this.stretches) {
      const shown = s.far + 40 > ahead && s.near < ahead + FOG_FAR + 20;
      for (const mesh of s.meshes) mesh.visible = shown;
    }

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
    this.disposed = true;
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

/** A loaded material and its textures. */
function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).dispose();
  material.dispose();
}

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
