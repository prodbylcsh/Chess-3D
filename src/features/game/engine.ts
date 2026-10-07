// The 3D engine is created once (on the first game) and then moved in and out of
// the game screen. While no game screen is showing, rendering is paused.
import { animator } from '../../core/animator';
import { Stage } from '../../scene/Stage';
import { loadAssets } from '../../scene/assets';
import { Effects } from '../../fx/effects';
import { Debris } from '../../fx/shatter';
import { BoardView } from '../../game/BoardView';
import { Choreographer } from '../../game/Choreographer';
import { Game } from '../../game/Game';
import { Wardrobe } from '../../game/Wardrobe';
import { GameStore } from './store';
import { MODEL_URL } from './model';

export interface Engine {
  host: HTMLDivElement;
  stage: Stage;
  game: Game;
  store: GameStore;
  /** dress the next game in the players' shop items */
  wardrobe: Wardrobe;
}

let loading: Promise<Engine> | null = null;
let progressListener: (fraction: number) => void = () => {};

/** Create the engine inside `container` (first call) or return the existing one. */
export function loadEngine(container: HTMLElement, onProgress: (fraction: number) => void): Promise<Engine> {
  progressListener = onProgress;
  if (loading) return loading;

  loading = (async () => {
    const host = document.createElement('div');
    host.className = 'engine-host';
    container.append(host);

    const store = new GameStore();
    const stage = new Stage(host);
    const fx = new Effects(stage.scene);
    stage.onResize(() => fx.setViewport(stage.pixelHeight, stage.camera.fov));
    stage.onResize((w, h) => frameBesidePanel(stage, w, h));
    stage.start((dt) => animator.update(dt));

    const assets = await loadAssets(MODEL_URL, stage.renderer.capabilities.getMaxAnisotropy(), (p) => progressListener(p));
    progressListener(1);
    const view = new BoardView(stage.scene, assets);
    const debris = new Debris(stage.scene, () => view.pieces.values());
    const wardrobe = new Wardrobe(stage, fx, assets);
    view.dress = (piece) => wardrobe.dress(piece);
    const choreo = new Choreographer(view, fx, debris, stage, wardrobe);
    const game = new Game(stage, view, choreo, store);

    const engine = { host, stage, game, store, wardrobe };
    if (import.meta.env.DEV) {
      // Dev helper: step the simulation without requestAnimationFrame (hidden tabs, tests).
      Object.assign(window, {
        __chess: {
          ...engine,
          view,
          animator,
          async step(seconds: number, fps = 30) {
            for (let i = 0; i < Math.round(seconds * fps); i++) {
              stage.frame(1 / fps);
              await new Promise((r) => setTimeout(r, 0)); // let promise chains advance
            }
          },
        },
      });
    }
    return engine;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/** Width the game panel takes on the right (panel + margin), see game.css. */
const PANEL_WIDTH = 336;

/**
 * Centre the board in the area left of the side panel instead of the whole
 * window: render a wider virtual frame and show its right-hand part.
 */
function frameBesidePanel(stage: Stage, w: number, h: number): void {
  const camera = stage.camera;
  const shift = w > 820 ? PANEL_WIDTH / 2 : 0;
  if (shift) {
    camera.aspect = (w + 2 * shift) / h;
    camera.setViewOffset(w + 2 * shift, h, 2 * shift, 0, w, h);
  } else {
    camera.aspect = w / h;
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
}

export function attach(engine: Engine, container: HTMLElement): void {
  if (engine.host.parentElement !== container) container.append(engine.host);
  engine.stage.resume();
  engine.game.active = true;
}

export function detach(engine: Engine): void {
  engine.game.active = false;
  engine.stage.pause();
  engine.host.remove();
}
