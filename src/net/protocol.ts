/** M6 LAN co-op wire protocol. Pure (no DOM / world imports) so it is unit-testable and shared by host, client and tests.
 *  Transport: JSON text frames over a websocket, relayed by server/ws-server.mjs (a dumb 2-player room relay). */
export const PROTOCOL_VERSION = 1;
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I / L / O (easy to read aloud)
export const ROOM_CODE_LEN = 4;
export const MAX_FRAME = 256 * 1024;

export function genRoomCode(rnd: () => number = Math.random): string {
  let s = ''; for (let i = 0; i < ROOM_CODE_LEN; i++) s += ROOM_ALPHABET[Math.floor(rnd() * ROOM_ALPHABET.length) % ROOM_ALPHABET.length];
  return s;
}
/** normalise user-typed codes: upper-case, strip anything that is not in the alphabet, 4 chars */
export function normCode(s: string): string {
  let o = ''; for (const ch of String(s ?? '').toUpperCase()) if (ROOM_ALPHABET.includes(ch)) o += ch;
  return o.slice(0, ROOM_CODE_LEN);
}
export const validCode = (s: string) => s.length === ROOM_CODE_LEN && [...s].every((c) => ROOM_ALPHABET.includes(c));
export const cleanName = (s: unknown, fallback = 'Player') => { const t = String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14); return t || fallback; };

// ---------------------------------------------------------------- lobby (client <-> server)
export interface RoomInfo { code: string; name: string; players: number; open: boolean }
export type C2S =
  | { t: 'host'; name: string }
  | { t: 'list' }
  | { t: 'join'; code: string; name: string }
  | { t: 'msg'; d: GameMsg }
  | { t: 'leave' };
export type S2C =
  | { t: 'hosted'; code: string }
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'joined'; code: string; host: string }
  | { t: 'peer'; name: string }
  | { t: 'peerLeft' }
  | { t: 'roomClosed' }
  | { t: 'msg'; d: GameMsg }
  | { t: 'err'; msg: string };

// ---------------------------------------------------------------- game messages (host <-> guest, relayed verbatim)
export type GameMode = 'survival' | 'adventure';
export interface EndResults { won: boolean; mode: GameMode; stage: number; score: number; kills: number; maxCombo: number; time: number; wave: number; upgrades: string[]; character: string }
export type GameMsg =
  | { k: 'pick'; ch: string }
  | { k: 'start'; mode: GameMode; stage: number; chars: string[]; names: string[]; map: 'candy' | 'block' }
  | { k: 'in'; n: number; keys: string[]; pr: string[]; md: 0 | 1; ad: 0 | 1; y: number; p: number; w: number }
  | { k: 'up'; id: string }
  | ({ k: 'snap' } & SnapWire)
  | { k: 'ping'; n: number; ts: number; rtt: number }
  | { k: 'pong'; n: number; ts: number }
  | { k: 'end'; res: EndResults };

/** only these key codes ever reach the host sim (anything else a malicious / buggy peer sends is dropped) */
export const INPUT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyF', 'KeyE', 'KeyR', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];
const KEYSET = new Set(INPUT_KEYS);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const strArr = (x: unknown, max = 32): string[] => (Array.isArray(x) ? x.filter(isStr).filter((s) => KEYSET.has(s)).slice(0, max) : []);

export function encode(m: C2S | S2C): string { return JSON.stringify(m); }
function parseJson(raw: unknown): any { try { if (typeof raw !== 'string' || raw.length > MAX_FRAME) return null; const o = JSON.parse(raw); return o && typeof o === 'object' ? o : null; } catch { return null; } }

