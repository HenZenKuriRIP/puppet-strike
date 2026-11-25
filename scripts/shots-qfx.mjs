// QFX stills → docs/screenshots/qfx-*.png (fire / hit / funny kill)
// Uses world spark/blast pools for muzzle (doBurst not on __ps); doFunnyKill + damageEnemy for hit/kill.
import { launch } from './_lib.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('docs/screenshots', { recursive: true });
const out = (n) => `docs/screenshots/qfx-${n}.png`;
const port = Number(process.env.QFX_PORT || 4175);
const srv = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview timeout')), 25000);
  const on = (d) => { const s = String(d); if (s.includes('Local') || s.includes(String(port))) { clearTimeout(t); res(); } };
  srv.stdout.on('data', on); srv.stderr.on('data', on);
});
const url = `http://127.0.0.1:${port}`;
const { b, p, errs, ev, W, until } = await launch();
const S = async (n) => { await p.screenshot({ path: out(n) }); console.log('shot', n); };
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });
const cam = (pos, look, fov = 50) => ev(([pos, look, fov]) => {
  const c = window.__ps.camDebug; c.studio = true; c.on = true; c.pos = pos; c.look = look; c.fov = fov;
}, [pos, look, fov]);
const hideKeepDmg = () => ev(() => {
  const cv = document.querySelector('canvas'); const chain = new Set();
  for (let n = cv; n; n = n.parentElement) chain.add(n);
  const st = document.getElementById('shot-hide') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'shot-hide' }));
  for (const n of chain) {
    if (n === document.body || n === document.documentElement) continue;
    for (const c of n.parentElement.children) if (!chain.has(c)) c.setAttribute('data-hide', '1');
  }
  for (const el of document.querySelectorAll('.dmg')) {
    if (el.style.display !== 'none' && el.textContent) document.body.appendChild(el);
  }
  st.textContent = '[data-hide]{display:none !important} .dmg{z-index:9999}';
});
const freeze = async () => { await ev(() => window.__ps.useUI.getState().set({ phase: 'paused' })); await W(200); await hideKeepDmg(); };
const start = async (mode, stage, map) => {
  await ev(([m, s, mp]) => window.__ps.actions.startGame(m, s, mp), [mode, stage, map]);
  await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase));
  await unpause(); await W(1800); await unpause();
  await ev(() => {
    const w = window.__ps.world;
    for (const e of w.enemies.items) e.active = false;
    w.run.waveDefs = []; w.cinematic = 0;
    const pl = w.player; pl.maxHp = pl.hp = 99999; pl.invuln = 99999; pl.pos.x = 0; pl.pos.z = 8; pl.prev.x = 0; pl.prev.z = 8;
  });
};

await p.goto(url); await until(() => !!window.__ps);
await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'high', perfOverlay: false, funnyFx: true, shake: true }));
await W(1200);
await start('survival', 1, 'candy');

await cam([1.6, 1.7, 9.6], [0.15, 1.4, 7.0], 40);
await ev(() => {
  const P = window.__ps; const w = P.world; const pl = w.player;
  pl.pos.x = 0; pl.pos.y = 0; pl.pos.z = 8; pl.prev.x = 0; pl.prev.z = 8;
  pl.yaw = 0; pl.pitch = -0.04; pl.shootAnim = 1; w.muzzleFlash = 0.22;
  const cols = ['#ff66cc', '#ffee66', '#66ffcc', '#ff88aa'];
  for (let i = 0; i < 16; i++) {
    const s = w.sparks.spawnOrRecycle();
    s.pos.x = 0.4; s.pos.y = 1.5; s.pos.z = 7.2;
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, k = 5.5 * (0.4 + Math.random() * 0.8);
    const r = Math.sqrt(1 - u * u);
    s.vel.x = Math.cos(a) * r * k; s.vel.y = Math.abs(u) * k + 1; s.vel.z = Math.sin(a) * r * k;
    s.life = s.maxLife = 0.55; s.color = cols[i % cols.length]; s.size = 1.35; s.kind = 0; s.vis = 2;
  }
  for (let i = 0; i < 10; i++) {
    const s = w.sparks.spawnOrRecycle();
    s.pos.x = 0.4; s.pos.y = 1.5; s.pos.z = 7.2;
    const a = Math.random() * Math.PI * 2, k = 2.5 + Math.random() * 3;
    s.vel.x = Math.cos(a) * k; s.vel.y = 4 + Math.random() * 4; s.vel.z = Math.sin(a) * k;
    s.life = s.maxLife = 1.2; s.color = cols[i % cols.length]; s.size = 1.15; s.kind = 1; s.vis = -1;
  }
  const bl = w.blastFx.spawnOrRecycle();
  bl.pos.x = 0.4; bl.pos.y = 1.5; bl.pos.z = 7.2; bl.radius = 0.7; bl.life = bl.maxLife = 0.36; bl.color = '#ffaadd'; bl.ring = false;
});
await W(90); await freeze(); await S('fire-muzzle');
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' })); await unpause();

await cam([3.8, 2.8, 10], [0, 1.3, 2], 48);
await ev(() => {
  const P = window.__ps;
  for (const e of P.world.enemies.items) e.active = false;
  for (const s of P.world.sparks.items) s.active = false;
  for (const d of P.world.dmgNums.items) d.active = false;
  const e = P.spawnEnemy('windup', 0, 2);
  e.spawnAnim = 0; e.facing = Math.PI; e.hp = e.maxHp = 80;
  P.damageEnemy(e, 18);
});
await W(90); await freeze(); await S('hit-squash');
await ev(() => window.__ps.useUI.getState().set({ phase: 'playing' })); await unpause();

await cam([4.5, 3.2, 10], [0, 1.2, 2], 48);
await ev(() => {
  const P = window.__ps;
  for (const e of P.world.enemies.items) e.active = false;
  for (const s of P.world.sparks.items) s.active = false;
  for (const b of P.world.blastFx.items) b.active = false;
  for (const d of P.world.dmgNums.items) d.active = false;
  P.doFunnyKill(0, 1.2, 2, false, 1.35);
});
await W(100); await freeze(); await S('funny-kill');

if (errs.length) console.log('page errors', errs);
await b.close(); srv.kill();
console.log('qfx shots done');
