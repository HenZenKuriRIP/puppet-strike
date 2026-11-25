// M6 co-op e2e: starts the real ws relay server, opens TWO separate headless Chromium browsers (host + guest),
// walks the CO-OP menu (host code → join → pick distinct chars → start) and asserts the replicated state.
import { mkdirSync, writeFileSync } from 'node:fs';
import { preview, launch } from './_lib.mjs';
import { startServer } from '../server/ws-server.mjs';
const PORT = Number(process.env.PS_PORT) || 18787;
const wss = await startServer({ port: PORT, log: false });
const srv = await preview();
mkdirSync('screenshots', { recursive: true });
const res = []; let ok = true;
const check = (name, cond, info = '') => { res.push({ name, pass: !!cond }); if (!cond) ok = false; console.log(cond ? 'PASS' : 'FAIL', name, info); };
const url = `${srv.url}/?ws=localhost:${PORT}`;
const open = async () => { const h = await launch(); await h.p.goto(url); await h.until(() => !!window.__ps); await h.ev(() => window.__ps.useUI.getState().setSettings({ quality: 'low' })); await h.W(800); return h; };
const unpause = (h) => h.ev(() => { const u = window.__ps.useUI.getState(); if (u.phase === 'paused') u.set({ phase: 'playing' }); });
const slotPos = (h, i) => h.ev((i) => { const p = window.__ps.world.slots[i]?.player; return p ? { x: p.pos.x, z: p.pos.z, dead: p.dead, hp: p.hp, yaw: p.yaw } : null; }, i);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
async function lobby(A, B, nA = 'HostHana', nB = 'GuestGigi') {
  await A.p.click('#btn-coop'); await A.p.fill('#coop-name', nA); await A.p.click('#coop-host-btn');
  await A.until(() => /^[A-Z]{4}$/.test(document.getElementById('coop-code')?.textContent ?? ''), 10000);
  const code = await A.p.textContent('#coop-code');
  await B.p.click('#btn-coop'); await B.p.fill('#coop-name', nB); await B.p.click('#coop-join-btn');
  //
  const listed = await B.until((c) => !!document.getElementById('coop-room-' + c), 8000, code);
  check('guest sees the room in the auto list', listed);
  await B.p.fill('#coop-code-input', code); await B.p.click('#coop-join-go');
  const hostReady = await A.until(() => window.__ps.useNet.getState().status === 'ready', 10000);
  const guestReady = await B.until(() => window.__ps.useNet.getState().status === 'ready', 10000);
  check('lobby: host + guest both in the room', hostReady && guestReady, code);
  const en = await A.ev(() => [...document.querySelectorAll('#coop-chars button:not([disabled])')].map((b) => b.id));
  await A.p.click('#' + en[0]); await A.W(500);
  const en2 = await B.ev(() => [...document.querySelectorAll('#coop-chars button:not([disabled])')].map((b) => b.id));
  check('guest cannot pick the host character', !en2.includes(en[0]), en[0]);
  await B.p.click('#' + en2[0]); await B.W(600);
  return { code, hostChar: en[0], guestChar: en2[0] };
}

