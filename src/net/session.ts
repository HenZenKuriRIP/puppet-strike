/** M6 LAN co-op session: lobby (via the relay server), host loop (authoritative sim + snapshots) and client loop (interpolated replica). */
import { world, resetWorld, setupSlots, enterWorld } from '../game/core/world';
import type { WorldId } from '../game/levels/worlds';
import { input, createRemoteInput, InputLike } from '../game/core/input';
import { evq, NetEv } from '../game/core/events';
import { COOP } from '../config/game';
import { CHARACTERS, CharacterId } from '../game/characters/registry';
import { getStage } from '../game/progression/adventure';
import { runHooks, startCoopRun, chooseUpgradeFor } from '../game/systems/runFlow';
import { applyUiPatch, doBurst, doConfetti, doPuff, doDmgNumber, doBlast, doTracer, doSfx, doFunnyKill } from '../game/systems/fx';
import { v3 } from '../game/core/math';
import { useUI, initialHud } from '../app/store';
import { useNet } from './netStore';
import { encode, parseS2C, GameMsg, GameMode, EndResults, SnapWire, normCode, cleanName } from './protocol';
import { SnapBuffer, RenderClock } from './interp';
import { buildSnapshot, decodeSnap, Snap, applySample, smoothOwn, stepFxClient } from './snapshot';

export const net = {
  ws: null as WebSocket | null,
  role: 'none' as 'none' | 'host' | 'client',
  inRoom: false, playing: false,
  buf: new SnapBuffer<Snap>(30), clock: new RenderClock(COOP.interpDelay),
  remoteIn: null as InputLike | null, lastIn: 0,
  snapAcc: 0, seq: 0, inAcc: 0, inN: 0, pingAcc: 0, pingN: 0, rtt: 0, lastSnapRecv: 0,
  pressedAcc: new Set<string>(), wheelAcc: 0, evQ: [] as NetEv[],
  stats: { snapsSent: 0, snapsRecv: 0, inSent: 0, inRecv: 0, bytesSent: 0, bytesRecv: 0, lastSnapBytes: 0 },
  results: null as EndResults | null,
};
const nowS = () => performance.now() / 1000;

