import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BG = new THREE.Color(0x07080b);

/**
 * Renderer, camera, orbit controls, lighting and post-processing.
 * Everything chess-specific lives elsewhere.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly timer = new THREE.Timer();
  private readonly resizeHandlers: Array<(w: number, h: number) => void> = [];
  private trauma = 0;
  private readonly shakeOffset = new THREE.Vector3();

  constructor(private readonly container: HTMLElement) {
    const { clientWidth: w, clientHeight: h } = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.05, 200);
    this.camera.position.set(0, 9, 11.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 26;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => this.clampTarget());

    this.scene.background = BG;
    this.scene.fog = new THREE.FogExp2(BG, 0.032);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();

    this.addLights();
    this.addTable();

    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.45, 2.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.timer.connect(document);
    new ResizeObserver(() => this.resize()).observe(container);
  }

  get pixelHeight(): number {
    return this.renderer.domElement.height;
  }

  onResize(fn: (w: number, h: number) => void): void {
    this.resizeHandlers.push(fn);
    fn(this.container.clientWidth, this.container.clientHeight);
  }

  /** Add screen shake; amounts accumulate and decay (0..1). */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  start(update: (dt: number) => void): void {
    this.update = update;
    this.renderer.setAnimationLoop((timestamp: number) => {
      this.timer.update(timestamp);
      this.frame(Math.min(this.timer.getDelta(), 1 / 20));
    });
  }

  private update: (dt: number) => void = () => {};

  /** Advance and render one frame (also used by the dev frame-stepper). */
  frame(dt: number): void {
    this.update(dt);
    this.controls.update(dt);
    this.applyShake(dt);
    this.composer.render(dt);
    this.camera.position.sub(this.shakeOffset);
  }

  private applyShake(dt: number): void {
    this.shakeOffset.set(0, 0, 0);
    if (this.trauma <= 0) return;
    const t = performance.now() * 0.001;
    const s = this.trauma * this.trauma * 0.22;
    this.shakeOffset.set(
      Math.sin(t * 71.3) * s + Math.sin(t * 37.1) * s * 0.5,
      Math.sin(t * 63.7 + 1.3) * s,
      Math.sin(t * 55.1 + 2.1) * s * 0.6,
    );
    this.camera.position.add(this.shakeOffset);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  private clampTarget(): void {
    const t = this.controls.target;
    const r = Math.hypot(t.x, t.z);
    if (r > 6) {
      t.x *= 6 / r;
      t.z *= 6 / r;
    }
    t.y = THREE.MathUtils.clamp(t.y, -0.5, 3);
  }

  private addLights(): void {
    // High and slightly to the side so its mirror highlight on the polished
    // marble does not point at either player's default camera.
    const key = new THREE.SpotLight(0xfff0dc, 850, 0, 0.6, 0.65, 2);
    key.position.set(-9, 15, 0.5);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 8;
    key.shadow.camera.far = 32;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.015;
    key.shadow.radius = 3;
    this.scene.add(key, key.target);

    // Kept dim: a strong directional light leaves a hard sun-glint on the polished marble.
    const rim = new THREE.DirectionalLight(0x9db4ff, 0.25);
    rim.position.set(-4, 12, -8);
    this.scene.add(rim);

    const warm = new THREE.PointLight(0xff9a4a, 14, 0, 2);
    warm.position.set(-8, 5, 6);
    this.scene.add(warm);

    this.scene.add(new THREE.HemisphereLight(0x8a9cc0, 0x1a1410, 0.55));
  }

  private addTable(): void {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#3a2c22');
    g.addColorStop(0.35, '#2a1f18');
    g.addColorStop(1, '#0a0909');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // fine grain so the table does not look like plastic
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 10;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const table = new THREE.Mesh(
      new THREE.CircleGeometry(40, 96),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0.0 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.002;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    for (const fn of this.resizeHandlers) fn(w, h);
  }
}
