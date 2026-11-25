import { ENEMIES, EnemyType, PLAYER, POOLS, WAVE } from '../../config/game';
import { V3, v3 } from './math';
import type { FsmData } from '../ai/enemyFsm';
import { createWaveState, WaveState } from '../progression/waveManager';
import { ARENA_BOXES, PLAYER_SPAWN, SLOT_SPAWNS, BALLOON_DEFS, PICKUP_SPOTS } from '../levels/arenaLayout';
import { setWorld, type WorldId } from '../levels/worlds';
import type { InputLike } from './input';
import { terrainRaycast } from '../levels/terrain';
import { rayBoxes, AABB } from '../combat/raycast';
import { Pool } from '../effects/pool';
import { Arsenal, createArsenal } from '../weapons/arsenal';
import { createSkill, SkillState } from '../systems/skills';
import { ComboState, createCombo } from '../combat/combo';
import { CharacterId } from '../characters/registry';
import { computeMods, Mods, Stacks, UpgradeId } from '../progression/upgrades';
import { createBoss, BossState, BossAttack } from '../boss/kingGummy';
import type { WaveDef } from '../../config/game';

export type GameMode = 'survival' | 'adventure';
export interface RunState {
  mode: GameMode; stage: number; character: CharacterId; stacks: Stacks; mods: Mods; taken: UpgradeId[];
  waveDefs: WaveDef[]; maxCombo: number; time: number; stageClear: boolean; wavesCleared: number;
}
export const createRun = (mode: GameMode = 'survival', character: CharacterId = 'mochi', stage = 1): RunState => ({
  mode, stage, character, stacks: {}, mods: computeMods({}), taken: [], waveDefs: [], maxCombo: 0, time: 0, stageClear: false, wavesCleared: 0,
});

export type PlayerAnim = 'idle' | 'run' | 'jump' | 'dodge' | 'dash' | 'shoot' | 'reload' | 'hit' | 'victory' | 'defeat';
export interface Player {
  pos: V3; prev: V3; vel: V3; yaw: number; pitch: number; facing: number; grounded: boolean;
  coyote: number; jumpBuf: number; hp: number; maxHp: number; dead: boolean; flash: number; invuln: number;
  runPhase: number; speed: number; shootAnim: number; aimHold: number; sprinting: boolean;
  arsenal: Arsenal; airTime: number;
  dash: SkillState; roll: SkillState; moveDir: V3; dashHits: Set<number>;
  anim: PlayerAnim; animT: number; won: boolean;
  rollCharges: number; rollRecharge: number; snipeCharge: number;
  padCd: number; revive: number; downed: number;
}
export interface Enemy {
  active: boolean; id: number; type: EnemyType; pos: V3; prev: V3; vel: V3; facing: number;
  hp: number; maxHp: number; dead: boolean; flash: number; fsm: FsmData; deathTimer: number;
  patrol: V3; animPhase: number; spawnAnim: number;
  stuckT: number; stuckN: number; slideSign: number; slideTime: number; lastX: number; lastZ: number; progT: number; bestD: number;
  bound: number; knockT: number; centerY: number;
  leapT: number; target: V3; hitReact: number; selfDestruct: boolean;
  burn: number; burnAcc: number;
  /** M6: target slot, last-hit slot (burn attribution), generic AI timers, burst-fire state, aim/telegraph point */
  ts: number; tsT: number; lastHit: number; aux: number; burstLeft: number; burstT: number; burstAng: number; tele: number; tp: V3;
}
export type ShotKind = 'bubble' | 'rocket';
export interface Shot { active: boolean; kind: ShotKind; pos: V3; prev: V3; vel: V3; life: number; vis: number; owner: number; size: number; color: string }
export interface Projectile { active: boolean; pos: V3; vel: V3; life: number; damage: number; size: number; color: string; vis: number }
/** M6: lobbed arcing shell (lolli / mega): visual flight from->to over T seconds; damage is dealt by the matching ground telegraph hazard */
export interface Lob { active: boolean; from: V3; to: V3; t: number; T: number; color: string; vis: number; size: number }
export interface Pickup { active: boolean; kind: 'hp' | 'ammo'; pos: V3; life: number; spot: number; age: number }
export interface Balloon { x: number; y: number; z: number; kind: 'hp' | 'ammo'; alive: boolean; respawn: number; wob: number }
export interface Spark { active: boolean; pos: V3; vel: V3; life: number; maxLife: number; color: string; size: number; kind: number; vis: number }
export interface Tracer { active: boolean; from: V3; to: V3; life: number; color: string; width: number; vis: number; size: number; maxLife: number }
export interface DmgNum { active: boolean; pos: V3; value: number; life: number; crit: boolean; text: string }
export interface BlastFx { active: boolean; pos: V3; radius: number; life: number; maxLife: number; color: string; ring: boolean }
export interface PendingBlast { active: boolean; pos: V3; radius: number; damage: number; knockback: number; delay: number; playerDamage: number; color: string; owner: number }

