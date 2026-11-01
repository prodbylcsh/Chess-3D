// Renders original models side by side (scripts/assets/look/index.html). Every cell uses the
// same scale, so sizes compare; `view=side` looks from +x (−z is to the right: a knight that
// looks right faces −z, the way the build wants), `front` from +z, `top` from above (−z up)
// with a ruler in model units, to measure a board's 8×8 grid.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const q = new URLSearchParams(location.search);
// several views (`view=side,front`) give each file one cell per view
const views = (q.get('view') ?? 'side').split(',');
const files = (q.get('files') ?? '').split(',').filter(Boolean).flatMap((f) => views.map(() => f));
const viewOf = (i: number) => views[i % views.length];
const view = views[0];
const cols = Number(q.get('cols') ?? Math.min(6, files.length));
const W = Number(q.get('w') ?? 1500);
// `fit=each`: every cell scaled to its own model (shapes, not sizes)
const fitEach = q.get('fit') === 'each';
const rows = Math.ceil(files.length / cols);
const cell = Math.floor(W / cols);
const H = view === 'top' ? cell * rows : Math.round(cell * 1.4) * rows;
const cellH = H / rows;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const unique = [...new Set(files)];
const models = await Promise.all(
  unique.map((f) =>
    loader.loadAsync(`/${f}`).then(
      (g) => g.scene,
      (e) => (console.log('load failed', f, e.message), null),
    ),
  ),
);
const loaded = files.map((f) => models[unique.indexOf(f)]);
const boxes = loaded.map((o) => (o ? new THREE.Box3().setFromObject(o) : null));
// one scale for all: the largest extent shown in a cell
const extentOf = (b: THREE.Box3 | null, v = view) => {
  if (!b) return 0;
  const s = b.getSize(new THREE.Vector3());
  return v === 'top' ? Math.max(s.x, s.z) : Math.max(s.y, s.x, s.z);
};
const largest = Math.max(...boxes.map(extentOf));
const info: Record<string, unknown>[] = [];

loaded.forEach((original, i) => {
  const view = viewOf(i);
  const obj = original && views.length > 1 ? original.clone() : original;
  const x = (i % cols) * cell;
  const y = Math.floor(i / cols) * cellH;
  const label = document.createElement('div');
  label.className = 'label';
  label.style.left = `${x}px`;
  label.style.width = `${cell}px`;
  label.style.top = `${y + 4}px`;
  label.textContent = `${files[i].split('/').pop()!}${views.length > 1 ? ` · ${view}` : ''}`;
  document.body.appendChild(label);
  if (!obj) return;
  const b = boxes[i]!;
  const c = b.getCenter(new THREE.Vector3());
  const s = b.getSize(new THREE.Vector3());
  info.push({ file: files[i], min: b.min.toArray().map((v) => +v.toFixed(3)), max: b.max.toArray().map((v) => +v.toFixed(3)) });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(i % 2 ? '#22252e' : '#1e2129');
  scene.environment = env;
  scene.environmentIntensity = 0.8;
  const key = new THREE.DirectionalLight('#ffffff', 2);
  key.position.set(3, 6, 4);
  scene.add(key, new THREE.AmbientLight('#ffffff', 0.3), obj);
  const extent = fitEach ? extentOf(b, view) : largest;
  const half = (extent / 2) * 1.08;
  const aspect = cell / cellH;
  const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, -1000, 1000);
  if (view === 'top') {
    // exact: the model's x/z → pixels, so a grid can be measured from the picture
    cam.position.set(c.x, b.max.y + 10, c.z);
    cam.up.set(0, 0, -1);
    cam.lookAt(c.x, 0, c.z);
    // ruler: lines every 1/10 of the extent, labelled in model units
    const step = Math.pow(10, Math.floor(Math.log10(extent / 4)));
    const pts: number[] = [];
    for (let v = Math.ceil((c.x - half) / step) * step; v < c.x + half; v += step) pts.push(v, b.max.y + 1, c.z - half, v, b.max.y + 1, c.z + half);
    for (let v = Math.ceil((c.z - half) / step) * step; v < c.z + half; v += step) pts.push(c.x - half, b.max.y + 1, v, c.x + half, b.max.y + 1, v);
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ff3366', transparent: true, opacity: 0.35 })));
    info[info.length - 1].ruler = { step, view: [c.x - half * aspect, c.z - half, c.x + half * aspect, c.z + half], px: [cell, cellH] };
  } else {
    const ty = b.min.y + half * 0.95;
    if (view === 'side') cam.position.set(c.x + 100, ty, c.z);
    else cam.position.set(c.x, ty, c.z + 100);
    cam.lookAt(view === 'side' ? c.x : c.x, ty, c.z);
  }
  cam.updateProjectionMatrix();
  const label2 = document.createElement('div');
  label2.className = 'label';
  label2.style.left = `${x}px`;
  label2.style.width = `${cell}px`;
  label2.style.top = `${y + cellH - 20}px`;
  label2.textContent = `${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)}`;
  document.body.appendChild(label2);
  renderer.setViewport(x, H - y - cellH, cell, cellH);
  renderer.setScissor(x, H - y - cellH, cell, cellH);
  renderer.render(scene, cam);
});
(window as unknown as { info: unknown }).info = info;
document.body.dataset.ready = '1';
