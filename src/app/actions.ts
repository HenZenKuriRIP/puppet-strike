import { resetWorld } from '../game/core/world';
import { input } from '../game/core/input';
import { initAudio } from '../audio/sfx';
import { initMusic } from '../audio/music';
import { useUI, initialHud } from './store';
import { startRun } from '../game/systems/runFlow';
import type { GameMode } from '../game/core/world';
import { isUnlocked } from '../game/characters/registry';
import { leaveNet } from '../net/session';
import type { WorldId } from '../game/levels/worlds';
import { preferTouchControls } from '../game/core/touchDetect';

const lock = () => {
  if (preferTouchControls()) return;
  const c = (window as any).__canvas as HTMLCanvasElement | undefined;
  try { (c?.requestPointerLock() as any)?.catch?.(() => {}); } catch { /* ignore */ }
};

/** start (or restart) a run; defaults to the last chosen mode/stage */
export function startGame(mode?: GameMode | unknown, stage?: number, map?: WorldId) {
  initAudio(); initMusic(); input.reset();
  const ui = useUI.getState();
  const m: GameMode = mode === 'survival' || mode === 'adventure' ? mode : ui.mode;
  const st = typeof stage === 'number' ? stage : ui.stage;
  const ch = isUnlocked(ui.character, ui.save.progress) ? ui.character : 'mochi';
  ui.set({ phase: 'playing', ...initialHud(), results: null, character: ch });
  const mp: WorldId = map ?? ui.save.progress.survivalMap ?? 'candy';
  startRun(m, ch, st, mp);
  lock();
}
export function pauseGame() { if (useUI.getState().phase === 'playing') { input.reset(); useUI.getState().set({ phase: 'paused' }); } }
export function resumeGame() { input.reset(); useUI.getState().set({ phase: 'playing' }); lock(); }
export function toMenu() { document.exitPointerLock?.(); leaveNet(); resetWorld(); useUI.getState().set({ phase: 'menu', banner: '', menuView: 'main', boss: null, results: null, coop: false, coopOffer: false, partner: null, hint: '', downed: false } as any); }