const GROUND: AABB = { min: v3(-100, -1, -100), max: v3(100, 0, 100) };
export type RaycastFn = (o: V3, d: V3, max: number) => number | null;
export const defaultRaycast: RaycastFn = (o, d, max) => {
  const b = rayBoxes(o, d, ARENA_BOXES, max), g = rayBoxes(o, d, [GROUND], max);
  const t = terrainRaycast(o.x, o.y, o.z, d.x, d.y, d.z, max);
  let best: number | null = b; if (g !== null && (best === null || g < best)) best = g; if (t !== null && (best === null || t < best)) best = t;
  return best;
};

function makePlayer(sp: [number, number, number] = PLAYER_SPAWN): Player {
  return {
    pos: v3(...sp), prev: v3(...sp), vel: v3(), yaw: 0, pitch: -0.08, facing: 0, grounded: true, coyote: 0, jumpBuf: 0,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, dead: false, flash: 0, invuln: 0, runPhase: 0, speed: 0, shootAnim: 0,
    aimHold: 0, sprinting: false, arsenal: createArsenal(), airTime: 0,
    dash: createSkill(), roll: createSkill(), moveDir: v3(0, 0, -1), dashHits: new Set(), anim: 'idle', animT: 0, won: false,
    rollCharges: 1, rollRecharge: 0, snipeCharge: 0, padCd: 0, revive: 0, downed: 0,
  };
}


// ---------------- M6: player slots ----------------
export interface PlayerRun { character: CharacterId; stacks: Stacks; mods: Mods; taken: UpgradeId[] }
export interface Offer { ids: UpgradeId[]; reason: string; t: number }
export interface Slot {
  player: Player; cam: { pos: V3; fwd: V3 }; combo: ComboState; muzzleFlash: number; aiming: number;
  shield: { hp: number; t: number }; decoy: { pos: V3; t: number }; turret: { pos: V3; t: number; cd: number; aim: number };
  run: RunState;
  /** null = the local `input` singleton; remote players on the host use their own */
  input: InputLike | null;
  name: string; remote: boolean; offer: Offer | null; picked: boolean; ping: number; connected: boolean;
}
const SHARED_KEYS = ['mode', 'stage', 'waveDefs', 'maxCombo', 'time', 'stageClear', 'wavesCleared'] as const;
const PER_KEYS = ['character', 'stacks', 'mods', 'taken'] as const;
const sharedRun = createRun();
function makeRunView(per: PlayerRun): RunState {
  const v = { ...per } as any;
  for (const k of SHARED_KEYS) Object.defineProperty(v, k, { get: () => (sharedRun as any)[k], set: (x) => { (sharedRun as any)[k] = x; }, enumerable: true, configurable: true });
  return v as RunState;
}
export function createSlot(character: CharacterId, name = 'P1', remote = false, input: InputLike | null = null, spawn: [number, number, number] = PLAYER_SPAWN): Slot {
  return {
    player: makePlayer(spawn), cam: { pos: v3(0, 2, 16), fwd: v3(0, 0, -1) }, combo: createCombo(), muzzleFlash: 0, aiming: 0,
    shield: { hp: 0, t: 0 }, decoy: { pos: v3(), t: 0 }, turret: { pos: v3(), t: 0, cd: 0, aim: 0 },
    run: makeRunView({ character, stacks: {}, mods: computeMods({}), taken: [] }),
    input, name, remote, offer: null, picked: false, ping: 0, connected: true,
  };
}

