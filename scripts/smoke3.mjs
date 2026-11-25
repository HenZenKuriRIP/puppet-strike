import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:4173'); await p.waitForTimeout(3000);
await p.click('#btn-play'); await p.waitForTimeout(500);
await p.evaluate(() => { const { world, spawnEnemy } = window.__ps; world.player.pos.z = 16; const a = spawnEnemy('windup', -1.2, 11.5); const g = spawnEnemy('gunner', 2.5, 7); a.fsm.state='chase'; g.fsm.state='chase'; world.player.yaw = 0; world.player.pitch = -0.12; });
await p.waitForTimeout(900);
await p.screenshot({ path: '../screenshots/04-enemies-telegraph.png' });
await p.mouse.move(640, 360); await p.mouse.down(); await p.waitForTimeout(400);
await p.screenshot({ path: '../screenshots/05-firing-hits.png' }); await p.mouse.up();
// lose screen
await p.evaluate(() => { const w = window.__ps.world; w.player.invuln = 0; w.player.hp = 1; });
await p.waitForTimeout(6000);
await p.screenshot({ path: '../screenshots/06-end-screen.png' });
console.log(await p.evaluate(() => document.body.innerText.slice(0, 200)));
await b.close();
