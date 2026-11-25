import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (n) => p.screenshot({ path: `../screenshots/m2-${n}.png` });
const ev = (f, a) => p.evaluate(f, a);
await p.goto('http://localhost:4173'); await p.waitForTimeout(3000);
await S('menu');
await p.click('#btn-play'); await p.waitForTimeout(400);
await ev(() => { const w = window.__ps.world; w.waves.timer = 9999; w.player.pos.z = 14; w.player.yaw = 0; w.player.pitch = -0.1; });
// gallery of all 6 enemy types (frozen in idle facing player)
await ev(() => { const { world: w, spawnEnemy } = window.__ps; const types = ['windup','gunner','bunny','tank','drone','clown'];
  types.forEach((t, i) => { const e = spawnEnemy(t, -1 + i * 2.1, 6 - Math.abs(i - 2.5) * 0.6); e.fsm.state = 'idle'; e.fsm.timer = 999; }); w.player.hp = 9999; });
await p.waitForTimeout(800); await S('enemies-all6');
// telegraphs: make them attack
await ev(() => { const w = window.__ps.world; for (const e of w.enemies.items) if (e.active) { e.fsm.state = 'attack'; e.fsm.timer = 0.6; e.target = { ...w.player.pos }; } });
await p.waitForTimeout(250); await S('enemy-telegraphs');
await ev(() => { const w = window.__ps.world; w.enemies.clear(); w.projectiles.clear(); w.player.hp = 100; });
// each weapon firing at a target dummy
const names = ['smg', 'bubble', 'shotgun', 'rocket'];
for (let i = 0; i < 4; i++) {
  await ev((i) => { const { world: w, spawnEnemy } = window.__ps; w.enemies.clear(); for (let k = 0; k < 3; k++) { const e = spawnEnemy('windup', -1.2 + k * 1.2, 6); e.hp = e.maxHp = 400; e.fsm.state = 'idle'; e.fsm.timer = 999; } w.player.hp = 9999; }, i);
  await p.keyboard.press('Digit' + (i + 1)); await p.waitForTimeout(450);
  await ev(() => { const w = window.__ps.world; const c = w.cam.pos; const tx = 0 - c.x, ty = 0.7 - c.y, tz = 6 - c.z; w.player.yaw = Math.atan2(-tx, -tz); w.player.pitch = Math.atan2(ty, Math.hypot(tx, tz)); });
  await p.mouse.move(640, 360); await p.mouse.down(); await p.waitForTimeout(i === 0 ? 350 : 220);
  await S('weapon-' + names[i]); await p.mouse.up(); await p.waitForTimeout(i === 3 ? 500 : 200);
  if (i === 3) await S('weapon-rocket-explosion');
  if (i === 1) await S('bubble-bound');
}
// TOY COMBO: bind a cluster with bubble, then rocket it -> bubble burst chain + combo callouts
await ev(() => { const { world: w, spawnEnemy } = window.__ps; w.enemies.clear(); w.blastFx.clear();
  for (let k = 0; k < 6; k++) { const e = spawnEnemy(k % 2 ? 'clown' : 'windup', -3 + k * 1.3, 5 + (k % 2) * 1.5); e.hp = 15; e.fsm.state = 'idle'; e.fsm.timer = 999; e.bound = 5; } w.player.hp = 9999; });
await p.keyboard.press('Digit4'); await p.waitForTimeout(400);
await ev(() => { const w = window.__ps.world; const c = w.cam.pos; const tx = -0.5 - c.x, ty = 0.5 - c.y, tz = 5 - c.z; w.player.yaw = Math.atan2(-tx, -tz); w.player.pitch = Math.atan2(ty, Math.hypot(tx, tz)); });
await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up();
let callout = '';
for (let k = 0; k < 10; k++) { await p.waitForTimeout(120); callout = await ev(() => document.querySelector('.callout')?.textContent || ''); if (callout) break; }
await S('combo-callout');
const st1 = await ev(() => { const w = window.__ps.world; return { kills: w.kills, combo: w.combo.count, tier: w.combo.tier, score: w.score }; });
await p.waitForTimeout(500); await S('combo-callout-2');
// dash + roll
await ev(() => { const { world: w, spawnEnemy } = window.__ps; w.enemies.clear(); const e = spawnEnemy('tank', 0, 9); e.fsm.state = 'idle'; e.fsm.timer = 999; });
await p.keyboard.down('KeyW'); await p.keyboard.press('KeyF'); await p.waitForTimeout(90); await S('dash'); await p.keyboard.up('KeyW');
await p.waitForTimeout(500); await p.keyboard.press('KeyC'); await p.waitForTimeout(150); await S('dodge-roll');
// victory pose
await ev(() => { const w = window.__ps.world; w.enemies.clear(); w.waves.index = 4; w.waves.phase = 'fighting'; w.waves.queue = []; });
await p.waitForTimeout(1200); await S('victory-pose'); await p.waitForTimeout(1500); await S('victory-screen');
console.log(JSON.stringify({ callout, st1, endText: await ev(() => document.body.innerText.slice(0, 80)) }));
console.log('ERR', errs);
await b.close();
