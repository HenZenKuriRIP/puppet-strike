// PUPPET STRIKE LAN co-op relay: a tiny 2-player room lobby + dumb message relay (the HOST browser runs the simulation).
// Run:  npm run server        (port 8787, override with PS_PORT)
// Also serves ./dist when it exists so a guest can open http://<host-ip>:8787 after `npm run build`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // keep in sync with src/net/protocol.ts
const MAX_FRAME = 256 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json' };
const clean = (s, f = 'Player') => { const t = String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14); return t || f; };
const norm = (s) => { let o = ''; for (const c of String(s ?? '').toUpperCase()) if (ALPHABET.includes(c)) o += c; return o.slice(0, 4); };

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

export function startServer({ port = Number(process.env.PS_PORT) || 8787, host = '0.0.0.0', dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'), log = true } = {}) {
  /** @type {Map<string, {code:string, name:string, host:any, guest:any|null}>} */
  const rooms = new Map();
  const say = (...a) => { if (log) console.log('[ps-server]', ...a); };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
    if (!fs.existsSync(dist)) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('PUPPET STRIKE co-op relay is running. Open the game via `npm run dev` (http://<this-ip>:5173) or run `npm run build` to serve it from here.'); return; }
    let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(dist, rel));
    if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(buf);
    });
  });

  const wss = new WebSocketServer({ server, maxPayload: MAX_FRAME, perMessageDeflate: false });
  const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const newCode = () => { for (let n = 0; n < 200; n++) { let s = ''; for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; if (!rooms.has(s)) return s; } return null; };
  const leave = (ws) => {
    const room = ws.room; if (!room) return; ws.room = null;
    if (room.host === ws) { send(room.guest, { t: 'roomClosed' }); if (room.guest) room.guest.room = null; rooms.delete(room.code); say('room closed', room.code); }
    else if (room.guest === ws) { room.guest = null; send(room.host, { t: 'peerLeft' }); say('guest left', room.code); }
  };

  wss.on('connection', (ws) => {
    ws.alive = true; ws.room = null;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let o; try { o = JSON.parse(data.toString()); } catch { return; }
      if (!o || typeof o !== 'object') return;
      switch (o.t) {
        case 'host': {
          leave(ws); const code = newCode(); if (!code) { send(ws, { t: 'err', msg: 'no room codes left' }); return; }
          const room = { code, name: clean(o.name), host: ws, guest: null }; rooms.set(code, room); ws.room = room;
          send(ws, { t: 'hosted', code }); say('room opened', code, room.name); break;
        }
        case 'list': send(ws, { t: 'rooms', rooms: [...rooms.values()].map((r) => ({ code: r.code, name: r.name, players: r.guest ? 2 : 1, open: !r.guest })) }); break;
        case 'join': {
          const room = rooms.get(norm(o.code));
          if (!room) { send(ws, { t: 'err', msg: '房间不存在 Room not found' }); return; }
          if (room.guest) { send(ws, { t: 'err', msg: '房间已满 Room is full' }); return; }
          leave(ws); room.guest = ws; ws.room = room;
          send(ws, { t: 'joined', code: room.code, host: room.name }); send(room.host, { t: 'peer', name: clean(o.name) }); say('guest joined', room.code); break;
        }
        case 'msg': {
          const room = ws.room; if (!room || !o.d || typeof o.d !== 'object') return;
          send(room.host === ws ? room.guest : room.host, { t: 'msg', d: o.d }); break;
        }
        case 'leave': leave(ws); break;
      }
    });
    ws.on('close', () => leave(ws));
    ws.on('error', () => {});
  });
  const hb = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 10000);
  wss.on('close', () => clearInterval(hb));

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      say(`listening on ws://${host}:${actual}` + (fs.existsSync(dist) ? ' (serving dist/)' : ''));
      resolve({ port: actual, rooms, close: () => new Promise((r) => { clearInterval(hb); for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); }) });
    });
  });
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ port }) => {
    console.log('\n  PUPPET STRIKE co-op server ready (port ' + port + ')');
    for (const ip of lanAddresses()) console.log(`  LAN:  http://${ip}:5173   (game via npm run dev)   ws://${ip}:${port}`);
    console.log('  Host a room in the game menu: CO-OP → HOST.\n');
  }).catch((e) => { console.error(e.code === 'EADDRINUSE' ? `Port in use - is the server already running? (PS_PORT to change)` : e); process.exit(1); });
}
