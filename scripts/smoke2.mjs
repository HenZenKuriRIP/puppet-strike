import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173'); await p.waitForTimeout(3000);
await p.click('#btn-play'); await p.waitForTimeout(4500);
// auto-aim bot: point camera yaw/pitch at nearest enemy and hold fire
const aim = () => p.evaluate(() => {
  const w = window.__ps.world, pl = w.player; let best = null, bd = 1e9;
  for (const e of w.enemies.items) if (e.active && !e.dead) { const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z); if (d < bd) { bd = d; best = e; } }
  if (!best) return null;
  const c = w.cam.pos, tx = best.pos.x - c.x, ty = best.pos.y + 0.6 - c.y, tz = best.pos.z - c.z;
  pl.yaw = Math.atan2(-tx, -tz); pl.pitch = Math.atan2(ty, Math.hypot(tx, tz)); return { d: bd, type: best.type, st: best.fsm.state };
});
await p.mouse.move(640, 360); await p.mouse.down();
let shot = false; const log = [];
for (let i = 0; i < 260; i++) {
  const r = await aim(); log.push(r && `${r.type}:${r.st}:${r.d.toFixed(1)}`);
  if (r && r.d < 9 && r.d > 4 && !shot) { await p.screenshot({ path: '../screenshots/04-ingame-combat.png' }); shot = true; }
  if (i % 25 === 24) { await p.keyboard.press('KeyR'); } if (i === 150) await p.screenshot({ path: '../screenshots/05-wave-later.png' });
  await p.waitForTimeout(150);
}
await p.mouse.up();
const st = await p.evaluate(() => { const w = window.__ps.world; return { score: w.score, hp: w.player.hp, wave: w.waves.index, phase: w.waves.phase, alive: w.enemies.countActive() }; });
await p.screenshot({ path: '../screenshots/06-after-fight.png' });
console.log(JSON.stringify(st)); console.log(log.filter((_, i) => i % 10 === 0).join(' ')); console.log('ERR', errs);
await b.close();