export function wsUrl(): string {
  try { const q = new URLSearchParams(location.search).get('ws'); if (q && /^[\w.:-]+$/.test(q)) return `ws://${q.includes(':') ? q : q + ':' + COOP.wsPort}`; } catch { /* ignore */ }
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:${COOP.wsPort}`;
}
export const lanUrlHint = () => `http://${location.hostname || '<host-ip>'}:${location.port || '5173'}`;

const setNet = (p: Parameters<ReturnType<typeof useNet.getState>['set']>[0]) => { if ((p as any).role) net.role = (p as any).role; useNet.getState().set(p); };
function sendRaw(o: object) { const w = net.ws; if (w && w.readyState === 1) { const s = encode(o as any); net.stats.bytesSent += s.length; w.send(s); } }
export const sendGame = (d: GameMsg | Record<string, unknown>) => sendRaw({ t: 'msg', d });

// ------------------------------------------------------------------ connection / lobby
function openSocket(onOpen: () => void) {
  closeSocket();
  setNet({ status: 'connecting', error: '' });
  let ws: WebSocket;
  try { ws = new WebSocket(wsUrl()); } catch { setNet({ status: 'error', error: '无法连接服务器 (ws)' }); return; }
  net.ws = ws;
  ws.onopen = () => { if (net.ws === ws) { setNet({ status: 'lobby' }); onOpen(); } };
  ws.onmessage = (ev) => { if (net.ws !== ws) return; const raw = typeof ev.data === 'string' ? ev.data : ''; net.stats.bytesRecv += raw.length; const m = parseS2C(raw); if (m) onServerMsg(m, raw.length); };
  ws.onerror = () => { if (net.ws === ws && !net.playing) setNet({ status: 'error', error: `连接服务器失败：请先运行 npm run server（${wsUrl()}）` }); };
  ws.onclose = () => { if (net.ws !== ws) return; net.ws = null; onDisconnected('与服务器的连接已断开'); };
}
function closeSocket() { const w = net.ws; net.ws = null; if (w) { try { w.onclose = null as any; w.close(); } catch { /* ignore */ } } }

function onServerMsg(m: ReturnType<typeof parseS2C> & object, len: number) {
  switch (m.t) {
    case 'hosted': net.inRoom = true; setNet({ code: m.code, status: 'waiting', role: 'host' }); break;
    case 'rooms': setNet({ rooms: m.rooms }); break;
    case 'joined': net.inRoom = true; setNet({ code: m.code, status: 'ready', role: 'client', partnerName: m.host }); sendGame({ k: 'pick', ch: useNet.getState().myChar }); break;
    case 'peer': setNet({ partnerName: m.name, status: 'ready' }); sendGame({ k: 'pick', ch: useNet.getState().myChar }); break;
    case 'peerLeft': if (net.playing && net.role === 'host') hostPeerLeft(); else setNet({ partnerName: '', partnerChar: '', status: 'waiting' }); break;
    case 'roomClosed': onDisconnected('房主已离开房间 Host left the room'); break;
    case 'err': setNet({ error: m.msg, status: net.inRoom ? useNet.getState().status : 'lobby' }); break;
    case 'msg': onGameMsg(m.d, len); break;
  }
}

export function listRooms() {
  const st = useNet.getState();
  if (net.ws && net.ws.readyState === 1) { sendRaw({ t: 'list' }); return; }
  if (st.status === 'connecting') return;
  openSocket(() => sendRaw({ t: 'list' }));
}
export function hostRoom(name: string) {
  setNet({ role: 'host', myName: cleanName(name), partnerName: '', partnerChar: '' });
  const go = () => sendRaw({ t: 'host', name: cleanName(name) });
  if (net.ws && net.ws.readyState === 1) go(); else openSocket(go);
}
export function joinRoom(code: string, name: string) {
  setNet({ role: 'client', myName: cleanName(name), partnerChar: '', error: '' });
  const go = () => sendRaw({ t: 'join', code: normCode(code), name: cleanName(name) });
  if (net.ws && net.ws.readyState === 1) go(); else openSocket(go);
}
export function pickChar(ch: string) { setNet({ myChar: ch }); if (net.inRoom) sendGame({ k: 'pick', ch }); }
/** leave lobby / game and drop the socket */
export function leaveNet() {
  if (net.ws && net.ws.readyState === 1) sendRaw({ t: 'leave' });
  closeSocket(); resetNetRuntime();
  setNet({ status: 'idle', role: 'none', code: '', partnerName: '', partnerChar: '', chars: [], rooms: [] });
}
function resetNetRuntime() {
  net.inRoom = false; net.playing = false; net.role = 'none'; net.buf.clear(); net.clock = new RenderClock(COOP.interpDelay); net.remoteIn = null; net.evQ.length = 0;
  net.pressedAcc.clear(); net.wheelAcc = 0; net.snapAcc = net.inAcc = net.pingAcc = 0; evq.recording = false; runHooks.finish = null; runHooks.pick = null;
}

/** connection lost / room closed / server gone */
function onDisconnected(msg: string) {
  const wasPlaying = net.playing, wasClient = net.role === 'client';
  if (net.playing && net.role === 'host') return; // host keeps playing solo; handled by peerLeft
  closeSocket(); resetNetRuntime();
  setNet({ status: 'idle', role: 'none', code: '', partnerName: '', partnerChar: '', chars: [], rooms: [] });
  if (wasPlaying || wasClient) {
    resetWorld(); try { document.exitPointerLock?.(); } catch { /* */ }
    useUI.getState().set({ phase: 'menu', menuView: 'main', coop: false, coopOffer: false, boss: null, results: null, banner: '', partner: null, netMsg: msg } as any);
  } else useUI.getState().set({ netMsg: msg } as any);
}

// ------------------------------------------------------------------ game messages
function onGameMsg(d: GameMsg, len: number) {
  switch (d.k) {
    case 'pick': setNet({ partnerChar: d.ch }); break;
    case 'start': if (net.role === 'client') clientStart(d); break;
    case 'in': if (net.role === 'host' && net.playing) hostInput(d); break;
    case 'up': if (net.role === 'host' && net.playing) chooseUpgradeFor(1, d.id as any); break;
    case 'snap': if (net.role === 'client' && net.playing) clientSnap(d as unknown as SnapWire, len); break;
    case 'ping': if (net.role === 'client') { setNet({ lag: Math.round(d.rtt), lagOk: true }); sendGame({ k: 'pong', n: d.n, ts: d.ts }); } break;
    case 'pong': if (net.role === 'host') { net.rtt = Math.max(0, performance.now() - d.ts); world.slots[1] && (world.slots[1].ping = net.rtt); setNet({ lag: Math.round(net.rtt), lagOk: true }); } break;
    case 'end': if (net.role === 'client') clientEnd(d.res); break;
  }
}

// ------------------------------------------------------------------ host
const validChar = (c: string): CharacterId => (CHARACTERS.some((x) => x.id === c) ? (c as CharacterId) : 'mochi');
/** host presses START: pick distinct characters, tell the guest, begin the authoritative run */
export function hostStart(mode: GameMode, stage = 1, map: WorldId = 'candy') {
  const st = useNet.getState(); if (net.role !== 'host' || st.status !== 'ready') return;
  const hostCh = validChar(st.myChar); let guestCh = validChar(st.partnerChar || 'mochi');
  if (guestCh === hostCh) guestCh = CHARACTERS.find((c) => c.id !== hostCh)!.id;
  const chars = [hostCh, guestCh], names = [st.myName, st.partnerName || 'Guest'];
  const mapId: WorldId = mode === 'adventure' ? getStage(stage).world : map;
  sendGame({ k: 'start', mode, stage, chars, names, map: mapId });
  const ri = createRemoteInput(); net.remoteIn = ri; net.lastIn = performance.now();
  net.playing = true; net.snapAcc = 0; net.pingAcc = 0; net.seq = 0; evq.recording = true; evq.now = 0; evq.list = [];
  runHooks.finish = (res, slotRes) => { const r = slotRes(1); sendGame({ k: 'end', res: r }); void res; };
  setNet({ status: 'playing', chars, mode, stage });
  input.reset();
  useUI.getState().set({ phase: 'playing', ...initialHud(), results: null, character: hostCh, mode, stage, coop: true, coopOffer: false, netMsg: '' } as any);
  startCoopRun(mode, chars, names, [null, ri], stage, mapId);
  try { (((globalThis as any).__canvas as HTMLCanvasElement | undefined)?.requestPointerLock?.() as any)?.catch?.(() => {}); } catch { /* */ }
}
function hostInput(d: Extract<GameMsg, { k: 'in' }>) {
  const ri = net.remoteIn, sl = world.slots[1]; if (!ri || !sl) return;
  net.stats.inRecv++; net.lastIn = performance.now();
  ri.keys.clear(); for (const k of d.keys) ri.keys.add(k);
  for (const k of d.pr) ri.pressed.add(k);
  ri.mouseDown = !!d.md; ri.aimDown = !!d.ad; ri.wheel += d.w;
  sl.player.yaw = d.y; sl.player.pitch = d.p;
}
function hostPeerLeft() {
  const sl = world.slots[1]; if (!sl) return;
  sl.connected = false; sl.player.dead = true; sl.player.hp = 0; sl.offer = null; net.remoteIn?.reset();
  setNet({ partnerName: '', lagOk: false });
  useUI.getState().set({ banner: '队友已断线，继续单人战斗 Partner disconnected' } as any);
  setTimeout(() => { if (useUI.getState().banner.startsWith('队友已断线')) useUI.getState().set({ banner: '' } as any); }, 3500);
}
/** called every render frame on the host (after the sim steps) */
export function hostFrame(dt: number) {
  if (!net.playing || net.role !== 'host') return;
  evq.now = world.time;
  const sl = world.slots[1];
  if (net.remoteIn && sl?.connected && performance.now() - net.lastIn > 600) net.remoteIn.reset(); // stale input: let go of the keys
  if (!sl?.connected) { evq.list.length = 0; return; }
  net.snapAcc += dt; net.pingAcc += dt;
  const iv = 1 / COOP.snapshotHz;
  if (net.snapAcc >= iv) {
    net.snapAcc = net.snapAcc % iv;
    const snap = buildSnapshot(net.seq++);
    const s = encode({ t: 'msg', d: { k: 'snap', ...snap } } as any);
    net.stats.snapsSent++; net.stats.lastSnapBytes = s.length;
    const w = net.ws; if (w && w.readyState === 1) { net.stats.bytesSent += s.length; w.send(s); }
  }
  if (net.pingAcc >= 1) { net.pingAcc = 0; sendGame({ k: 'ping', n: net.pingN++, ts: performance.now(), rtt: net.rtt }); }
}

// ------------------------------------------------------------------ client
function clientStart(d: Extract<GameMsg, { k: 'start' }>) {
  resetWorld(); enterWorld(d.mode === 'adventure' ? getStage(d.stage).world : d.map, true);
  const chars = d.chars.map(validChar);
  setupSlots(chars, d.names, []);
  world.slots.forEach((sl, i) => { (sl.run as any).character = chars[i]; });
  world.local = 1; world.active = 1; world.coop.on = true; world.coop.client = true; world.coop.host = false;
  world.run.mode = d.mode; world.run.stage = d.stage;
  net.role = 'client'; net.playing = true; net.buf.clear(); net.clock = new RenderClock(COOP.interpDelay); net.evQ.length = 0; net.lastSnapRecv = nowS();
  net.pressedAcc.clear(); net.wheelAcc = 0; net.inAcc = 0; net.results = null; runHooks.pick = sendUpgradePick;
  input.reset();
  const total = d.mode === 'adventure' ? getStage(d.stage).waves.length : 0;
  setNet({ status: 'playing', chars, mode: d.mode, stage: d.stage });
  useUI.getState().set({ phase: 'playing', ...initialHud(), results: null, character: chars[1], mode: d.mode, stage: d.stage, totalWaves: total, coop: true, coopOffer: false, netMsg: '' } as any);
  try { (((globalThis as any).__canvas as HTMLCanvasElement | undefined)?.requestPointerLock?.() as any)?.catch?.(() => {}); } catch { /* */ }
}
function clientSnap(w: SnapWire, len: number) {
  const s = decodeSnap(w, nowS()); net.stats.snapsRecv++; net.stats.lastSnapBytes = len; net.lastSnapRecv = s.recv;
  net.buf.push(s); net.clock.onSnapshot(s.t, s.recv);
  for (const e of s.ev) net.evQ.push(e);
  if (net.evQ.length > 800) net.evQ.splice(0, net.evQ.length - 800);
}
function clientEnd(res: EndResults) {
  net.results = res;
  try { document.exitPointerLock?.(); } catch { /* */ }
  useUI.getState().set({ phase: 'results', boss: null, coopOffer: false, results: { ...res, upgrades: res.upgrades as any, newBest: false, unlocked: [], character: res.character as any } } as any);
}
/** client: upgrade pick goes to the host */
export const sendUpgradePick = (id: string) => sendGame({ k: 'up', id });

export function playEvent(e: NetEv) {
  const a = e as unknown as any[];
  switch (e[1]) {
    case 'b': doBurst(a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10]); break;
    case 'cf': doConfetti(a[2], a[3], a[4], a[5]); break;
    case 'pf': doPuff(a[2], a[3], a[4], a[5], a[6]); break;
    case 'dn': doDmgNumber(a[2], a[3], a[4], a[5], !!a[6], a[7]); break;
    case 'bl': doBlast(a[2], a[3], a[4], a[5], a[6], a[7]); break;
    case 'tr': doTracer(v3(a[2], a[3], a[4]), v3(a[5], a[6], a[7]), a[8], a[9], a[10], a[11], a[12]); break;
    case 'sh': if (a[3] < 0 || a[3] === world.local) world.shake = Math.max(world.shake, a[2]); break;
    case 'rc': if (a[2] === world.local) { const p = world.slots[world.local].player; p.yaw += a[3]; p.pitch += a[4]; } break;
    case 'ui': if (a[2] < 0 || a[2] === world.local) applyUiPatch(a[3]); break;
    case 'sx': doSfx(a[2], a[3], a[4] ?? []); break;
    case 'fk': doFunnyKill(a[2], a[3], a[4], !!a[5], a[6] ?? 1); break;
    case 'lob': { const l = world.lobs.spawnOrRecycle(); l.from.x = a[2]; l.from.y = a[3]; l.from.z = a[4]; l.to.x = a[5]; l.to.y = a[6]; l.to.z = a[7]; l.t = 0; l.T = a[8]; l.color = a[9]; l.vis = a[10]; l.size = 1.2; break; }
  }
}

