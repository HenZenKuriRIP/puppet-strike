import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
const cache = process.env.HOME + '/.cache/ms-playwright';
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const old = cache + '/chromium-1140/chrome-linux/chrome'; if (existsSync(old)) return old;
  try { for (const d of readdirSync(cache).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) { const p = `${cache}/${d}/chrome-headless-shell-linux64/chrome-headless-shell`; if (existsSync(p)) return p; } } catch {}
  return old;
}
export const exe = findChrome();
export async function preview(dir = 'dist-e2e', port = 4174) {
  const srv = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(port), '--strictPort'], { stdio: 'pipe' });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('preview timeout')), 20000); srv.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } }); });
  return { url: `http://localhost:${port}`, close: () => srv.kill() };
}
export async function launch() {
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [], fails = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('response', (r) => r.status() >= 400 && fails.push(r.status() + ' ' + r.url()));
  const ev = (f, a) => p.evaluate(f, a), W = (ms) => p.waitForTimeout(ms);
  const until = async (f, ms = 20000, a) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(f, a)) return true; await W(250); } return false; };
  return { b, p, errs, fails, ev, W, until };
}
