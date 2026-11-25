/** Picks BGM from phase / world / boss. Mount once in App. */
import { useEffect, useRef } from 'react';
import { useUI } from '../app/store';
import { world } from '../game/core/world';
import { initMusic, playTrack, playStinger, setMusicVolume, setMusicEnabled, setMusicPaused, stopMusic, type MusicId } from './music';
import { initAudio } from './sfx';

function pickTrack(phase: string, boss: unknown, mapId: string): MusicId | 'stop' | 'stinger_win' | 'stinger_lose' {
  if (phase === 'menu') return 'menu';
  if (phase === 'won') return 'stinger_win';
  if (phase === 'lost') return 'stinger_lose';
  if (phase === 'results') return 'stop';
  // playing / paused / upgrade — boss bed if active
  if (boss) return 'boss';
  if (phase === 'playing' || phase === 'paused' || phase === 'upgrade') {
    return mapId === 'block' ? 'combat_block' : 'combat';
  }
  return 'menu';
}

export function MusicDirector() {
  const phase = useUI((s) => s.phase);
  const boss = useUI((s) => s.boss);
  const volume = useUI((s) => s.settings.volume);
  const musicEnabled = useUI((s) => s.settings.music !== false);
  const last = useRef<string>('');

  useEffect(() => { setMusicVolume(volume); }, [volume]);
  useEffect(() => { setMusicEnabled(musicEnabled); }, [musicEnabled]);
  useEffect(() => { setMusicPaused(phase === 'paused'); }, [phase]);

  // Unlock audio on first gesture (shares path with SFX) and kick the bed that autoplay blocked
  useEffect(() => {
    const unlock = () => {
      initAudio(); initMusic();
      last.current = '';
      const st = useUI.getState();
      if (st.settings.music === false) return;
      const want = pickTrack(st.phase, st.boss, world.mapId || 'candy');
      if (want === 'stop') return;
      if (want === 'stinger_win') { playStinger('win'); return; }
      if (want === 'stinger_lose') { playStinger('lose'); return; }
      playTrack(want);
      last.current = `${want}|${world.mapId || 'candy'}|${!!st.boss}|true`;
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    initMusic();
    const mapId = world.mapId || 'candy';
    const want = pickTrack(phase, boss, mapId);
    const key = `${want}|${mapId}|${!!boss}|${musicEnabled}`;
    if (key === last.current) return;
    last.current = key;
    if (!musicEnabled) { stopMusic(0.3); return; }
    if (want === 'stop') { stopMusic(0.6); return; }
    if (want === 'stinger_win') { playStinger('win'); return; }
    if (want === 'stinger_lose') { playStinger('lose'); return; }
    playTrack(want);
  }, [phase, boss, musicEnabled]);

  // Poll mapId / boss lightly while playing (boss spawns mid-run without always flipping phase)
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'paused' && phase !== 'upgrade') return;
    const id = window.setInterval(() => {
      const mapId = world.mapId || 'candy';
      const b = useUI.getState().boss;
      const want = pickTrack(useUI.getState().phase, b, mapId);
      const key = `${want}|${mapId}|${!!b}|${useUI.getState().settings.music !== false}`;
      if (key === last.current) return;
      last.current = key;
      if (want === 'stop' || want === 'stinger_win' || want === 'stinger_lose') return;
      if (useUI.getState().settings.music === false) return;
      playTrack(want as MusicId);
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  return null;
}
