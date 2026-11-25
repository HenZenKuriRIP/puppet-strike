// M5: renderer.info per quality preset + memory loop (start/restart/quit/quality switch). Headless Chromium + SwiftShader (software GL).
import { writeFileSync } from 'node:fs';
import { preview, launch } from './_lib.mjs';
const srv = await preview();
process.on('exit', () => srv.close()); process.on('uncaughtException', (e) => { console.error(e); srv.close(); process.exit(1); });
const { b, p, errs, fails, ev, W, until } = await launch();
const out = { note: 'Headless Chromium 1140 + SwiftShader software rendering @1280x720. FPS is NOT representative of a GPU.', presets: {}, memory: [] };
await p.goto(srv.url); await until(() => !!window.__ps);
const snap = () => ev(() => { const s = window.__ps.perfStats; const m = performance.memory; return { fps: +s.fps.toFixed(1), frameMs: +s.frameMs.toFixed(1), simMs: +s.simMs.toFixed(3), calls: s.calls, triangles: s.triangles, geometries: s.geometries, textures: s.textures, programs: s.programs, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, enemies: window.__ps.world.enemies.countActive() }; });
const gc = () => ev(() => window.gc?.());
const startSurvival = async () => { await ev(() => { const P = window.__ps; P.botHook.bot = P.createBot(); P.botHook.on = true; P.actions.startGame('survival'); }); await until(() => window.__ps.useUI.getState().phase === 'playing'); };
for (const q of ['low', 'medium', 'high']) {
  await ev((q) => window.__ps.useUI.getState().setSettings({ quality: q }), q); await W(2500);
  const menu = await snap();
  await startSurvival(); await W(9000);
  const samples = []; for (let i = 0; i < 6; i++) { samples.push(await snap()); await W(700); }
  const avg = (k) => +(samples.reduce((a, s) => a + s[k], 0) / samples.length).toFixed(1);
  out.presets[q] = { menu: { calls: menu.calls, triangles: menu.triangles }, gameplay: { fps: avg('fps'), frameMs: avg('frameMs'), simMs: +avg('simMs'), calls: avg('calls'), callsMax: Math.max(...samples.map((s) => s.calls)), triangles: avg('triangles'), geometries: samples.at(-1).geometries, textures: samples.at(-1).textures, programs: samples.at(-1).programs, enemies: avg('enemies') } };
  await ev(() => { window.__ps.botHook.on = false; window.__ps.actions.toMenu(); }); await W(1000);
  console.log(q, JSON.stringify(out.presets[q]));
}
if (process.env.SKIP_MEM) { writeFileSync('docs/perf-browser-after.json', JSON.stringify(out, null, 1)); process.exit(0); }
// memory loop
const quals = ['low', 'medium', 'high', 'low'];
for (let i = 0; i < 12; i++) {
  if (i % 3 === 0) { await ev((q) => window.__ps.useUI.getState().setSettings({ quality: q }), quals[(i / 3) % 4]); await W(1500); }
  await startSurvival(); await W(2500);
  await ev(() => window.__ps.actions.startGame('survival')); await W(2000);   // restart mid-run
  await ev(() => { const P = window.__ps; P.useUI.setState({ character: ['mochi', 'bubu'][Math.floor(Math.random() * 2)] }); P.actions.startGame('adventure', 3); }); await W(3000); // boss
  await ev(() => { window.__ps.botHook.on = false; window.__ps.actions.toMenu(); }); await W(1200);
  await gc(); await W(300);
  const s = await snap(); out.memory.push({ cycle: i + 1, quality: await ev(() => window.__ps.useUI.getState().settings.quality), heapMB: s.heapMB, geometries: s.geometries, textures: s.textures, programs: s.programs });
  console.log('cycle', i + 1, JSON.stringify(out.memory.at(-1)));
}
out.errors = errs; out.httpFailures = fails;
writeFileSync('docs/perf-browser.json', JSON.stringify(out, null, 1));
await b.close(); srv.close();
process.exit(0);
