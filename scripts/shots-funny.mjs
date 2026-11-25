// Funny kill FX screenshots → screenshots/funny-kill-*.png
import { preview, launch } from './_lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots', { recursive: true });
const srv = await preview();
const { b, p, errs, ev, W, until } = await launch();
const S = async (n) => { await p.screenshot({ path: `screenshots/funny-kill-${n}.png` }); console.log('shot', n); };
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });
const cam = (pos, look, fov = 50) => ev(([pos, look, fov]) => { const c = window.__ps.camDebug; c.studio = true; c.on = true; c.pos = pos; c.look = look; c.fov = fov; }, [pos, look, fov]);
const start = async (mode, stage, map) => {
  await ev(([m, s, mp]) => window.__ps.actions.startGame(m, s, mp), [mode, stage, map]);
  await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase)); await unpause(); await W(1800); await unpause();
  await ev(() => {
    const w = window.__ps.world;
    for (const e of w.enemies.items) e.active = false;
    w.run.waveDefs = []; w.cinematic = 0;
    const p = w.player; p.maxHp = p.hp = 99999; p.invuln = 99999; p.pos.x = 0; p.pos.z = 8; p.prev.x = 0; p.prev.z = 8;
  });
};
/** hide menus but keep .dmg popups visible for funny text shots */
const hideKeepDmg = () => ev(() => {
  const cv = document.querySelector('canvas'); const chain = new Set(); for (let n = cv; n; n = n.parentElement) chain.add(n);
  const st = document.getElementById('shot-hide') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'shot-hide' }));
  for (const n of chain) { if (n === document.body || n === document.documentElement) continue; for (const c of n.parentElement.children) if (!chain.has(c)) c.setAttribute('data-hide', '1'); }
  // pull active funny popups to body so they survive data-hide on HUD
  for (const el of document.querySelectorAll('.dmg')) {
    if (el.style.display !== 'none' && el.textContent) document.body.appendChild(el);
  }
  st.textContent = '[data-hide]{display:none !important} .dmg{z-index:9999}';
});
const freeze = async () => { await ev(() => window.__ps.useUI.getState().set({ phase: 'paused' })); await W(200); await hideKeepDmg(); };

await p.goto(srv.url); await until(() => !!window.__ps);
await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'high', perfOverlay: false, funnyFx: true })); await W(1200);

// --- candy kill mid-explosion ---
await start('survival', 1, 'candy');
await cam([4.5, 3.2, 10], [0, 1.2, 2], 48);
await ev(() => {
  const P = window.__ps;
  const e = P.spawnEnemy('windup', 0, 2);
  e.spawnAnim = 0; e.facing = Math.PI; e.hp = e.maxHp = 30;
  P.damageEnemy(e, 9999);
});
await W(140);
await freeze(); await S('candy-mid');
// hero: force a fresh pack in front of camera (guarantees text + fragments in frame)
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' }));
await ev(() => { const P = window.__ps; for (const s of P.world.sparks.items) s.active = false; for (const b of P.world.blastFx.items) b.active = false; for (const d of P.world.dmgNums.items) d.active = false; P.doFunnyKill(0, 1.2, 2, false, 1.35); });
await W(100); await freeze(); await S('candy-hero');
await ev(() => { for (const e of window.__ps.world.enemies.items) e.active = false; for (const s of window.__ps.world.sparks.items) s.active = false; for (const b of window.__ps.world.blastFx.items) b.active = false; });
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' })); await W(200);

// multi candy pack
await unpause();
await cam([6, 4, 12], [0, 1.4, 1], 50);
await ev(() => {
  const P = window.__ps;
  for (const t of ['gunner', 'bunny', 'clown', 'gumdrop']) {
    const e = P.spawnEnemy(t, (Math.random() - 0.5) * 4, 1 + Math.random() * 3);
    e.spawnAnim = 0; P.damageEnemy(e, 9999);
  }
});
await W(200); await freeze(); await S('candy-multi');
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' }));

// tank / bigger scale
await unpause();
await cam([7, 4.5, 11], [0, 1.6, 1], 48);
await ev(() => {
  const P = window.__ps;
  for (const e of P.world.enemies.items) e.active = false;
  for (const s of P.world.sparks.items) s.active = false;
  const e = P.spawnEnemy('choco', 0, 2); e.spawnAnim = 0; P.damageEnemy(e, 99999);
});
await W(220); await freeze(); await S('candy-tank');

// --- block world ---
await start('survival', 1, 'block');
await cam([5.5, 3.8, 11], [0, 1.5, 2], 48);
await ev(() => {
  const P = window.__ps;
  const e = P.spawnEnemy('bsoldier', 0, 2); e.spawnAnim = 0; P.damageEnemy(e, 9999);
});
await W(140); await freeze(); await S('block-mid');
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' }));
await ev(() => { const P = window.__ps; for (const s of P.world.sparks.items) s.active = false; for (const b of P.world.blastFx.items) b.active = false; for (const d of P.world.dmgNums.items) d.active = false; P.doFunnyKill(0, 1.4, 2, true, 1.4); });
await W(100); await freeze(); await S('block-hero');
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' }));

await unpause();
await cam([7, 4.5, 12], [0, 1.8, 1], 50);
await ev(() => {
  const P = window.__ps;
  for (const e of P.world.enemies.items) e.active = false;
  for (const t of ['bsoldier', 'bturret', 'bgolem']) {
    const e = P.spawnEnemy(t, (Math.random() - 0.5) * 5, 1 + Math.random() * 2);
    e.spawnAnim = 0; P.damageEnemy(e, 99999);
  }
});
await W(240); await freeze(); await S('block-multi');

// toggle off = no funny pack (control shot still has confetti)
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' }));
await unpause();
await ev(() => window.__ps.useUI.getState().setSettings({ funnyFx: false }));
await cam([4.5, 3.2, 10], [0, 1.2, 2], 48);
await ev(() => {
  const P = window.__ps;
  for (const e of P.world.enemies.items) e.active = false;
  for (const s of P.world.sparks.items) s.active = false;
  for (const b of P.world.blastFx.items) b.active = false;
  for (const d of P.world.dmgNums.items) d.active = false;
  const e = P.spawnEnemy('windup', 0, 2); e.spawnAnim = 0; P.damageEnemy(e, 9999);
});
await W(180); await freeze(); await S('toggle-off');

if (errs.length) console.log('page errors', errs);
await b.close(); await srv.close();
console.log('FUNNY SHOTS OK');
