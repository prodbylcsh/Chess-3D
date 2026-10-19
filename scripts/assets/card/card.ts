// Renders a piece set for its shop card: king, queen and knight of both colours on a dark,
// softly lit stage, 16:10. `?dir=pieces/<set>` (the built files in public/assets/).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const dir = new URLSearchParams(location.search).get('dir') ?? 'pieces/monolith';
const W = 1280;
const H = 800;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0e14');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
camera.position.set(0, 1.35, 4.9);
camera.lookAt(0, 0.7, -0.1);

const key = new THREE.DirectionalLight('#fff4e6', 2.6);
key.position.set(3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 6;
const rim = new THREE.DirectionalLight('#c9b8ff', 1.8);
rim.position.set(-4, 3, -4);
scene.add(key, rim, new THREE.AmbientLight('#ffffff', 0.15));

// a soft pool of light on a dark floor
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: '#0f1016', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const glow = new THREE.Mesh(
  new THREE.CircleGeometry(2.4, 64),
  new THREE.MeshBasicMaterial({ color: '#f2c27a', transparent: true, opacity: 0.06, depthWrite: false }),
);
glow.rotation.x = -Math.PI / 2;
glow.position.y = 0.002;
scene.add(glow);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const place: [string, string, number, number, number][] = [
  // piece, colour, x, z, turn
  ['knight', 'black', -1.55, -0.35, 0.5],
  ['queen', 'black', -0.75, -0.75, 0],
  ['king', 'white', 0, -0.2, 0],
  ['queen', 'white', 0.8, 0.25, 0],
  ['knight', 'white', 1.6, -0.25, -0.6],
];
await Promise.all(
  place.map(async ([piece, colour, x, z, turn]) => {
    const gltf = await loader.loadAsync(`/public/assets/${dir}/${piece}-${colour}-hd.glb`);
    const obj = gltf.scene;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    obj.position.set(x, 0, z);
    obj.rotation.y = turn + (colour === 'black' ? Math.PI : 0);
    scene.add(obj);
  }),
);
renderer.render(scene, camera);
document.body.dataset.ready = '1';
