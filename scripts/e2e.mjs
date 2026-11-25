// M5 e2e (Playwright-core + headless Chromium/SwiftShader) against the dist-e2e build (VITE_E2E=1 exposes window.__ps).
// Flow A: menu → survival → (bot plays) natural upgrade → pick → bot off, player dies to enemies → results.
// Flow B: menu → adventure → stage 1, cleared naturally by the scripted bot (no god mode, no forced clear).
// Also: AudioContext must be created & running with no errors; no HTTP >= 400 (favicon); no page errors.
import { mkdirSync } from 'node:fs';
import { preview, launch } from './_lib.mjs';
const srv = await preview();
const { b, p, errs, fails, ev, W, until } = await launch();
mkdirSync('../screenshots', { recursive: true });
const S = (n) => p.screenshot({ path: `../screenshots/m5-e2e-${n}.png` });
const res = []; let ok = true;
const check = (name, cond, info = '') => { res.push({ name, pass: !!cond, info }); if (!cond) ok = false; console.log(cond ? 'PASS' : 'FAIL', name, info); };
const phase = () => ev(() => window.__ps.useUI.getState().phase);
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); }); // headless: pointer lock unavailable → app auto-pauses
const waitPhase = async (ph, ms) => { const t = Date.now(); while (Date.now() - t < ms) { await unpause(); if ((await phase()) === ph) return true; await W(500); } return false; };
try {
  await p.goto(srv.url); await until(() => !!window.__ps);
  await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'low' })); await W(1500);
  check('menu visible', await p.isVisible('#btn-play'));
  // ---- Flow A
  await p.click('#btn-play'); await W(400);
  await ev(() => { const P = window.__ps; P.botHook.bot = P.createBot(); P.botHook.skill = 'good'; P.botHook.on = true; });
  await p.click('#mode-survival');
  check('A: survival started', await waitPhase('playing', 15000));
  await W(1500);
  const au = await ev(() => window.__ps.audioState());
  check('audio context running', au === 'running', au);
  check('A: natural wave upgrade offered', await waitPhase('upgrade', 240000));
  await W(800); await S('survival-upgrade');
  await p.click('#upg-0');
  check('A: resumed after pick', await waitPhase('playing', 10000));
  await ev(() => { window.__ps.botHook.on = false; }); // stand still; enemies kill the player
  check('A: player died → results', await waitPhase('results', 300000));
  await W(800); await S('survival-results');
  check('A: results panel', await p.isVisible('#results'));
  await p.click('#btn-menu', { force: true, timeout: 60000 }); await W(800);
  // ---- Flow B
  await p.click('#btn-play'); await W(400); await p.click('#mode-adventure'); await W(500);
  await ev(() => { const P = window.__ps; P.botHook.bot = P.createBot(); P.botHook.skill = 'good'; P.botHook.on = true; });
  await p.click('#stage-1');
  check('B: stage 1 started', await waitPhase('playing', 15000));
  const t0 = Date.now();
  const cleared = await waitPhase('upgrade', 600000);
  const info = await ev(() => ({ stage: window.__ps.world.run.stage, hp: Math.round(window.__ps.world.player.hp), kills: window.__ps.world.run.kills }));
  check('B: stage 1 cleared naturally by bot (stage upgrade shown)', cleared, JSON.stringify({ ...info, wallS: Math.round((Date.now() - t0) / 1000) }));
  await W(800); await S('adventure-stage1-cleared');
  await ev(() => { window.__ps.botHook.on = false; });
} catch (e) { check('no exception', false, String(e)); }
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
check('no HTTP >= 400 (favicon etc.)', fails.length === 0, fails.join(' | '));
await b.close(); srv.close();
console.log(ok ? `E2E OK (${res.length} checks)` : 'E2E FAILED');
process.exit(ok ? 0 : 1);
