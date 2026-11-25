/** Tiny WebAudio synth – every sound is generated, no asset files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.5;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function setVolume(v: number) { volume = v; if (master) master.gain.value = v; }

function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain = 0.3, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur: number, gain = 0.2, freq = 2000, delay = 0) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur);
}

function lowBoom(dur: number, gain: number) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur);
}

export const sfx = {
  shoot: (id = 'candySmg') => {
    if (id === 'bubbleLauncher') { tone('sine', 300, 900, 0.16, 0.2); tone('sine', 600, 1400, 0.08, 0.08, 0.05); }
    else if (id === 'rainbowShotgun') { noise(0.18, 0.4, 900); tone('square', 220, 60, 0.15, 0.18); tone('triangle', 1200, 1800, 0.1, 0.05, 0.02); }
    else if (id === 'springRocket') { tone('sine', 180, 520, 0.25, 0.25); tone('triangle', 520, 260, 0.2, 0.12, 0.05); noise(0.3, 0.15, 600); }
    else { tone('square', 880 + Math.random() * 120, 220, 0.07, 0.12); noise(0.05, 0.15, 3000); }
  },
  hit: () => tone('triangle', 1400, 900, 0.05, 0.12),
  kill: () => { tone('sine', 300, 1200, 0.18, 0.25); noise(0.12, 0.2, 1200); },
  hurt: () => { tone('sawtooth', 220, 90, 0.2, 0.2); },
  reload: () => { tone('square', 500, 480, 0.04, 0.08); tone('square', 700, 680, 0.05, 0.1, 0.25); tone('square', 900, 880, 0.05, 0.1, 1.2); },
  dry: () => tone('square', 200, 180, 0.03, 0.08),
  jump: () => tone('sine', 400, 800, 0.12, 0.12),
  windup: () => tone('triangle', 300, 900, 0.45, 0.08),
  enemyShoot: () => { tone('sine', 600, 300, 0.12, 0.12); },
  wave: () => { [523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.18, 0.18, i * 0.12)); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.25, 0.2, i * 0.15)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.3, 0.12, i * 0.2)); },
  click: () => tone('sine', 700, 900, 0.06, 0.12),
  swap: () => { tone('square', 900, 1200, 0.04, 0.07); tone('square', 1200, 1500, 0.04, 0.06, 0.06); },
  explosion: () => { lowBoom(0.7, 0.6); tone('sine', 120, 40, 0.5, 0.35); },
  bubbleHit: () => { tone('sine', 1200, 400, 0.1, 0.15); },
  pickup: (kind: number) => { const b = kind ? 740 : 660; tone('sine', b, b * 1.5, 0.12, 0.16); tone('triangle', b * 1.5, b * 2, 0.14, 0.12, 0.06); tone('sine', b * 2, b * 3, 0.16, 0.08, 0.12); },
  bubblePop: () => { tone('sine', 900, 2400, 0.08, 0.2); tone('sine', 2000, 3000, 0.05, 0.1, 0.04); },
  dash: () => { noise(0.25, 0.25, 2500); tone('sine', 300, 1500, 0.2, 0.15); },
  roll: () => { noise(0.2, 0.15, 1200); },
  combo: (tier: number) => { const base = 523 * Math.pow(1.122, tier * 2); [0, 4, 7, 12].slice(0, 2 + tier).forEach((st, i) => tone('triangle', base * Math.pow(2, st / 12), base * Math.pow(2, st / 12), 0.15, 0.18, i * 0.06)); },
  boing: () => { tone('sine', 200, 700, 0.3, 0.2); },
  land: () => { lowBoom(0.25, 0.3); },
  cannon: () => { lowBoom(0.4, 0.5); tone('square', 110, 50, 0.3, 0.2); },
  zap: () => { tone('sawtooth', 1600, 400, 0.1, 0.08); },
  fuse: () => { noise(0.8, 0.08, 5000); },
  beep: () => tone('square', 1500, 1500, 0.05, 0.08),
};
export const audioState = () => (ctx ? ctx.state : 'none');
