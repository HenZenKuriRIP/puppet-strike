// W2 screenshots (city overview, bricks close-up, each mechanic, new enemies, boss phases, world map). Uses dist-e2e (window.__ps).
// Output: /workspace/puppet-strike/screenshots/w2-*.png   Run from the project root; ONLY=a,b filters shots.
import { preview, launch } from './_lib.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots', { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const srv = await preview();
const { b, p, errs, ev, W, until } = await launch();
const S = async (n) => { if (only.length && !only.some((o) => n.startsWith(o))) return; await p.screenshot({ path: `screenshots/w2-${n}.png` }); console.log('shot', n); };
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });
const cam = (pos, look, fov = 60) => ev(([pos, look, fov]) => { const c = window.__ps.camDebug; c.on = true; c.pos = pos; c.look = look; c.fov = fov; }, [pos, look, fov]);
const clear = () => ev(() => { const w = window.__ps.world; for (const e of w.enemies.items) e.active = false; for (const q of w.projectiles.items) q.active = false; w.run.waveDefs = []; w.cinematic = 0; w.player.invuln = 999; w.player.hp = w.player.maxHp; });
await p.goto(srv.url); await until(() => !!window.__ps);
await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'high', perfOverlay: false })); await W(1500);
await ev(() => { const P = window.__ps; P.actions.startGame('survival', 1, 'block'); });
await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase)); await unpause(); await W(2500); await unpause(); await clear();
await ev(() => { const P = window.__ps; P.world.player.pos.x = 0; P.world.player.pos.z = 14; });
await cam([0, 62, 50], [0, 0, -2], 55); await W(1500); await S('city-overview');
await cam([-24, 9, 30], [-4, 3, 0], 60); await W(900); await S('city-street');
await cam([6, 2.2, 14], [10, 1.5, 8], 55); await W(900); await S('bricks-closeup');

