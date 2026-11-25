// POLISH screenshots: lineups + a close-up of EVERY enemy type (candy + block + bosses) and props. Uses dist-e2e (window.__ps).
// Output: screenshots/polish-*.png   ONLY=a,b filters by name prefix. PHASE_TAG=before|after prefixes names (default none).
import { preview, launch } from './_lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots', { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const tag = process.env.PHASE_TAG ? process.env.PHASE_TAG + '-' : '';
const srv = await preview();
const { b, p, errs, ev, W, until } = await launch();
const S = async (n) => { if (only.length && !only.some((o) => n.startsWith(o))) return; await hide(); await p.screenshot({ path: `screenshots/polish-${tag}${n}.png` }); console.log('shot', n); };
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });
let STUDIO = true;
const cam = (pos, look, fov = 50) => ev(([pos, look, fov, st]) => { const c = window.__ps.camDebug; c.studio = st; c.on = true; c.pos = pos; c.look = look; c.fov = fov; }, [pos, look, fov, STUDIO]);
const start = async (mode, stage, map) => {
  await ev(([m, s, mp]) => window.__ps.actions.startGame(m, s, mp), [mode, stage, map]);
  await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase)); await unpause(); await W(2200); await unpause();
  await ev(() => { const w = window.__ps.world; for (const e of w.enemies.items) if (e.type !== 'king' && e.type !== 'colossus') e.active = false; w.run.waveDefs = []; w.cinematic = 0; const p = w.player; p.maxHp = p.hp = 99999; p.invuln = 99999; p.pos.x = -33; p.pos.z = 33; });
};
/** freeze the sim (paused phase keeps rendering) and hide all DOM UI except the canvas */
const hide = () => ev(() => {
  const cv = document.querySelector('canvas'); const chain = new Set(); for (let n = cv; n; n = n.parentElement) chain.add(n);
  const st = document.getElementById('shot-hide') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'shot-hide' }));
  for (const n of chain) { if (n === document.body || n === document.documentElement) continue; for (const c of n.parentElement.children) if (!chain.has(c)) c.setAttribute('data-hide', '1'); }
  st.textContent = '[data-hide]{display:none !important}';
});
const freeze = async () => { await ev(() => window.__ps.useUI.getState().set({ phase: 'paused' })); await W(500); await hide(); };
const hold = freeze;
const place = (type, x, z, f = 0) => ev(([t, x, z, f]) => { const e = window.__ps.spawnEnemy(t, x, z); if (e) { e.spawnAnim = 0; e.facing = f; e.prev.x = x; e.prev.z = z; e.hp = e.maxHp = 99999; e.animPhase = e.id * 0.7; } return e && e.id; }, [type, x, z, f]);
const clearHeld = () => ev(() => { for (const e of window.__ps.world.enemies.items) e.active = false; });
const H = { windup: 1.7, gunner: 1.7, bunny: 1.3, tank: 1.4, drone: 0.9, clown: 1.4, gumdrop: 1.1, choco: 2.0, lolli: 1.7, mint: 1.3, jelly: 0.8, mega: 3.0, bsoldier: 1.8, bturret: 1.9, bgolem: 3.2, bcrane: 5.5 };
const R = { windup: 3.6, gunner: 3.6, bunny: 3.4, tank: 4.5, drone: 3.2, clown: 3.6, gumdrop: 3.6, choco: 6.2, lolli: 5, mint: 4.4, jelly: 2.6, mega: 9.5, bsoldier: 4.2, bturret: 5, bgolem: 8.2, bcrane: 15 };
const close = async (t, x, z, name) => { const h = H[t], d = R[t]; const y0 = await ev((t) => { const e = window.__ps.world.enemies.items.find((q) => q.active && q.type === t); return e ? e.pos.y : 0; }, t); if (t === 'bcrane') await cam([x + 17, 6.5, z - 2], [x, 2.8, z - 3.5], 52); else await cam([x + d * 0.5, y0 + h * 0.85 + d * 0.12, z - d * 0.85], [x, y0 + h * 0.42, z], 48); await W(900); await S(name || t); };

await p.goto(srv.url); await until(() => !!window.__ps);
await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'high', perfOverlay: false })); await W(1500);