const base = {
  time: 0,
  /** W2: active map (theme + layout); set by enterWorld() at run start (host and client) */
  mapId: 'candy' as WorldId,
  alpha: 1,
  slots: [] as Slot[], active: 0, local: 0,
  coop: { on: false, host: false, client: false, seed: 0 },
  balloons: BALLOON_DEFS.map((d) => ({ x: d.x, y: d.y, z: d.z, kind: d.kind, alive: true, respawn: 0, wob: 0 })) as Balloon[],
  spotTimers: PICKUP_SPOTS.map(() => 0) as number[],
  lobs: new Pool<Lob>(POOLS.lobs, () => ({ active: false, from: v3(), to: v3(), t: 0, T: 1, color: '#ff9ec7', vis: 5, size: 1 })),
  pickups: new Pool<Pickup>(POOLS.pickups, () => ({ active: false, kind: 'hp', pos: v3(), life: 0, spot: -1, age: 0 })),
  enemies: new Pool<Enemy>(POOLS.enemies, (i) => ({
    active: false, id: i, type: 'windup', pos: v3(), prev: v3(), vel: v3(), facing: 0, hp: 1, maxHp: 1, dead: false, flash: 0,
    fsm: { state: 'idle', timer: 0, cooldown: 0 }, deathTimer: 0, patrol: v3(), animPhase: 0, spawnAnim: 0,
    stuckT: 0, stuckN: 0, slideSign: 1, slideTime: 0, lastX: 0, lastZ: 0, progT: 0, bestD: 1e9, bound: 0, knockT: 0, centerY: 0.6,
    leapT: 0, target: v3(), hitReact: 0, selfDestruct: false, burn: 0, burnAcc: 0,
    ts: 0, tsT: 0, lastHit: 0, aux: 0, burstLeft: 0, burstT: 0, burstAng: 0, tele: 0, tp: v3(),
  })),
  projectiles: new Pool<Projectile>(POOLS.projectiles, () => ({ active: false, pos: v3(), vel: v3(), life: 0, damage: 0, size: 1, color: '#ff5c9a', vis: 0 })),
  shots: new Pool<Shot>(POOLS.shots, () => ({ active: false, kind: 'bubble', pos: v3(), prev: v3(), vel: v3(), life: 0, vis: 0, owner: 0, size: 1, color: '#fff' })),
  sparks: new Pool<Spark>(POOLS.sparks, () => ({ active: false, pos: v3(), vel: v3(), life: 0, maxLife: 1, color: '#fff', size: 1, kind: 0, vis: -1 })),
  tracers: new Pool<Tracer>(POOLS.tracers, () => ({ active: false, from: v3(), to: v3(), life: 0, color: '#fff', width: 1, vis: -1, size: 1, maxLife: 1 })),
  dmgNums: new Pool<DmgNum>(POOLS.damageNumbers, () => ({ active: false, pos: v3(), value: 0, life: 0, crit: false, text: '' })),
  blastFx: new Pool<BlastFx>(POOLS.blasts, () => ({ active: false, pos: v3(), radius: 1, life: 0, maxLife: 1, color: '#fff', ring: true })),
  pending: new Pool<PendingBlast>(16, () => ({ active: false, pos: v3(), radius: 1, damage: 0, knockback: 0, delay: 0, playerDamage: 0, color: '#fff', owner: 0 })),
  hitStop: 0,
  shake: 0,
  score: 0,
  kills: 0,
  waves: createWaveState(WAVE.intermission) as WaveState,
  raycast: defaultRaycast as RaycastFn,
  outcome: null as null | 'won' | 'lost',
  ended: false,
  boss: { s: createBoss() as BossState, id: -1, spiralLeft: 0, spiralAng: 0, spiralT: 0, slamT: 0, tele: null as BossAttack | null, celebrate: 0 },
  hazards: [] as { pos: V3; r: number; t: number; max: number; dmg: number; kind: 'hazard' | 'slam' | 'shell'; owner?: number }[],
  cinematic: 0,
  stats: { damageTaken: 0, hitsTaken: 0, skillCasts: 0, shotsFired: 0, revives: 0 },
};
/** per-slot context lives in `slots[active]`; these accessors keep single-player code (and tests) unchanged */
type Delegated = { player: Player; cam: Slot['cam']; combo: ComboState; muzzleFlash: number; aiming: number; shield: Slot['shield']; decoy: Slot['decoy']; turret: Slot['turret']; run: RunState };
export const world = base as typeof base & Delegated;
for (const k of ['player', 'cam', 'combo', 'muzzleFlash', 'aiming', 'shield', 'decoy', 'turret'] as const) {
  Object.defineProperty(world, k, { get() { return world.slots[world.active][k]; }, set(v) { (world.slots[world.active] as any)[k] = v; }, enumerable: true, configurable: true });
}
Object.defineProperty(world, 'run', {
  get() { return world.slots[world.active].run; },
  set(v: RunState) {
    for (const k of SHARED_KEYS) (sharedRun as any)[k] = (v as any)[k];
    const r = world.slots[world.active].run as any; for (const k of PER_KEYS) r[k] = (v as any)[k];
  }, enumerable: true, configurable: true,
});
world.slots = [createSlot('mochi')];
export const slotCount = () => world.slots.length;
/** co-op: (re)build slots for the given characters. Slot 0 is the host (local input), the rest are remote. */
export function setupSlots(chars: CharacterId[], names: string[], remoteInputs: (InputLike | null)[] = []) {
  world.slots = chars.map((c, i) => createSlot(c, names[i] ?? `P${i + 1}`, i > 0 && !!remoteInputs[i], remoteInputs[i] ?? null, chars.length > 1 ? SLOT_SPAWNS[i] : PLAYER_SPAWN));
  world.active = 0; world.local = 0;
}
/** W2: switch the live map (layout, terrain, mechanics) and rebuild the per-map pickup/balloon tables */
export function enterWorld(id: WorldId, force = false) {
  setWorld(id, force); world.mapId = id;
  world.balloons = BALLOON_DEFS.map((d) => ({ x: d.x, y: d.y, z: d.z, kind: d.kind, alive: true, respawn: 0, wob: 0 })) as Balloon[];
  world.spotTimers = PICKUP_SPOTS.map(() => 0) as number[];
}
export const resetBoss = () => { world.boss = { s: createBoss(), id: -1, spiralLeft: 0, spiralAng: 0, spiralT: 0, slamT: 0, tele: null, celebrate: 0 }; };

