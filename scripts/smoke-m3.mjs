import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (n) => p.screenshot({ path: `../screenshots/m3-${n}.png` });
const ev = (f, a) => p.evaluate(f, a);
const fps = (ms = 3000) => ev((ms) => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(+(n * 1000 / (performance.now() - t0)).toFixed(1)); }; requestAnimationFrame(f); }), ms);
const setQ = async (q) => { await ev((q) => window.__ps.useUI.getState().setSettings({ quality: q }), q); await p.waitForTimeout(2500); await ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); }); await p.waitForTimeout(300); };
await p.goto('http://localhost:4173'); await p.waitForTimeout(4000);
const result = { fps: {} };
await setQ('high'); await S('menu');
result.fps.menu_high = await fps();
await p.click('#btn-chars'); await p.waitForTimeout(1500); await S('characters');
await p.click('#char-kiki'); await p.waitForTimeout(1200); await S('characters-kiki');
await p.click('#char-mochi'); await p.click('#btn-back'); await p.waitForTimeout(300);
await p.click('#btn-settings'); await p.waitForTimeout(400); await S('settings');
await p.click('#btn-settings');
await p.click('#btn-play'); await p.waitForTimeout(600);
await ev(() => { const { world: w, spawnEnemy } = window.__ps; w.waves.timer = 9999; w.player.hp = 9999; w.player.pos.z = 14; w.player.yaw = 0; w.player.pitch = -0.12;
  ['windup', 'gunner', 'bunny', 'tank', 'drone', 'clown'].forEach((t, i) => { const e = spawnEnemy(t, -5 + i * 2, 4 - Math.abs(i - 2.5) * 0.6); e.fsm.state = 'idle'; e.fsm.timer = 999; }); });
await p.waitForTimeout(1200); await S('ingame');
await S('hud');
for (const q of ['high', 'medium', 'low']) { await setQ(q); result.fps['ingame_' + q] = await fps(); }
await setQ('medium'); // FX segment at medium so the sim advances in software GL
// FX: shotgun into a cluster, then rocket
await ev(() => { const { world: w, spawnEnemy } = window.__ps; w.enemies.clear(); for (let k = 0; k < 5; k++) { const e = spawnEnemy('windup', -2 + k, 7); e.hp = 10; e.fsm.state = 'idle'; e.fsm.timer = 999; } });
await p.keyboard.press('Digit4'); await p.waitForTimeout(450);
await ev(() => { const w = window.__ps.world; const c = w.cam.pos; const tx = 0 - c.x, ty = 0.5 - c.y, tz = 7 - c.z; w.player.yaw = Math.atan2(-tx, -tz); w.player.pitch = Math.atan2(ty, Math.hypot(tx, tz)); });
await p.mouse.move(640, 360); await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
let hs = 0, shot = false; for (let k = 0; k < 30; k++) { await p.waitForTimeout(150); hs = Math.max(hs, await ev(() => window.__ps.world.hitStop)); if (!shot && await ev(() => window.__ps.world.blastFx.items.some((b) => b.active))) { await S('fx-explosion'); shot = true; } }
result.killsAfterRocket = await ev(() => window.__ps.world.kills);
await S('fx-confetti');
await ev(() => { const { world: w, spawnEnemy } = window.__ps; w.enemies.clear(); for (let k = 0; k < 3; k++) { const e = spawnEnemy('tank', -1.5 + k * 1.5, 7); e.hp = e.maxHp = 900; e.fsm.state = 'idle'; e.fsm.timer = 999; } });
await p.keyboard.press('Digit3'); await p.waitForTimeout(450);
await p.mouse.down({ button: 'right' }); await p.waitForTimeout(1500);
result.ads = await ev(() => ({ aiming: window.__ps.world.aiming, fov: document.querySelector('canvas') ? 1 : 0 }));
await p.mouse.down(); await p.waitForTimeout(400); await S('fx-muzzle-ads'); await p.mouse.up(); await p.mouse.up({ button: 'right' });
result.maxHitStop = hs;
console.log(JSON.stringify(result));
console.log('ERR', errs);
await b.close();