// ---------- candy world ----------
await start('survival', 1, 'candy'); await hold();
const cand = ['windup', 'gunner', 'bunny', 'tank', 'drone', 'clown', 'gumdrop', 'jelly'];
const big = ['choco', 'lolli', 'mint', 'mega'];
if (!only.length || only.some((o) => /^(lineup|win|gun|bun|tan|dro|clo|gum|jel|cho|lol|min|meg)/.test(o))) {
  for (const [i, t] of cand.entries()) await place(t, -7.7 + i * 2.2, 0);
  await W(1200); await cam([0, 2.4, -13.5], [0, 0.8, 0], 40); await W(900); await S('lineup-small');
  for (const t of cand) { const i = cand.indexOf(t); await close(t, -7.7 + i * 2.2, 0); }
  await clearHeld();
  for (const [i, t] of big.entries()) await place(t, -12 + i * 8, 0);
  await W(1200); await cam([0, 6, -17], [0, 1.4, 0], 52); await W(900); await S('lineup-tanks');
  for (const t of big) { const i = big.indexOf(t); await close(t, -12 + i * 8, 0); }
  await clearHeld();
}
// ---------- candy bosses ----------
if (!only.length || only.some((o) => o === 'king' || o === 'props')) {
  await ev(() => { const w = window.__ps.world; for (const e of w.enemies.items) e.active = false; });
  await start('adventure', 3, 'candy');
  await ev(() => { const w = window.__ps.world; w.cinematic = 0; w.boss.s.intro = 0; w.player.pos.x = 0; w.player.pos.z = 15; });
  await W(1500); await hold();
  const kb = await ev(() => { const w = window.__ps.world, e = w.enemies.items[w.boss.id]; return e ? { x: e.pos.x, z: e.pos.z } : null; });
  if (kb) { await ev(() => { const w = window.__ps.world, e = w.enemies.items[w.boss.id]; e.hp = e.maxHp = 9e6; w.boss.s.timer = 9999; }); await cam([kb.x + 6, 5.5, kb.z - 11], [kb.x, 3, kb.z], 55); await W(900); await S('king'); await cam([kb.x + 5, 8, kb.z + 12], [kb.x, 3, kb.z], 55); await W(600); await S('king-back'); }
  await cam([-33, 2, 28], [-20, 0, 18], 60);
  STUDIO = false;
  // props: candy blocks / houses / pickups
  await ev(() => { const w = window.__ps.world; w.pickups.items.forEach((q) => (q.active = false)); const pk = w.pickups.spawn(); pk.kind = 'hp'; pk.pos.x = -12; pk.pos.z = 8; pk.pos.y = 0.55; pk.life = 999; pk.spot = -1; pk.age = 9; const a = w.pickups.spawn(); a.kind = 'ammo'; a.pos.x = -10.5; a.pos.z = 8; a.pos.y = 0.55; a.life = 999; a.spot = -1; a.age = 9; w.player.pos.x = -11; w.player.pos.z = 14; });
  await cam([-8, 1.6, 4.5], [-11.2, 0.7, 8], 55); await W(900); await S('props-pickups');
  await cam([0, 7, 26], [2, 1.5, 12], 62); await W(700); await S('props-blocks');
}
// ---------- block world ----------
if (!only.length || only.some((o) => /^(bs|bt|bg|bc|colossus|lineup-block)/.test(o))) {
  STUDIO = true;
  await ev(() => { const w = window.__ps.world; for (const e of w.enemies.items) e.active = false; });
  await start('survival', 1, 'block'); await hold();
  const bl = ['bsoldier', 'bturret', 'bgolem'];
  const pos = [[-6, 0], [0, 0], [7, 0]];
  for (const [i, t] of bl.entries()) await place(t, pos[i][0], pos[i][1]);
  await W(1800); await cam([0, 5, -13], [0, 1.4, 0], 54); await W(900); await S('lineup-block');
  for (const [i, t] of bl.entries()) await close(t, pos[i][0], pos[i][1]);
  await clearHeld();
  await place('bcrane', 0, 4); await W(2200); await close('bcrane', 0, 4);
  await clearHeld();
  await ev(() => window.__ps.actions.startGame('adventure', 6)); await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase)); await unpause(); await W(1800);
  await ev(() => { const w = window.__ps.world; w.cinematic = 0; w.boss.s.intro = 0; w.player.invuln = 9999; w.player.pos.x = 0; w.player.pos.z = 16; });
  await W(1500); await hold();
  const cb = await ev(() => { const w = window.__ps.world, e = w.enemies.items[w.boss.id]; if (!e) return null; e.hp = e.maxHp = 9e6; w.boss.s.timer = 9999; return { x: e.pos.x, z: e.pos.z }; });
  if (cb) { await cam([cb.x + 8, 7, cb.z - 15], [cb.x, 4.5, cb.z], 58); await W(900); await S('colossus'); await cam([cb.x + 9, 11, cb.z + 15], [cb.x, 4, cb.z], 58); await W(600); await S('colossus-back'); }
}
console.log('errors', errs.slice(0, 5));
await b.close(); srv.close();
