// M6 solo screenshots (map overview, minimap, candy bullets, candy tanks, HUD). Uses dist-e2e (window.__ps).
// Output: /workspace/puppet-strike/screenshots/m6-*.png (paths are relative to the project root; run from there)
import { preview, launch } from './_lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots', { recursive: true });
const srv = await preview();
const { b, p, errs, ev, W, until } = await launch();
const S = (n) => p.screenshot({ path: `screenshots/m6-${n}.png` });
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });
await p.goto(srv.url); await until(() => !!window.__ps);
await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'medium', perfOverlay: false })); await W(2000);
await S('menu');
await ev(() => { const P = window.__ps; P.actions.startGame('survival'); });
await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase)); await unpause(); await W(2500); await unpause();
const clear = () => ev(() => { const w = window.__ps.world; for (const e of w.enemies.items) e.active = false; for (const q of w.projectiles.items) q.active = false; w.run.waveDefs = []; w.cinematic = 0; w.player.invuln = 999; w.player.hp = w.player.maxHp; });
await clear();

// ---- candy bullets: a static sheet of all 10 visuals right in front of the camera, then a real firing burst
await ev(() => {
  const P = window.__ps, w = P.world, pl = w.player.pos, f = w.cam.fwd, l = Math.hypot(f.x, f.z), fx = f.x / l, fz = f.z / l;
  const cols = ['#ff7eb6', '#ffd36b', '#fff27a', '#ff5c7a', '#7fe8d0', '#ff9ec7', '#ffffff', '#d9a066', '#b58cff', '#8a5230'];
  for (let i = 0; i < 10; i++) {
    const r = Math.floor(i / 5), c = i % 5, d = 4.5 + r * 1.6, s = (c - 2) * 1.05;
    const q = w.projectiles.spawn(); if (!q) continue;
    q.pos.x = pl.x + fx * d - fz * s; q.pos.z = pl.z + fz * d + fx * s; q.pos.y = pl.y + 1.55 - r * 0.9; q.vel.x = fx * 0.01; q.vel.y = 0; q.vel.z = fz * 0.01;
    q.life = 60; q.damage = 0; q.size = 3.2; q.color = cols[i]; q.vis = i;
  }
});
await W(900); await S('bullets-sheet');
await clear();
// real weapons firing at a target dummy line (holding fire)
const weapons = await ev(() => window.__ps.world.player.arsenal.states.length).catch(() => 0);
for (let i = 0; i < 4; i++) {
  await ev((i) => { const w = window.__ps.world; w.player.arsenal.index = i % w.player.arsenal.states.length; }, i).catch(() => {});
  await p.mouse.move(640, 360); await p.mouse.down(); await W(380); await S(`bullets-fire-${i}`); await p.mouse.up(); await W(150);
}
await clear();

// ---- candy tank family (fixed-position line-up viewed with the free debug camera)
await ev(() => {
  const P = window.__ps, w = P.world;
  const types = ['gumdrop', 'choco', 'lolli', 'mint', 'jelly', 'mega'];
  types.forEach((t, i) => { const e = P.spawnEnemy(t, (i - 2.5) * 4.6, -2 + (i % 2) * 3); if (e) { e.spawnAnim = 0; e.fsm.state = 'idle'; e.fsm.timer = 99; } });
  w.player.pos.x = 0; w.player.pos.z = 18; w.player.prev.x = 0; w.player.prev.z = 18;
  const c = P.camDebug; c.on = true; c.pos = [0, 6.5, 15]; c.look = [0, 1.2, 0]; c.fov = 58;
});
await W(700); await unpause(); await S('tanks');
await ev(() => { const P = window.__ps; P.camDebug.pos = [-9, 3, 8]; P.camDebug.look = [-2, 1.2, 0]; });
await W(500); await S('tanks-closeup');
await ev(() => { const P = window.__ps; for (const e of P.world.enemies.items) if (e.active) { e.fsm.state = 'chase'; e.fsm.timer = 0; } P.world.player.invuln = 999; P.camDebug.pos = [0, 14, 22]; P.camDebug.look = [0, 0, 2]; P.camDebug.fov = 62; });
await W(3200); await unpause(); await S('tanks-fighting');
await ev(() => { window.__ps.camDebug.on = false; });
await clear();

// ---- big map: overhead overview + low angled views + minimap
await ev(() => { const w = window.__ps.world; for (let i = 0; i < 6; i++) window.__ps.spawnEnemy(['windup', 'gumdrop', 'bunny', 'jelly', 'choco', 'drone'][i], (i - 2.5) * 9, 6 + (i % 3) * 6); });
await ev(() => { const c = window.__ps.camDebug; c.on = true; c.pos = [0, 118, 62]; c.look = [0, 0, -4]; c.fov = 52; });
await W(1200); await S('map-overview');
await ev(() => { const c = window.__ps.camDebug; c.pos = [-52, 32, 52]; c.look = [0, 0, -4]; c.fov = 60; });
await W(800); await S('map-overview-angle');
await ev(() => { const c = window.__ps.camDebug; c.pos = [30, 7, -8]; c.look = [-2, 0, -20]; c.fov = 65; });
await W(800); await S('map-river-bridge');
await ev(() => { window.__ps.camDebug.on = false; });
await ev(() => { const w = window.__ps.world; w.player.pos.x = 0; w.player.pos.z = -8; w.player.prev.x = 0; w.player.prev.z = -8; w.player.yaw = 0; w.player.pitch = -0.12; w.player.arsenal.index = 0; for (const e of w.enemies.items) e.active = false; });
await W(1200); await unpause();
await S('hud-minimap');
const mm = await p.$('#minimap'); if (mm) await mm.screenshot({ path: 'screenshots/m6-minimap.png' });
console.log('errors:', errs.slice(0, 5), 'minimap:', !!mm);
await b.close(); srv.close(); process.exit(0);
