// M5 screenshots: each character's F skill in action + the perf overlay. Uses dist-e2e (window.__ps).
import { preview, launch } from './_lib.mjs';
const srv = await preview();
const { b, p, errs, ev, W, until } = await launch();
const S = (n) => p.screenshot({ path: `../screenshots/m5-${n}.png` });
const unpause = () => ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });
await p.goto(srv.url); await until(() => !!window.__ps);
await ev(() => window.__ps.useUI.getState().setSettings({ quality: 'medium', perfOverlay: false })); await W(2500);
const skills = [['mochi', 'candyDash', 250], ['bubu', 'honeyShield', 700], ['kiki', 'skill', 900], ['bolt', 'turret', 1800], ['luna', 'skill', 900], ['poppy', 'bubbleStorm', 1200]];
const out = {};
for (const [ch, name, delay] of skills) {
  await ev((ch) => { const P = window.__ps; P.actions.startGame('adventure', 1); P.useUI.setState({ character: ch }); P.runFlow.startRun('adventure', ch, 1); }, ch); // locked chars: bypass the unlock gate for screenshots
  await until(() => ['playing', 'paused'].includes(window.__ps.useUI.getState().phase)); await unpause(); await W(2500); await unpause();
  await ev(() => { const P = window.__ps, w = P.world; w.run.waveDefs = []; for (const e of w.enemies.items) e.active = false; w.cinematic = 0;
    const p = w.player.pos, f = w.cam.fwd, l = Math.hypot(f.x, f.z);
    [[4, 0], [6, 1.5], [6, -1.5], [8, 0]].forEach(([d, s]) => P.spawnEnemy(['windup', 'bunny', 'gunner', 'clown'][Math.floor(Math.random() * 4)], p.x + f.x / l * d - f.z / l * s, p.z + f.z / l * d + f.x / l * s)); });
  await W(600); await unpause();
  const before = await ev(() => window.__ps.world.stats.skillCasts);
  await p.keyboard.down('f'); await W(80); await p.keyboard.up('f');
  await W(delay); await unpause();
  out[ch] = { active: await ev(() => window.__ps.world.player.character ?? window.__ps.useUI.getState().character), casts: (await ev(() => window.__ps.world.stats.skillCasts)) - before };
  await S(`skill-${ch}`);
  await ev(() => window.__ps.actions.toMenu()); await W(800);
}
await ev(() => window.__ps.useUI.getState().setSettings({ perfOverlay: true }));
await ev(() => { const P = window.__ps; P.botHook.bot = P.createBot(); P.botHook.on = true; P.useUI.setState({ character: 'mochi' }); P.actions.startGame('survival'); });
await W(9000); await unpause(); await W(3000);
out.overlay = await p.isVisible('#perf-overlay'); await S('perf-overlay');
await ev(() => { window.__ps.botHook.on = false; window.__ps.actions.toMenu(); window.__ps.useUI.setState({ menuView: 'settings' }); }); await W(800); await S('settings-perf-toggle');
console.log(JSON.stringify(out), 'errors:', errs.slice(0, 5));
await b.close(); srv.close(); process.exit(0);
