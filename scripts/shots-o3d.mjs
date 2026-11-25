// open-3d-skills before/after: menu + in-game shots and perf per preset (SwiftShader; relative only)
import { writeFileSync } from 'node:fs';
import { preview, launch } from './_lib.mjs';
const tag = process.argv[2] || 'after';
const srv = await preview();
const { b, p, ev, W, until, errs } = await launch();
await p.goto(srv.url); await until(() => !!window.__ps);
const out = {};
for (const q of ['low', 'medium', 'high']) {
  await ev((q) => window.__ps.useUI.getState().setSettings({ quality: q }), q); await W(2500);
  await p.screenshot({ path: `/workspace/o3d-${tag}-menu-${q}.png` });
  await ev(() => { const P = window.__ps; P.botHook.bot = P.createBot(); P.botHook.on = true; P.actions.startGame('survival'); });
  await until(() => window.__ps.useUI.getState().phase === 'playing'); await W(6000);
  const s = []; for (let i = 0; i < 5; i++) { s.push(await ev(() => ({ ...window.__ps.perfStats }))); await W(600); }
  await p.screenshot({ path: `/workspace/o3d-${tag}-game-${q}.png` });
  const avg = (k) => +(s.reduce((a, x) => a + x[k], 0) / s.length).toFixed(1);
  out[q] = { frameMs: avg('frameMs'), calls: avg('calls'), triangles: avg('triangles'), programs: s.at(-1).programs, textures: s.at(-1).textures };
  console.log(q, JSON.stringify(out[q]));
  await ev(() => { window.__ps.botHook.on = false; window.__ps.actions.toMenu(); }); await W(1000);
}
out.errors = errs.slice(0, 10);
writeFileSync(`/workspace/o3d-${tag}-perf.json`, JSON.stringify(out, null, 1));
await b.close(); srv.close(); process.exit(0);