let ackKeys: string[] = [];
/** called every render frame on the client instead of stepSim */
export function clientFrame(dt: number) {
  if (!net.playing || net.role !== 'client') return;
  const now = nowS();
  const renderT = net.clock.step(dt, now);
  const sm = net.buf.sample(renderT);
  if (sm) {
    applySample(sm, renderT);
    smoothOwn(dt, net.buf.newest, now, net.rtt);
    while (net.evQ.length && net.evQ[0][0] <= renderT) playEvent(net.evQ.shift()!);
  }
  stepFxClient(dt);
  world.run.stage = useUI.getState().stage; world.run.mode = useUI.getState().mode;
  // no snapshot for 5 s while the socket still looks open -> treat as dropped
  if (now - net.lastSnapRecv > 5) { onDisconnected('连接超时 Connection timed out'); return; }
  setNet({ lagOk: now - net.lastSnapRecv < 1.5 });
  // input @ ~inputHz
  for (const k of input.pressed) net.pressedAcc.add(k); input.pressed.clear();
  net.wheelAcc += input.consumeWheel();
  net.inAcc += dt;
  if (net.inAcc >= 1 / COOP.inputHz) {
    net.inAcc = net.inAcc % (1 / COOP.inputHz);
    const p = world.slots[world.local].player;
    ackKeys = [...input.keys];
    sendGame({ k: 'in', n: net.inN++, keys: ackKeys, pr: [...net.pressedAcc], md: input.mouseDown ? 1 : 0, ad: input.aimDown ? 1 : 0, y: Math.round(p.yaw * 1000) / 1000, p: Math.round(p.pitch * 1000) / 1000, w: net.wheelAcc });
    net.stats.inSent++; net.pressedAcc.clear(); net.wheelAcc = 0;
  }
}
