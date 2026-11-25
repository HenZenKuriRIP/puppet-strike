// Visual polish stills for 0.1.6-vis — menu + candy/block gameplay.
import { preview, launch } from './_lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('docs/screenshots', { recursive: true });
const out = (n) => `docs/screenshots/vis-${n}.png`;
const srv = await preview();
const { b, p, errs, ev, W, until } = await launch();
const hide = () => ev(() => {
  const cv = document.querySelector('canvas'); const chain = new Set();
  for (let n = cv; n; n = n.parentElement) chain.add(n);
  const st = document.getElementById('shot-hide') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'shot-hide' }));
  for (const n of chain) {
    if (n === document.body || n === document.documentElement) continue;
    for (const c of n.parentElement.children) if (!chain.has(c)) c.setAttribute('data-hide', '1');
  }
  st.textContent = '[data-hide]{display:none !important}';
});
const cam = (pos, look, fov = 50, studio = false) => ev(([pos, look, fov, studio]) => {
  const c = window.__ps.camDebug; c.on = true; c.studio = studio; c.pos = pos; c.look = look; c.fov = fov;
}, [pos, look, fov, studio]);
const S = async (n) => { await hide(); await p.screenshot({ path: out(n) }); console.log('shot', n); };
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });

await p.goto(srv.url);
await until(() => !!window.__ps);
await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'high', perfOverlay: false, postFX: true }));
await W(1800);
await S('menu-high');

await ev(() => window.__ps.useUI.getState().set({ menuView: 'characters' }));
await W(1200);
await S('menu-chars-high');

await ev(() => window.__ps.actions.startGame('survival', 1, 'candy'));
await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase));
await unpause(); await W(2200); await unpause();
await ev(() => {
  const w = window.__ps.world;
  for (const e of w.enemies.items) if (e.type !== 'king' && e.type !== 'colossus') e.active = false;
  w.run.waveDefs = []; w.cinematic = 0;
  const pl = w.player; pl.maxHp = pl.hp = 99999; pl.invuln = 99999; pl.pos.x = 0; pl.pos.z = 12;
  // sprinkle candy bullets for bloom glow
  for (let i = 0; i < 8; i++) {
    const pr = w.projectiles.spawn();
    pr.pos.x = -4 + i; pr.pos.y = 1.2; pr.pos.z = 6;
    pr.vel.x = 0; pr.vel.y = 0; pr.vel.z = -18;
    pr.color = ['#ff6b8b', '#ffd166', '#7ee8a2', '#7fc8ff'][i % 4];
    pr.size = 1.4; pr.vis = i % 6; pr.life = 999;
  }
});
await ev(() => window.__ps.useUI.getState().set({ phase: 'paused' }));
await W(700);
await cam([18, 14, 28], [0, 1, 0], 55, false); await W(900); await S('candy-overview-high');
await cam([8, 3.2, 18], [0, 1.2, 4], 48, false); await W(800); await S('candy-plaza-high');
await cam([10, 3.5, -2], [0, 0.3, -12], 50, false); await W(800); await S('candy-river-high');
await cam([2.5, 1.9, 8], [0, 1.1, 12], 42, false); await W(800); await S('candy-player-high');

// block city quick overview
await ev(() => { window.__ps.camDebug.on = false; window.__ps.actions.startGame('survival', 1, 'block'); });
await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase));
await unpause(); await W(2200); await unpause();
await ev(() => {
  const w = window.__ps.world;
  for (const e of w.enemies.items) e.active = false;
  w.run.waveDefs = []; w.cinematic = 0;
  const pl = w.player; pl.maxHp = pl.hp = 99999; pl.invuln = 99999; pl.pos.x = 0; pl.pos.z = 10;
});
await ev(() => window.__ps.useUI.getState().set({ phase: 'paused' }));
await W(600);
await cam([22, 16, 26], [0, 2, 0], 58, false); await W(900); await S('block-overview-high');

// medium quality vignette-only reference (same candy plaza angle after restart candy)
await ev(() => {
  window.__ps.camDebug.on = false;
  window.__ps.useUI.getState().setSettings({ quality: 'medium', postFX: true });
});
await W(1500);
await ev(() => window.__ps.actions.startGame('survival', 1, 'candy'));
await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase));
await unpause(); await W(1800); await unpause();
await ev(() => {
  const w = window.__ps.world;
  for (const e of w.enemies.items) e.active = false;
  w.run.waveDefs = []; w.cinematic = 0;
});
await ev(() => window.__ps.useUI.getState().set({ phase: 'paused' }));
await W(500);
await cam([8, 3.2, 18], [0, 1.2, 4], 48, false); await W(800); await S('candy-plaza-medium');

console.log('errs', errs.slice(0, 12));
await b.close(); srv.close();
console.log('VIS SHOTS DONE');
