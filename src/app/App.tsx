import { useEffect } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { MainMenu } from '../ui/MainMenu';
import { HUD } from '../ui/HUD';
import { PerfOverlay } from '../ui/PerfOverlay';
import { PauseMenu, EndScreen } from '../ui/Overlays';
import { UpgradePick, ResultsScreen } from '../ui/Run';
import { useUI } from './store';
import { pauseGame, resumeGame } from './actions';
import { setVolume, initAudio, sfx } from '../audio/sfx';
import { initMusic, setMusicVolume } from '../audio/music';
import { MusicDirector } from '../audio/MusicDirector';
import { TouchControls } from '../ui/TouchControls';
import { preferTouchControls } from '../game/core/touchDetect';

export function App() {
  const phase = useUI((s) => s.phase);
  const volume = useUI((s) => s.settings.volume);
  useEffect(() => { setVolume(volume); setMusicVolume(volume); }, [volume]);
  useEffect(() => { // global springy-click sound for every button / card
    const h = (e: PointerEvent) => { const t = e.target as HTMLElement; if (t.closest?.('button, .char-card')) { initAudio(); initMusic(); sfx.click(); } };
    document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h);
  }, []);
  useEffect(() => {
    if (preferTouchControls()) document.documentElement.dataset.touchUi = '1';
  }, []);
  useEffect(() => {
    if (phase === 'playing') document.documentElement.dataset.playing = '1';
    else delete document.documentElement.dataset.playing;
  }, [phase]);

  useEffect(() => {
    // Desktop: losing pointer lock pauses. Touch/Capacitor never uses lock — do not auto-pause.
    const onLock = () => {
      if (document.pointerLockElement) return;
      if (preferTouchControls()) return;
      pauseGame();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      const ph = useUI.getState().phase;
      if (ph === 'playing') pauseGame(); else if (ph === 'paused') resumeGame();
    };
    document.addEventListener('pointerlockchange', onLock); window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerlockchange', onLock); window.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <div className="relative w-full h-full font-cute">
      <MusicDirector />
      <GameCanvas />
      <PerfOverlay />
      {phase === 'menu' && <MainMenu />}
      {(phase === 'playing' || phase === 'upgrade') && <HUD />}
      <TouchControls />
      {phase === 'upgrade' && <UpgradePick />}
      {phase === 'results' && <ResultsScreen />}
      {phase === 'paused' && <PauseMenu />}
      {(phase === 'won' || phase === 'lost') && <EndScreen won={phase === 'won'} />}
    </div>
  );
}