// ---------- mechanics ----------
const godPlayer = () => ev(() => { const p = window.__ps.world.player; p.maxHp = p.hp = 99999; });
if (!only.length || only.some((o) => /^(mech|enemy)/.test(o))) {
const D = () => ev(() => { const M = window.__ps.MECH, F = M.def; return JSON.parse(JSON.stringify({ ch: M.chains.map((c) => c.def), tr: M.train && M.train.def, lf: F.lifts, po: F.portals, cv: F.conveyors, fn: F.fans, sp: window.__ps.SPRING_PADS, mt: window.__ps.MOUNTS })); });
const d = await D(); console.log('mech', JSON.stringify(d).slice(0, 600));
await godPlayer();
const near = (x, z, dx = 7, dy = 5, dz = 9, ly = 0.8, fov = 60) => cam([x + dx, dy, z + dz], [x, ly, z], fov);
if (d.tr) { const [x, z] = d.tr.path[0]; await near(x, z, 0, 14, 16, 0.5, 60); await W(700); await S('mech-train'); }
if (d.ch[0]) { const c = d.ch[0]; const ex = c.axis === 'x' ? c.x + c.sign * c.spacing * c.count / 2 : c.x, ez = c.axis === 'z' ? c.z + c.sign * c.spacing * c.count / 2 : c.z;
  await near(ex, ez, 6, 6, 8, 1, 62); await W(500); await S('mech-domino-standing');
  await ev(() => { const M = window.__ps.MECH; window.__ps.triggerDomino(M.chains[0], 0, window.__ps.world.time); }); await W(1700); await S('mech-domino-falling'); }
if (d.po[0]) { const q = d.po[0]; await near(q.a[0], q.a[1], 5, 4, 7, 1.2, 62); await W(600); await S('mech-portal-a'); await near(q.b[0], q.b[1], 5, 4, 7, 1.2, 62); await W(600); await S('mech-portal-b'); }
if (d.cv[0]) { const q = d.cv[0]; await near(q.x, q.z, 4, 6, 8, 0.2, 62); await W(600); await S('mech-conveyor'); }
if (d.lf[0]) { const q = d.lf[0]; await near(q.x, q.z, 6, 6, 9, 1.5, 62); await W(1200); await S('mech-lift'); }
if (d.fn[0]) { const q = d.fn[0]; await near(q.x, q.z, 6, 5, 8, 1.2, 62); await W(600); await S('mech-fan'); }
if (d.sp[0]) { const q = d.sp[0]; await near(q[0], q[1], 5, 4, 7, 0.5, 62); await W(600); await S('mech-spring'); }
// movable brick: shoot it a few times (pushes/splits) -> before / after
{ const k = await ev(() => { const M = window.__ps.MECH; const i = M.bricks.findIndex((b) => b.alive && b.sx > 2.5); const b = M.bricks[i]; return b ? { x: b.x, z: b.z } : null; });
  if (k) { await near(k.x, k.z, 5, 4, 7, 1, 62); await W(600); await S('mech-brick-giant');
    await ev(() => { const M = window.__ps.MECH; const b = M.bricks.find((b) => b.alive && b.sx > 2.5); if (b) window.__ps.damageEnemy && 0; }); } }
// ---------- new enemies ----------
await clear();
{ const base = d.mt && d.mt.turret[0] ? d.mt.turret[0] : [0, -6];
  await ev(() => { const P = window.__ps, w = P.world; w.player.pos.x = -14; w.player.pos.z = 24; for (const [i, t] of ['bsoldier', 'bsoldier', 'bgolem'].entries()) { const e = P.spawnEnemy(t, -4 + i * 4, 4); } for (const e of w.enemies.items) if (e.active) { e.hp = e.maxHp = 99999; } });
  await cam([2, 6.5, 17], [2, 1.6, 4], 55); await W(1800); await ev(() => { const w = window.__ps.world; for (const e of w.enemies.items) if (e.active) { e.hp = e.maxHp = 99999; } }); await W(2500); await S('enemy-soldier-golem');
  await ev(() => { for (const e of window.__ps.world.enemies.items) e.active = false; });
  const t0 = d.mt && d.mt.turret[0], c0 = d.mt && d.mt.crane[0];
  if (t0) { await ev((t) => window.__ps.spawnEnemy('bturret', t[0], t[1]), t0); await near(t0[0], t0[1], 5, 5, 8, 1.5, 58); await W(2200); await S('enemy-turret'); }
  if (c0) { await ev((t) => window.__ps.spawnEnemy('bcrane', t[0], t[1]), c0); await near(c0[0], c0[1], 8, 8, 12, 3, 60); await W(2600); await S('enemy-crane'); } }
}
// ---------- boss ----------
await clear();
await ev(() => { const P = window.__ps; P.actions.startGame('adventure', 6); });
await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase)); await unpause(); await W(900); await godPlayer();
await ev(() => { window.__ps.world.player.pos.x = 0; window.__ps.world.player.pos.z = 12; }); 
await W(1800); await S('boss-intro');
const boss = () => ev(() => { const w = window.__ps.world, e = w.enemies.items[w.boss.id]; return e ? { x: e.pos.x, z: e.pos.z, hp: e.hp, mx: e.maxHp, ph: w.boss.s.phase } : null; });
const bossCam = async (x, z, up = 7, back = 15) => { await cam([x * 0.5, up, z + back], [x, 3.8, z], 62); };
await ev(() => { const w = window.__ps.world; w.cinematic = 0; w.boss.s.intro = 0; });
await godPlayer();
const setPhase = (ph) => ev((ph) => { const w = window.__ps.world, e = w.enemies.items[w.boss.id]; e.hp = e.maxHp * (ph === 1 ? 0.95 : ph === 2 ? 0.6 : 0.25); w.boss.s.transition = 0; w.boss.s.timer = 0.1; }, ph);
let bb = await boss(); if (bb) { await bossCam(bb.x, bb.z); await W(800); await S('boss-p1'); }
for (let k = 0; k < 6; k++) { await W(500); bb = await boss(); if (bb) { await bossCam(bb.x, bb.z); } if (await ev(() => !!window.__ps.world.boss.tele)) { await W(700); await S('boss-p1-telegraph'); break; } }
await setPhase(2); await W(5200); bb = await boss(); if (bb) { await bossCam(bb.x, bb.z, 8, 17); await W(300); await S('boss-p2'); }
await W(2500); bb = await boss(); if (bb) { await bossCam(bb.x, bb.z, 8, 17); await S('boss-p2-walls'); }
await setPhase(3); await W(5200); bb = await boss(); if (bb) { await bossCam(bb.x, bb.z, 8, 17); await S('boss-p3'); }
await W(3500); bb = await boss(); if (bb) { await bossCam(bb.x, bb.z, 8, 17); await S('boss-p3-attack'); }
await ev(() => { const P = window.__ps, w = P.world, e = w.enemies.items[w.boss.id]; P.damageEnemy(e, 999999); }); await W(1500); bb = await boss(); if (bb) { await bossCam(bb.x, bb.z, 8, 17); await S('boss-defeat'); }
// ---------- world map ----------
await ev(() => { const u = window.__ps.useUI; const g = u.getState(); u.setState({ phase: 'menu', menuView: 'adventure', save: { ...g.save, progress: { ...g.save.progress, cleared: [1, 2, 3] } } }); });
await W(1500); await S('world-map');
await ev(() => { window.__ps.useUI.setState({ menuView: 'play' }); }); await W(1000); await S('survival-map-choice');
console.log('errors', errs.slice(0, 5));
await b.close(); srv.close();