export function resetWorld() {
  world.time = 0; world.alpha = 1;
  world.slots = [createSlot('mochi')]; world.active = 0; world.local = 0; world.coop.on = world.coop.host = world.coop.client = false;
  for (const p of [world.enemies, world.projectiles, world.shots, world.sparks, world.tracers, world.dmgNums, world.blastFx, world.pending, world.lobs, world.pickups]) p.clear();
  world.hitStop = 0; world.shake = 0; world.score = 0; world.kills = 0; world.outcome = null; world.ended = false;
  world.waves = createWaveState(WAVE.intermission);
  world.run = createRun(); world.stats = { damageTaken: 0, hitsTaken: 0, skillCasts: 0, shotsFired: 0, revives: 0 }; resetStageState();
}
/** clears per-stage transient state (enemies, bullets, skills objects) but keeps player + run */
export function resetStageState() {
  for (const p of [world.enemies, world.projectiles, world.shots, world.pending, world.lobs, world.pickups]) p.clear();
  world.waves = createWaveState(WAVE.intermission); resetBoss();
  for (const sl of world.slots) { sl.shield = { hp: 0, t: 0 }; sl.decoy = { pos: v3(), t: 0 }; sl.turret = { pos: v3(), t: 0, cd: 0, aim: 0 }; sl.offer = null; sl.picked = false; }
  for (const b of world.balloons) { b.alive = true; b.respawn = 0; }
  world.spotTimers.fill(0);
  world.hazards = []; world.cinematic = 0; world.outcome = null; world.ended = false;
}

export function spawnEnemy(type: EnemyType, x: number, z: number) {
  const e = world.enemies.spawn(); if (!e) return null;
  const c = ENEMIES[type];
  e.type = type; e.pos.x = x; e.pos.y = c.flying ? c.hoverHeight! : 0; e.pos.z = z; e.vel.x = e.vel.y = e.vel.z = 0;
  e.prev.x = e.pos.x; e.prev.y = e.pos.y; e.prev.z = e.pos.z;
  e.hp = e.maxHp = c.hp; e.dead = false; e.flash = 0; e.deathTimer = 0; e.spawnAnim = c.brick ? 0.9 : 0.4;
  e.fsm.state = 'idle'; e.fsm.timer = 0.3; e.fsm.cooldown = 0.5; e.animPhase = Math.random() * 10;
  e.bound = 0; e.knockT = 0; e.leapT = 0; e.hitReact = 0; e.selfDestruct = false; e.burn = 0; e.burnAcc = 0; e.centerY = c.height * 0.5;
  e.patrol.x = x; e.patrol.z = z; e.facing = Math.atan2(-(world.player.pos.x - x), -(world.player.pos.z - z));
  e.ts = 0; e.tsT = 0; e.lastHit = 0; e.aux = 0; e.burstLeft = 0; e.burstT = 0; e.burstAng = 0; e.tele = 0; e.tp.x = x; e.tp.y = 0; e.tp.z = z;
  return e;
}
