// A close-up 3D look at a piece set or a board, in the item dialog (Shop, and Profile →
// your items). The player picks a piece and a colour and turns the camera around it:
// drag to rotate, scroll or pinch to zoom, right-drag (two fingers) to move.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Color as Side, PieceSymbol } from 'chess.js';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { boardLook, pieceSetLook, BOARDS } from '../../cosmetics/looks';
import { MODEL_SCALE } from '../../core/layout';
import { t, tk } from '../../i18n';
import { PIECE_TYPES, loadModel, pieceModelUrl } from '../../scene/models';
import { assetUrl } from '../../cosmetics/assets';
import { MODEL_URL } from '../game/model';
import { PieceGlyph } from '../../ui/art/art';
import type { PieceId } from '../../ui/art/pieces';
import { IconButton, Segmented, Spinner, cx } from '../../ui/kit';

const PIECE_IDS: Record<PieceSymbol, PieceId> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const PIECE_NAMES: Record<PieceSymbol, string> = {
  k: tk('King'),
  q: tk('Queen'),
  r: tk('Rook'),
  b: tk('Bishop'),
  n: tk('Knight'),
  p: tk('Pawn'),
};

const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function ModelViewer({ itemId, name, onBack }: { itemId: string; name: string; onBack: () => void }) {
  const isBoard = itemId in BOARDS;
  const [piece, setPiece] = useState<PieceSymbol>('k');
  const [side, setSide] = useState<Side>('w');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<Viewer | null>(null);

  useEffect(() => {
    const viewer = new Viewer(host.current!);
    view.current = viewer;
    return () => {
      viewer.dispose();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setState('loading');
    modelFor(itemId, isBoard, piece, side).then(
      (object) => {
        if (!live) return;
        view.current?.show(object, isBoard);
        setState('ready');
      },
      () => live && setState('error'),
    );
    return () => {
      live = false;
    };
  }, [itemId, isBoard, piece, side]);

  return (
    <div className="model-viewer">
      <header className="model-viewer-head">
        <IconButton label={t('Back')} onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <div>
          <h2 className="display">{name}</h2>
          <p className="faint">
            {touch ? t('Drag to rotate, pinch to zoom, two fingers to move.') : t('Drag to rotate, scroll to zoom, right-drag to move.')}
          </p>
        </div>
      </header>

      <div className="model-viewer-stage" ref={host}>
        {state === 'loading' && (
          <div className="model-viewer-status">
            <Spinner size={28} />
          </div>
        )}
        {state === 'error' && <div className="model-viewer-status muted">{t('The 3D model could not be loaded. Please try again.')}</div>}
        <IconButton className="model-viewer-reset" label={t('Reset view')} onClick={() => view.current?.reset()}>
          <RotateCcw size={17} />
        </IconButton>
      </div>

      {!isBoard && (
        <footer className="model-viewer-foot">
          <div className="model-viewer-pieces" role="radiogroup" aria-label={t('Piece')}>
            {PIECE_TYPES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={piece === p}
                className={cx('model-viewer-piece', piece === p && 'is-active')}
                onClick={() => setPiece(p)}
                title={t(PIECE_NAMES[p])}
              >
                <svg viewBox="0 0 100 100" aria-hidden>
                  <PieceGlyph piece={PIECE_IDS[p]} />
                </svg>
                <span>{t(PIECE_NAMES[p])}</span>
              </button>
            ))}
          </div>
          <Segmented<Side>
            label={t('Colour')}
            value={side}
            onChange={setSide}
            options={[
              { value: 'w', label: t('White') },
              { value: 'b', label: t('Black') },
            ]}
          />
        </footer>
      )}
    </div>
  );
}

/** The object to show: the detailed model of a piece or board, or a part of the classic set (also the puzzle map's piece). */
export async function modelFor(itemId: string, isBoard: boolean, piece: PieceSymbol, side: Side): Promise<THREE.Object3D> {
  if (isBoard) {
    const file = boardLook(itemId).model?.file;
    if (file) return (await loadModel(assetUrl(file))).clone();
    return classicPart('board');
  }
  const dir = pieceSetLook(itemId).model?.dir;
  if (dir) {
    const object = (await loadModel(pieceModelUrl(dir, piece, side, true))).clone();
    object.rotation.y = side === 'b' ? Math.PI : 0;
    return object;
  }
  return classicPart(`piece_${PIECE_IDS[piece]}_${side === 'w' ? 'white' : 'black'}`);
}

/** A piece or the board from the classic model (the file the game loads anyway). */
async function classicPart(prefix: string): Promise<THREE.Object3D> {
  const scene = await loadModel(MODEL_URL);
  let found: THREE.Object3D | undefined;
  scene.traverse((o) => {
    if (!found && o.name.startsWith(prefix)) found = o;
  });
  if (!found) throw new Error(`${prefix} not found`);
  const object = found.clone();
  object.position.set(0, 0, 0);
  object.scale.setScalar(MODEL_SCALE);
  // the classic model has White on -z; turn the pieces to face the viewer
  object.rotation.set(0, prefix.startsWith('piece_') ? Math.PI : 0, 0);
  const wrapper = new THREE.Group();
  wrapper.add(object);
  const box = new THREE.Box3().setFromObject(wrapper);
  object.position.y -= box.min.y;
  return wrapper;
}

/** The little 3D scene: lights, a soft floor shadow, orbit controls. */
class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 200);
  private readonly controls: OrbitControls;
  private readonly floor: THREE.Mesh;
  private readonly resize: ResizeObserver;
  private object: THREE.Object3D | null = null;
  private home = { position: new THREE.Vector3(), target: new THREE.Vector3() };

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.className = 'model-viewer-canvas';
    host.prepend(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.38;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
    key.position.set(3, 6, 4);
    const rim = new THREE.DirectionalLight(0xaabbff, 1.2);
    rim.position.set(-4, 3, -5);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x1a1410, 0.5));

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.2;
    this.controls.addEventListener('start', () => (this.controls.autoRotate = false));

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  show(object: THREE.Object3D, isBoard: boolean): void {
    if (this.object) this.scene.remove(this.object);
    this.object = object;
    this.scene.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) / 2;
    this.floor.scale.setScalar(Math.max(size.x, size.z) * (isBoard ? 1.5 : 3));
    this.floor.position.set(center.x, box.min.y + 0.001, center.z);
    // keep the angle the player chose; frame the new object
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() === 0) direction.set(0.9, isBoard ? 1.1 : 0.45, 1.6);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (isBoard ? 0.9 : 1.15);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(direction.setLength(distance));
    this.controls.minDistance = radius * 0.8;
    this.controls.maxDistance = distance * 3;
    this.camera.near = distance / 100;
    this.camera.far = distance * 10;
    this.camera.updateProjectionMatrix();
    this.home = { position: this.camera.position.clone(), target: center.clone() };
  }

  reset(): void {
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    this.controls.autoRotate = true;
  }

  private fit(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.resize.disconnect();
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.scene.environment?.dispose();
    (this.floor.material as THREE.MeshBasicMaterial).map?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function shadowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
