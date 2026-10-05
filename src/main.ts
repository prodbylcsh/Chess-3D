import './style.css';
import { animator } from './core/animator';
import { Stage } from './scene/Stage';
import { loadAssets } from './scene/assets';
import { Effects } from './fx/effects';
import { Debris } from './fx/shatter';
import { BoardView } from './game/BoardView';
import { Choreographer } from './game/Choreographer';
import { Game } from './game/Game';
import { Hud } from './ui/Hud';
import { Lobby } from './ui/Lobby';
import { onlineFromEnv } from './net/online';
import { OnlineSession } from './net/session';

const hud = new Hud();
const stage = new Stage(document.getElementById('scene')!);
const fx = new Effects(stage.scene);
stage.onResize(() => fx.setViewport(stage.pixelHeight, stage.camera.fov));
stage.start((dt) => animator.update(dt));

try {
  const assets = await loadAssets(
    `${import.meta.env.BASE_URL}models/chess-set.glb`,
    stage.renderer.capabilities.getMaxAnisotropy(),
    (p) => hud.setProgress(p),
  );
  hud.setProgress(1);
  const view = new BoardView(stage.scene, assets);
  const debris = new Debris(stage.scene, () => view.pieces.values());
  const choreo = new Choreographer(view, fx, debris, stage);
  const game = new Game(stage, view, choreo, hud);
  const online = onlineFromEnv();
  const session = online ? new OnlineSession(online, game, hud, new Lobby()) : null;
  if (import.meta.env.DEV) {
    // Dev helper: step the simulation without requestAnimationFrame (hidden tabs, tests).
    Object.assign(window, {
      __chess: {
        stage,
        view,
        game,
        session,
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
  await game.start();
  await session?.boot();
} catch (err) {
  console.error(err);
  hud.showError(`Could not load the chess set: ${(err as Error).message}`);
}
