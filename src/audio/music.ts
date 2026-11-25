/** Looping BGM with crossfade. OGG assets under /audio/. Side-effect free until initMusic(). */
export type MusicId = 'menu' | 'combat' | 'combat_block' | 'boss' | 'win' | 'lose';

const TRACKS: Record<MusicId, string> = {
  menu: '/audio/menu.ogg',
  combat: '/audio/combat.ogg',
  combat_block: '/audio/combat_block.ogg',
  boss: '/audio/boss.ogg',
  win: '/audio/win.ogg',
  lose: '/audio/lose.ogg',
};

const MUSIC_GAIN = 0.55;
const CROSSFADE = 0.85; // seconds
const PAUSE_DUCK = 0.4;

let ready = false;
let masterVol = 0.5;
let musicOn = true;
let current: MusicId | null = null;
let pausedDuck = false;
let fadeTimer: number | null = null;
let a: HTMLAudioElement | null = null;
let b: HTMLAudioElement | null = null;
let usingA = true;

function el(): HTMLAudioElement {
  const e = new Audio();
  e.preload = 'auto';
  e.loop = true;
  e.volume = 0;
  return e;
}

function targetVol(): number {
  if (!musicOn || masterVol <= 0) return 0;
  return Math.max(0, Math.min(1, masterVol * MUSIC_GAIN * (pausedDuck ? PAUSE_DUCK : 1)));
}

function active(): HTMLAudioElement | null { return usingA ? a : b; }
function idle(): HTMLAudioElement | null { return usingA ? b : a; }

export function initMusic() {
  if (ready || typeof Audio === 'undefined') return;
  try {
    a = el(); b = el();
    ready = true;
    const v = targetVol();
    if (a) a.volume = 0;
    if (b) b.volume = 0;
    void v;
  } catch { ready = false; }
}

export function setMusicVolume(v: number) {
  masterVol = Math.max(0, Math.min(1, v));
  applyVolumeNow();
}

export function setMusicEnabled(on: boolean) {
  musicOn = on;
  if (!on) {
    stopMusic(0.3);
  } else {
    applyVolumeNow();
  }
}

export function setMusicPaused(duck: boolean) {
  pausedDuck = duck;
  applyVolumeNow(0.25);
}

function applyVolumeNow(fade = 0) {
  const cur = active();
  if (!cur || !ready) return;
  const to = current && musicOn ? targetVol() : 0;
  if (fade <= 0 || typeof cur.volume !== 'number') { cur.volume = to; return; }
  rampVolume(cur, cur.volume, to, fade);
}

function rampVolume(audio: HTMLAudioElement, from: number, to: number, secs: number) {
  const start = performance.now();
  const ms = Math.max(16, secs * 1000);
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function clearFade() {
  if (fadeTimer != null) { clearTimeout(fadeTimer); fadeTimer = null; }
}

/** Switch to a looping track with crossfade. No-op if already playing that id. */
export function playTrack(id: MusicId, fade = CROSSFADE) {
  if (!ready) initMusic();
  if (!ready || !a || !b) return;
  if (!musicOn || masterVol <= 0) { current = id; return; }
  if (id === 'win' || id === 'lose') { playStinger(id); return; }
  if (current === id && active() && !active()!.paused) {
    applyVolumeNow(0.2);
    return;
  }
  clearFade();
  const next = idle()!;
  const prev = active();
  next.loop = true;
  next.src = TRACKS[id];
  next.currentTime = 0;
  next.volume = 0;
  const playP = next.play();
  if (playP && typeof playP.catch === 'function') playP.catch(() => { /* autoplay blocked until gesture */ });
  const to = targetVol();
  rampVolume(next, 0, to, fade);
  if (prev && current) {
    rampVolume(prev, prev.volume, 0, fade);
    fadeTimer = window.setTimeout(() => { try { prev.pause(); prev.currentTime = 0; } catch { /* */ } }, fade * 1000 + 40);
  }
  usingA = !usingA;
  current = id;
}

export function stopMusic(fade = CROSSFADE) {
  clearFade();
  const cur = active();
  if (cur) {
    rampVolume(cur, cur.volume, 0, fade);
    fadeTimer = window.setTimeout(() => { try { cur.pause(); } catch { /* */ } }, fade * 1000 + 40);
  }
  current = null;
}

/** One-shot stinger; fades out the looping bed then plays win/lose. */
export function playStinger(kind: 'win' | 'lose') {
  if (!ready) initMusic();
  if (!ready || !musicOn || masterVol <= 0) return;
  stopMusic(0.4);
  const sting = new Audio(TRACKS[kind]);
  sting.loop = false;
  sting.volume = targetVol() * 1.1;
  const p = sting.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
  current = kind;
}

export function musicState() {
  return { ready, current, volume: masterVol, enabled: musicOn, pausedDuck };
}

export const MUSIC_TRACKS = TRACKS;