/** validate / sanitise one game message; returns null for anything malformed */
export function parseGameMsg(d: any): GameMsg | null {
  if (!d || typeof d !== 'object') return null;
  switch (d.k) {
    case 'pick': return isStr(d.ch) ? { k: 'pick', ch: d.ch.slice(0, 16) } : null;
    case 'start': {
      if ((d.mode !== 'survival' && d.mode !== 'adventure') || !isNum(d.stage) || !Array.isArray(d.chars) || !Array.isArray(d.names)) return null;
      return { k: 'start', mode: d.mode, stage: Math.max(1, Math.min(9, Math.floor(d.stage))), map: d.map === 'block' ? 'block' : 'candy', chars: d.chars.map(String).slice(0, 2), names: d.names.map((n: unknown) => cleanName(n)).slice(0, 2) };
    }
    case 'in': {
      if (!isNum(d.n) || !isNum(d.y) || !isNum(d.p)) return null;
      return { k: 'in', n: d.n | 0, keys: strArr(d.keys), pr: strArr(d.pr), md: d.md ? 1 : 0, ad: d.ad ? 1 : 0, y: d.y, p: Math.max(-1.6, Math.min(1.6, d.p)), w: isNum(d.w) ? Math.max(-3, Math.min(3, d.w | 0)) : 0 };
    }
    case 'up': return isStr(d.id) ? { k: 'up', id: d.id.slice(0, 32) } : null;
    case 'ping': return isNum(d.n) && isNum(d.ts) ? { k: 'ping', n: d.n, ts: d.ts, rtt: isNum(d.rtt) ? Math.max(0, Math.min(5000, d.rtt)) : 0 } : null;
    case 'pong': return isNum(d.n) && isNum(d.ts) ? { k: 'pong', n: d.n, ts: d.ts } : null;
    case 'snap': return isNum(d.t) && Array.isArray(d.pl) ? (d as GameMsg) : null;
    case 'end': return d.res && typeof d.res === 'object' ? { k: 'end', res: d.res as EndResults } : null;
    default: return null;
  }
}
export function parseC2S(raw: unknown): C2S | null {
  const o = parseJson(raw); if (!o) return null;
  switch (o.t) {
    case 'host': return { t: 'host', name: cleanName(o.name) };
    case 'list': return { t: 'list' };
    case 'leave': return { t: 'leave' };
    case 'join': { const code = normCode(o.code); return validCode(code) ? { t: 'join', code, name: cleanName(o.name) } : null; }
    case 'msg': { const d = parseGameMsg(o.d); return d ? { t: 'msg', d } : null; }
    default: return null;
  }
}
export function parseS2C(raw: unknown): S2C | null {
  const o = parseJson(raw); if (!o) return null;
  switch (o.t) {
    case 'hosted': return isStr(o.code) ? { t: 'hosted', code: o.code } : null;
    case 'rooms': return Array.isArray(o.rooms) ? { t: 'rooms', rooms: o.rooms.filter((r: any) => r && isStr(r.code)).map((r: any) => ({ code: r.code, name: cleanName(r.name), players: r.players | 0, open: !!r.open })) } : null;
    case 'joined': return isStr(o.code) ? { t: 'joined', code: o.code, host: cleanName(o.host) } : null;
    case 'peer': return { t: 'peer', name: cleanName(o.name) };
    case 'peerLeft': return { t: 'peerLeft' };
    case 'roomClosed': return { t: 'roomClosed' };
    case 'err': return { t: 'err', msg: String(o.msg ?? '').slice(0, 120) };
    case 'msg': { const d = parseGameMsg(o.d); return d ? { t: 'msg', d } : null; }
    default: return null;
  }
}

// ---------------------------------------------------------------- snapshots
export const ANIMS = ['idle', 'run', 'jump', 'dodge', 'dash', 'shoot', 'reload', 'hit', 'victory', 'defeat'] as const;
export const FSM_STATES = ['idle', 'patrol', 'detect', 'chase', 'attack', 'dead'] as const;
export const q2 = (x: number) => Math.round(x * 100) / 100;
export const q3 = (x: number) => Math.round(x * 1000) / 1000;

/** one player: short keys keep the frame small */
export interface PlayerSnap {
  x: number; y: number; z: number; vx: number; vz: number; yw: number; pt: number; fa: number;
  hp: number; mh: number; dd: 0 | 1; an: number; rp: number; sp: number; ah: number; sa: number; wi: number; sw: number;
  ra: number; fl: 0 | 1; iv: 0 | 1; sr: 0 | 1; rv: number; mf: 0 | 1; ai: number; gr: 0 | 1;
  sh?: [number, number]; dc?: [number, number, number, number]; tu?: [number, number, number, number, number];
}
/** [id, typeIdx, x, y, z, facing, flash, dead, deathTimer, hitReact, fsmIdx, fsmTimer, fsmCd, tele, tpx, tpz, burstLeft, leapT, bound, spawnAnim, animPhase, vx, vz, tgx, tgz, targetSlot] */
export type EnemyTuple = number[];
export const E = { id: 0, ty: 1, x: 2, y: 3, z: 4, fa: 5, fl: 6, dd: 7, dt: 8, hr: 9, fs: 10, ft: 11, fc: 12, te: 13, tx: 14, tz: 15, bu: 16, lp: 17, bo: 18, sa: 19, ap: 20, vx: 21, vz: 22, gx: 23, gz: 24, ts: 25, hf: 26 } as const;
/** [id, x, y, z, vx, vy, vz, vis, size, color] */
export type ProjTuple = [number, number, number, number, number, number, number, number, number, string];
/** [id, kind(0 bubble,1 rocket), x, y, z, vx, vy, vz, vis, size, color] */
export type ShotTuple = [number, 0 | 1, number, number, number, number, number, number, number, number, string];
/** [id, kind(0 hp,1 ammo), x, y, z, life, spot, age] */
export type PickTuple = [number, 0 | 1, number, number, number, number, number, number];
/** [x, y, z, r, t, max, kind(0 hazard,1 slam,2 shell)] */
export type HazTuple = [number, number, number, number, number, number, number];
export interface BossSnap { id: number; ph: number; tr: number; tele: string | null; sl: number; ci: number }
export type NetEvent = [number, string, ...unknown[]];
export interface SnapWire {
  t: number; sq: number; pl: PlayerSnap[]; en: EnemyTuple[]; pr: ProjTuple[]; sh: ShotTuple[]; pk: PickTuple[]; bl: string; hz: HazTuple[]; bs: BossSnap | null; ev: NetEvent[];
  /** W2: dynamic map objects (bricks, domino trigger times) — only present on maps that have them */
  dy?: import('../game/levels/mech').MechSnap | null;
  /** host-side values the client HUD cannot derive (slot-local ones come through 'ui' events) */
}