const A = await open(), B = await open();
try {
  const L = await lobby(A, B);
  await A.p.screenshot({ path: 'screenshots/m6-coop-lobby.png' });
  await A.p.click('#coop-start-survival');
  const startedA = await A.until(() => window.__ps.useUI.getState().phase !== 'menu' && window.__ps.world.slots.length === 2, 15000);
  const startedB = await B.until(() => window.__ps.useNet.getState().status === 'playing' && window.__ps.world.slots.length === 2, 15000);
  check('both browsers entered the run', startedA && startedB);
  await unpause(A); await unpause(B); await A.W(1500);
  const chars = [await A.ev(() => window.__ps.world.slots.map((s) => s.run.character)), await B.ev(() => window.__ps.world.slots.map((s) => s.run.character))];
  check('distinct characters, same on both sides', chars[0][0] !== chars[0][1] && JSON.stringify(chars[0]) === JSON.stringify(chars[1]), JSON.stringify(chars));
  // host plays slot 0 with the scripted bot; guest walks + shoots with real keyboard/mouse input
  await A.ev(() => { const P = window.__ps; P.botHook.bot = P.createBot(); P.botHook.skill = 'good'; P.botHook.on = true; });
  const b0 = await slotPos(A, 1);
  await B.p.keyboard.down('KeyW'); await B.p.keyboard.down('KeyD');
  await B.ev(() => { window.__ps.input.mouseDown = true; });
  for (let i = 0; i < 12; i++) { await unpause(A); await unpause(B); await A.W(500); }
  const b1 = await slotPos(A, 1);
  check('guest input moves the guest player on the host', b0 && b1 && dist(b0, b1) > 3, `moved ${b0 && b1 ? dist(b0, b1).toFixed(1) : '?'}`);
  // visibility of both players in each other's state (sampled together; tolerance for interpolation delay + motion)
  const [aS0, aS1, bS0, bS1] = await Promise.all([slotPos(A, 0), slotPos(A, 1), slotPos(B, 0), slotPos(B, 1)]);
  check('guest sees the host player (replica ≈ host sim)', dist(aS0, bS0) < 5, dist(aS0, bS0).toFixed(2));
  check('host sees the guest player; guest own pos ≈ host sim', dist(aS1, bS1) < 5, dist(aS1, bS1).toFixed(2));
  await A.until(() => window.__ps.useUI.getState().score > 0, 60000); await B.until(() => window.__ps.useUI.getState().score > 0, 5000);
  const sc = await Promise.all([A.ev(() => window.__ps.useUI.getState().score), B.ev(() => window.__ps.useUI.getState().score)]);
  check('score/kills sync (bots+guest killed things, guest HUD has score)', sc[0] > 0 && sc[1] > 0 && Math.abs(sc[0] - sc[1]) < Math.max(400, sc[0] * 0.5), JSON.stringify(sc));
  const ens = await Promise.all([A, B].map((h) => h.ev(() => window.__ps.world.enemies.items.filter((e) => e.active && !e.dead).length)));
  check('enemy counts match within a few', Math.abs(ens[0] - ens[1]) <= 4 && ens[0] > 0, JSON.stringify(ens));
  await B.p.screenshot({ path: 'screenshots/m6-coop-client-view.png' });
  await A.p.screenshot({ path: 'screenshots/m6-coop-host-view.png' });
  const hud = await Promise.all([A, B].map((h) => h.ev(() => ({ partner: window.__ps.useUI.getState().partner, lag: window.__ps.useNet.getState().lag, ok: window.__ps.useNet.getState().lagOk }))));
  check('partner HUD data on both sides', !!hud[0].partner && !!hud[1].partner && hud[0].partner.name !== hud[1].partner.name, JSON.stringify(hud.map((h) => h.partner?.name)));
  check('connection status/ping available', hud[0].ok && hud[1].ok && hud[1].lag < 1000, JSON.stringify(hud.map((h) => h.lag)));
  check('partner name tag + minimap in DOM', await A.p.isVisible('#partner-hud') && await B.p.isVisible('#minimap'));
  // ---- damage + kill sync: host spawns a tank near the guest, damage it, B must see the same id with lower hp, then dead
  await B.p.keyboard.up('KeyW'); await B.p.keyboard.up('KeyD'); await B.ev(() => { window.__ps.input.mouseDown = false; });
  await A.ev(() => { window.__ps.botHook.on = false; window.__ps.input.reset(); });
  // ---- 'both players' screenshots: put the two players side by side, free camera on both pages
  await A.ev(() => { const P = window.__ps, h = P.world.slots[0].player, g = P.world.slots[1].player; g.pos.x = h.pos.x + 2.4; g.pos.z = h.pos.z; g.prev.x = g.pos.x; g.prev.z = g.pos.z; g.vel.x = 0; g.vel.z = 0; h.vel.x = 0; h.vel.z = 0; P.world.enemies.items.forEach((e) => { if (e.active) { e.dead = true; e.active = false; } }); });
  await A.W(2500);
  const camSet = (X) => X.ev(() => { const P = window.__ps, h = P.world.slots[0].player, c = P.camDebug; c.on = true; c.pos = [h.pos.x + 1.2, 2.6, h.pos.z + 6.5]; c.look = [h.pos.x + 1.2, 1.1, h.pos.z]; c.fov = 55; });
  await camSet(A); await camSet(B); await A.W(1500);
  await B.p.screenshot({ path: 'screenshots/m6-coop-client.png' });
  await A.p.screenshot({ path: 'screenshots/m6-coop-host.png' });
  await A.ev(() => { window.__ps.camDebug.on = false; }); await B.ev(() => { window.__ps.camDebug.on = false; });
  const eid = await A.ev(() => { const P = window.__ps, g = P.world.slots[1].player; P.world.enemies.items.forEach((e) => { if (e.active) { e.dead = true; e.active = false; } }); const e = P.spawnEnemy('gumdrop', g.pos.x + 6, g.pos.z + 2); e.hp = e.maxHp; return e.id; });
  await A.W(600);
  await A.ev((id) => { const P = window.__ps; P.damageEnemy(P.world.enemies.items[id], P.world.enemies.items[id].maxHp * 0.4); }, eid);
  await A.W(900);
  const hpA = await A.ev((id) => { const e = window.__ps.world.enemies.items[id]; return e.hp / e.maxHp; }, eid);
  const hpB = await B.ev((id) => { const e = window.__ps.world.enemies.items[id]; return e && e.active ? e.hp / e.maxHp : null; }, eid);
  check('damage syncs to the guest replica (enemy hp down on same id)', hpB !== null && hpB < 0.9 && hpB > 0.1, `host ${hpA} guest ${hpB}`);
  await A.ev((id) => { const P = window.__ps; P.damageEnemy(P.world.enemies.items[id], 99999); }, eid);
  await A.W(900);
  const goneB = await B.ev((id) => { const e = window.__ps.world.enemies.items[id]; return !e || !e.active || e.dead; }, eid);
  check('kill syncs to the guest (enemy removed)', goneB);
  // ---- perf snapshot (informational): 2 browsers, host with ~30 extra tank enemies; software GL so FPS is not representative
  await A.ev(() => { const P = window.__ps; P.world.slots[0].player.invuln = 90; P.world.slots[1].player.invuln = 90; const k = ['gumdrop', 'choco', 'lolli', 'mint', 'jelly', 'mega']; for (let i = 0; i < 30; i++) P.spawnEnemy(k[i % 6], -25 + (i % 10) * 5, 18 + Math.floor(i / 10) * 5); });
  await A.W(4000);
  const pf = (X) => X.ev(() => { const s = window.__ps.perfStats; return { calls: s.calls, triangles: s.triangles, fps: +s.fps.toFixed(1), simMs: +s.simMs.toFixed(3), enemies: window.__ps.world.enemies.countActive(), ping: window.__ps.useNet?.getState?.().ping ?? null }; });
  const perfOut = { note: 'Two headless Chromium pages on ONE machine (SwiftShader software GL, localhost relay). FPS is not representative of a GPU; draw calls / sim ms are.', host: await pf(A), guest: await pf(B) };
  writeFileSync('docs/perf-coop.json', JSON.stringify(perfOut, null, 1)); console.log('PERF', JSON.stringify(perfOut));
  // ---- revive: down the guest, host player walks over and holds E
  await A.ev(() => { const P = window.__ps; P.world.enemies.items.forEach((e) => { if (e.active) { e.dead = true; e.active = false; } }); P.botHook.on = false; for (let i = 0; i < 3; i++) P.spawnEnemy('windup', -30 + i * 3, 30); /* keep the wave alive: a wave clear would auto-respawn the downed player */ P.world.slots[0].player.invuln = 60; P.world.slots[1].player.invuln = 0; P.hurtPlayer(9999, 1); });
  await A.W(800);
  const dn = await Promise.all([A.ev(() => window.__ps.world.slots[1].player.dead), B.ev(() => window.__ps.world.slots[1].player.dead)]);
  const dnHud = await B.ev(() => window.__ps.useUI.getState().downed);
  check('guest downed state visible on both sides', dn[0] && dn[1] && dnHud, JSON.stringify([dn, dnHud]));
  await B.p.screenshot({ path: 'screenshots/m6-coop-downed.png' });
  await A.ev(() => { const P = window.__ps, g = P.world.slots[1].player, h = P.world.slots[0].player; h.pos.x = g.pos.x + 1; h.pos.z = g.pos.z; h.prev.x = h.pos.x; h.prev.z = h.pos.z; h.dead = false; h.invuln = 30; P.input.keys.add('KeyE'); });
  const revived = await A.until(() => !window.__ps.world.slots[1].player.dead, 20000);
  await A.ev(() => window.__ps.input.keys.delete('KeyE'));
  await A.W(600);
  const revB = await B.ev(() => !window.__ps.world.slots[1].player.dead && !window.__ps.useUI.getState().downed);
  check('hold-E revive works (host sim) and syncs to the guest', revived && revB);
  // ---- guest-side upgrade offer is private & per player
  // ---- disconnect: close the guest → host continues + shows message
  await B.b.close();
  const disc = await A.until(() => window.__ps.world.slots[1].connected === false, 8000);
  check('host detects guest disconnect and continues solo', disc);
  const msgA = await A.ev(() => window.__ps.useUI.getState().banner + '|' + (window.__ps.useUI.getState().partner?.connected));
  check('host shows disconnect info', /断线|false/.test(msgA), msgA);
  // ---- scenario 2: host leaves while a guest is in the run → guest returns to the menu with a message
  await A.ev(() => window.__ps.actions.toMenu?.()); await A.W(800);
  const C = await open();
  await A.p.reload(); await A.until(() => !!window.__ps); await A.W(800);
  const L2 = await lobby(A, C);
  await A.p.click('#coop-start-adventure');
  await C.until(() => window.__ps.useNet.getState().status === 'playing', 15000);
  await A.W(1500);
  await A.b.close();
  const back = await C.until(() => window.__ps.useUI.getState().phase === 'menu', 10000);
  const msg = await C.ev(() => window.__ps.useUI.getState().netMsg);
  check('guest returns to menu with a message when the host drops', back && !!msg, msg);
  await C.p.screenshot({ path: 'screenshots/m6-coop-disconnect.png' });
  // ---- scenario 3 (World 2): dynamic objects (bricks / dominoes / train clock / new enemy types) sync host -> guest
  await C.p.reload(); await C.until(() => !!window.__ps); await C.W(800);
  const H = await open();
  await H.ev(() => { const u = window.__ps.useUI, g = u.getState(); u.setState({ save: { ...g.save, progress: { ...g.save.progress, cleared: [1, 2, 3] } } }); }); // unlock World 2 on the host
  await lobby(H, C, 'HostBlock', 'GuestBrick');
  await H.p.selectOption('#coop-map', 'block'); await H.W(300);
  await H.p.click('#coop-start-survival');
  const s3H = await H.until(() => window.__ps.useUI.getState().phase !== 'menu' && window.__ps.world.slots.length === 2, 15000);
  const s3C = await C.until(() => window.__ps.useNet.getState().status === 'playing' && window.__ps.world.slots.length === 2, 15000);
  check('W2 co-op: both browsers entered the Block City run', s3H && s3C);
  await unpause(H); await unpause(C); await H.W(2500);
  const maps = [await H.ev(() => window.__ps.world.mapId), await C.ev(() => window.__ps.world.mapId)];
  check('W2 co-op: guest loads the block map', maps[0] === 'block' && maps[1] === 'block', JSON.stringify(maps));
  const nb = [await H.ev(() => window.__ps.MECH.bricks.filter((k) => k.alive).length), await C.ev(() => window.__ps.MECH.bricks.filter((k) => k.alive).length)];
  check('W2 co-op: same number of live bricks on both sides', nb[0] >= 4 && nb[0] === nb[1], JSON.stringify(nb));
  // host moves one brick, wrecks another and topples the first domino
  const mut = await H.ev(() => { const P = window.__ps, M = P.MECH; const alive = M.bricks.filter((k) => k.alive);
    const a = alive[0], b = alive[1]; a.x += 2.5; b.alive = false; const ch = M.chains[0]; const trig = ch ? P.triggerDomino(ch, 0, P.world.time) : false; return { a: a.slot, ax: a.x, b: b.slot, trig, ch: !!ch }; });
  await H.W(1500);
  const g = await C.ev((m) => { const M = window.__ps.MECH; return { ax: M.bricks[m.a].x, aAlive: M.bricks[m.a].alive, bAlive: M.bricks[m.b].alive, trig0: M.chains[0] ? M.chains[0].trig[0] : null }; }, mut);
  check('W2 co-op: brick position syncs to the guest', g.aAlive && Math.abs(g.ax - mut.ax) < 0.4, JSON.stringify([mut, g]));
  check('W2 co-op: destroyed brick disappears on the guest', g.bAlive === false, JSON.stringify(g));
  check('W2 co-op: domino trigger time syncs to the guest', !mut.ch || (mut.trig && g.trig0 >= 0), JSON.stringify(g));
  const clk = [await H.ev(() => window.__ps.world.time), await C.ev(() => window.__ps.world.time)];
  check('W2 co-op: shared clock (train/lifts) within 1.5 s', Math.abs(clk[0] - clk[1]) < 1.5, JSON.stringify(clk));
  await H.ev(() => { const w = window.__ps.world; w.player.invuln = 999; for (const t of ['bsoldier', 'bgolem', 'bturret', 'bcrane']) window.__ps.spawnEnemy(t, 6 + Math.random() * 4, -6); });
  await H.W(1500);
  const ty = [await H.ev(() => window.__ps.world.enemies.items.filter((e) => e.active).map((e) => e.type).sort().join(',')), await C.ev(() => window.__ps.world.enemies.items.filter((e) => e.active).map((e) => e.type).sort().join(','))];
  check('W2 co-op: new W2 enemy types replicate with the right type', /bsoldier/.test(ty[1]) && /bgolem/.test(ty[1]) && /bturret/.test(ty[1]) && /bcrane/.test(ty[1]), JSON.stringify(ty));
  await C.p.screenshot({ path: 'screenshots/w2-coop-guest.png' });
  await H.b.close();
  const errs = [...A.errs, ...B.errs, ...C.errs, ...H.errs].filter((e) => !/WebSocket|ERR_|Failed to load resource|WebGL|GPU stall|Fallback/i.test(e));
  check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await C.b.close();
} catch (e) { console.error('E2E EXCEPTION', e); ok = false; }
finally { try { srv.close(); await wss.close(); } catch {} }
console.log(ok ? 'COOP E2E OK' : 'COOP E2E FAILED', res.filter((r) => !r.pass).map((r) => r.name));
process.exit(ok ? 0 : 1);
