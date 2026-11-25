// npm run dev:coop  ->  vite dev server (LAN-visible) + co-op relay server in one terminal. Ctrl+C stops both.
import { spawn } from 'node:child_process';
const run = (cmd, args, tag) => {
  const c = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  c.on('exit', (code) => { if (!stopping) { console.log(`[${tag}] exited (${code})`); stop(); } });
  return c;
};
let stopping = false;
const kids = [run('node', ['server/ws-server.mjs'], 'server'), run('npx', ['vite', '--host'], 'vite')];
function stop() { stopping = true; for (const k of kids) try { k.kill(); } catch {} setTimeout(() => process.exit(0), 200); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
