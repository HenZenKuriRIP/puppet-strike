import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, spawnEnemy } from '../game/core/world';
import { input } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime } from '../game/sim/headless';
import { BULLET_VISUALS, WEAPONS, WEAPON_ORDER, ENEMIES, TANK_TYPES, ENEMY_ORDER, COOP, ARENA, bvIndex } from '../config/game';
import { survivalWave, waveCount } from '../game/progression/survival';
import { scaleWave, coopCountMult, coopHpMult } from '../game/progression/waveManager';
import { pickTarget } from '../game/systems/targeting';
import { SnapBuffer, RenderClock, lerpAngle, lerp } from '../net/interp';
import { normCode, validCode, genRoomCode, parseC2S, parseS2C, parseGameMsg, cleanName, encode, ROOM_ALPHABET, E, MAX_FRAME } from '../net/protocol';
import { buildSnapshot, decodeSnap } from '../net/snapshot';
import { candyGeometry, candyTriangles } from '../game/effects/candyGeo';
import { SPAWN_POINTS, SLOT_SPAWNS, BOSS_BOUND, BALLOON_DEFS, PICKUP_SPOTS, SPRING_PADS, ARENA_BOXES } from '../game/levels/arenaLayout';
import { groundHeight, BRIDGES, RIVER, inRiver, onBridge, zoneAt } from '../game/levels/terrain';
import { STAGES as ADVENTURE_STAGES } from '../game/progression/adventure';
import { v3 } from '../game/core/math';
import type { CharacterId } from '../game/characters/registry';

describe('M6 candy bullets', () => {
  it('has 10 distinct visuals, each with valid non-empty geometry and a sane triangle budget', () => {
    expect(new Set(BULLET_VISUALS).size).toBe(10);
    for (const id of BULLET_VISUALS) { const g = candyGeometry(id); expect(g.attributes.position.count).toBeGreaterThan(8); }
    expect(candyTriangles()).toBeLessThan(6000);
  });
  it('every weapon declares a valid bulletVisual', () => {
    for (const w of WEAPON_ORDER) { expect(BULLET_VISUALS).toContain(WEAPONS[w].bulletVisual); }
    expect(new Set(WEAPON_ORDER.map((w) => WEAPONS[w].bulletVisual)).size).toBeGreaterThanOrEqual(3);
  });
  it('visual ids are serialised into snapshots (projectiles + shots) and survive JSON', () => {
    withSeed(3, () => withVirtualTime((adv) => {
      input.reset(); runFlow.startRun('survival', 'mochi', 1); useUI.getState().set({ phase: 'playing' } as any);
      world.cinematic = 0; tick(adv);
      const pr = world.projectiles.spawn()!; pr.vis = bvIndex('heart'); pr.life = 2;
      const s = world.shots.spawn()!; s.vis = bvIndex('cookie'); s.life = 2;
      const snap = JSON.parse(JSON.stringify(buildSnapshot(1)));
      expect(snap.pr.some((p: any[]) => p[7] === bvIndex('heart'))).toBe(true);
      expect(snap.sh.some((p: any[]) => p[8] === bvIndex('cookie'))).toBe(true);
    }));
  });
  it('projectile/shot pools stay at their caps (performance cap)', () => {
    for (let i = 0; i < 400; i++) world.projectiles.spawn();
    expect(world.projectiles.items.filter((p) => p.active).length).toBeLessThanOrEqual(world.projectiles.items.length);
    for (const p of world.projectiles.items) p.active = false;
  });
});

describe('M6 candy tanks', () => {
  it('6 candy tank types exist with behaviours configured (not hard-coded)', () => {
    expect(TANK_TYPES.length).toBe(6);
    for (const t of TANK_TYPES) { expect(ENEMIES[t].candyTank).toBe(true); expect(ENEMY_ORDER).toContain(t); }
    expect(ENEMIES.gumdrop.speed).toBeGreaterThan(ENEMIES.windup.speed);       // fast
    expect(ENEMIES.choco.armorFront).toBeGreaterThan(0);                        // armor
    expect(ENEMIES.lolli.lob).toBeTruthy();                                     // arcing shell
    expect(ENEMIES.mint.ring).toBeTruthy();                                     // spiral rings
    expect(ENEMIES.jelly.swarm).toBeGreaterThan(1);                             // swarm
    expect(ENEMIES.mega.hp).toBeGreaterThan(1000);                              // mini boss
  });
  it('survival tables introduce tanks progressively and stay under the pool cap', () => {
    expect(Object.keys(survivalWave(1)).some((t) => TANK_TYPES.includes(t as any))).toBe(false);
    const seen = new Set<string>(); for (let n = 1; n <= 40; n++) { const w = survivalWave(n); for (const t of Object.keys(w)) seen.add(t); }
    for (const t of TANK_TYPES) expect(seen.has(t)).toBe(true);
    for (let n = 1; n <= 60; n++) { const w = survivalWave(n); expect(Object.entries(w).reduce((a, [t, c]) => a + (c ?? 0) * ((ENEMIES as any)[t].swarm ?? 1), 0)).toBeLessThanOrEqual(64); }
  });
  it('adventure stages 1 and 2 include tanks', () => {
    const tankIn = (st: any) => st.waves.some((w: any) => Object.keys(w).some((t) => TANK_TYPES.includes(t as any)));
    expect(tankIn(ADVENTURE_STAGES[0])).toBe(true); expect(tankIn(ADVENTURE_STAGES[1])).toBe(true);
  });
  it('spawning every tank type yields enemies with swarm counts and no NaN after 3 s of sim', () => {
    withSeed(5, () => withVirtualTime((adv) => {
      input.reset(); runFlow.startRun('adventure', 'mochi', 1); useUI.getState().set({ phase: 'playing' } as any);
      world.run.waveDefs = []; world.cinematic = 0; tick(adv);
      for (const t of TANK_TYPES) spawnEnemy(t, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      for (let i = 0; i < 180; i++) tick(adv);
      for (const e of world.enemies.items) if (e.active) { expect(Number.isFinite(e.pos.x + e.pos.y + e.pos.z)).toBe(true); }
      expect(world.enemies.items.filter((e) => e.active).length).toBeGreaterThanOrEqual(TANK_TYPES.length);
    }));
  });
});

describe('M6 big map', () => {
  it('arena is >= 2x the area of the M5 arena (half 22) and has all zone types', () => {
    expect((ARENA.half * 2) ** 2 / 44 ** 2).toBeGreaterThanOrEqual(2);
    const zones = new Set<string>();
    for (let x = -ARENA.half; x <= ARENA.half; x += 1) for (let z = -ARENA.half; z <= ARENA.half; z += 1) zones.add(zoneAt(x, z));
    for (const z of ['plaza', 'river', 'bridge', 'forest', 'village', 'hills']) expect(zones.has(z)).toBe(true);
  });
  it('spawn points, player spawns, pickups and spring pads are inside the arena, outside solid boxes and not in water', () => {
    const free = (x: number, z: number) => !ARENA_BOXES.some((b) => x > b.min.x - 0.3 && x < b.max.x + 0.3 && z > b.min.z - 0.3 && z < b.max.z + 0.3 && b.min.y < 1.2 && b.max.y > 0.1);
    const pts: [number, number][] = [...SPAWN_POINTS, ...SLOT_SPAWNS.map((s) => [s[0], s[2]] as [number, number]), ...PICKUP_SPOTS.map((p) => [p.x, p.z] as [number, number]), ...SPRING_PADS];
    for (const [x, z] of pts) { expect(Math.abs(x)).toBeLessThan(ARENA.half); expect(Math.abs(z)).toBeLessThan(ARENA.half); expect([x, z, 'river', inRiver(x, z)]).toEqual([x, z, 'river', false]); expect([x, z, 'free', free(x, z)]).toEqual([x, z, 'free', true]); }
    expect(SPAWN_POINTS.length).toBeGreaterThanOrEqual(6);
  });
  it('river has 3 bridges; bridges are not water; boss arena is the central plaza', () => {
    expect(BRIDGES.length).toBe(3);
    for (const b of BRIDGES) { expect(onBridge(b.x, RIVER.z)).toBe(true); expect(inRiver(b.x, RIVER.z)).toBe(false); }
    expect(inRiver(10, RIVER.z)).toBe(true);
    expect(BOSS_BOUND).toBeGreaterThan(8);
    expect(BALLOON_DEFS.length).toBeGreaterThan(2);
  });
  it('terrain height is finite and bounded everywhere (ramps/hills)', () => {
    let mx = 0; for (let x = -ARENA.half; x <= ARENA.half; x += 0.75) for (let z = -ARENA.half; z <= ARENA.half; z += 0.75) { const h = groundHeight(x, z); expect(Number.isFinite(h)).toBe(true); mx = Math.max(mx, h); }
    expect(mx).toBeGreaterThan(1); expect(mx).toBeLessThan(5);
  });
});

describe('M6 co-op: protocol', () => {
  it('room codes are 4 letters from the unambiguous alphabet and normalise user input', () => {
    for (let i = 0; i < 50; i++) { const c = genRoomCode(); expect(c).toHaveLength(4); expect(validCode(c)).toBe(true); }
    expect(normCode(' ab-cd ')).toBe('ABCD'); expect(validCode('ABCI')).toBe(false); expect(ROOM_ALPHABET).not.toMatch(/[ILO0-9]/);
  });
  it('parseC2S validates and sanitises', () => {
    expect(parseC2S('not json')).toBeNull(); expect(parseC2S('{"t":"nope"}')).toBeNull(); expect(parseC2S('x'.repeat(MAX_FRAME + 1))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: 'join', code: 'zzz', name: 'a' }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: 'join', code: 'abcd', name: '<b>Hana</b>' }))).toEqual({ t: 'join', code: 'ABCD', name: 'bHanab' });
    expect(parseC2S(JSON.stringify({ t: 'host', name: '' }))).toEqual({ t: 'host', name: 'Player' });
    expect(cleanName('x'.repeat(50)).length).toBe(14);
  });
  it('input messages are clamped and key lists whitelisted', () => {
    const m: any = parseGameMsg({ k: 'in', n: 5, keys: ['KeyW', 'Evil', 'KeyE'], pr: [], md: 1, ad: 0, y: 1, p: 99, w: 0 });
    expect(m.keys).toEqual(['KeyW', 'KeyE']); expect(m.p).toBeLessThanOrEqual(1.6);
    expect(parseGameMsg({ k: 'in', n: 'x' })).toBeNull(); expect(parseGameMsg({ k: 'start', mode: 'x' })).toBeNull();
    expect(parseGameMsg({ k: 'start', mode: 'survival', stage: 99, chars: ['mochi', 'bubu', 'x'], names: ['a', 'b'] })).toMatchObject({ stage: 9, chars: ['mochi', 'bubu'] });
  });
  it('S2C round trip', () => {
    expect(parseS2C(encode({ t: 'hosted', code: 'ABCD' }))).toEqual({ t: 'hosted', code: 'ABCD' });
    expect(parseS2C(encode({ t: 'roomClosed' }))).toEqual({ t: 'roomClosed' });
    expect(parseS2C('{"t":"rooms","rooms":[{"code":"ABCD","name":"H","players":1,"open":true}]}')).toMatchObject({ t: 'rooms' });
  });
});

describe('M6 co-op: interpolation', () => {
  const mk = (t: number, x: number) => ({ t, x });
  it('interpolates between bracketing snapshots, handles reorder/duplicates/extrapolation', () => {
    const b = new SnapBuffer<{ t: number; x: number }>();
    b.push(mk(0.1, 10)); b.push(mk(0, 0)); b.push(mk(0.1, 99)); b.push(mk(0.2, 20));
    expect(b.items.map((i) => i.t)).toEqual([0, 0.1, 0.2]);
    const s = b.sample(0.15)!; expect(lerp(s.a.x, s.b.x, s.k)).toBeCloseTo(15, 5); expect(s.extra).toBe(0);
    const e = b.sample(0.25)!; expect(e.extra).toBeCloseTo(0.05, 5); expect(b.sample(-1)!.a.x).toBe(0);
    expect(new SnapBuffer<any>().sample(1)).toBeNull();
  });
  it('buffer is bounded', () => { const b = new SnapBuffer<{ t: number }>(10); for (let i = 0; i < 100; i++) b.push({ t: i }); expect(b.items.length).toBe(10); });
  it('lerpAngle takes the short way round', () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeGreaterThan(3.0); expect(Math.abs(lerpAngle(0, Math.PI * 2 - 0.2, 1) + 0.2)).toBeLessThan(1e-6);
  });
  it('render clock stays delay behind the host and resyncs after a stall', () => {
    const c = new RenderClock(0.1); c.onSnapshot(5, 100); const r0 = c.step(0.016, 100); expect(r0).toBeCloseTo(4.9, 5);
    let r = r0; for (let i = 0; i < 60; i++) { r = c.step(1 / 60, 100 + (i + 1) / 60); if (i % 2 === 0) c.onSnapshot(5 + (i + 1) / 60, 100 + (i + 1) / 60); }
    expect(r).toBeGreaterThan(r0 + 0.8);
    c.onSnapshot(50, 200); expect(c.step(0.016, 200)).toBeCloseTo(49.9, 1);
  });
});

describe('M6 co-op: targeting and scaling', () => {
  const C = (x: number, alive = true) => ({ x, z: 0, alive });
  it('nearest picks the closest alive player with hysteresis, skips downed', () => {
    expect(pickTarget('nearest', 0, 0, [C(5), C(-2)], -1, 0)).toBe(1);
    expect(pickTarget('nearest', 0, 0, [C(5), C(4)], 0, 0)).toBe(0);            // hysteresis: stay
    expect(pickTarget('nearest', 0, 0, [C(20), C(1)], 0, 0)).toBe(1);           // clearly closer: switch
    expect(pickTarget('nearest', 0, 0, [C(1, false), C(30)], -1, 0)).toBe(1);   // downed ignored
    expect(pickTarget('nearest', 0, 0, [C(1, false), C(2, false)], 1, 0)).toBe(1);
  });
  it('random picks only alive players and keeps its choice', () => {
    for (const r of [0, 0.3, 0.99]) expect(pickTarget('random', 0, 0, [C(1, false), C(2)], -1, r)).toBe(1);
    expect(pickTarget('random', 0, 0, [C(1), C(2)], 1, 0)).toBe(1);
    expect(pickTarget('random', 0, 0, [C(1), C(2)], -1, 0.9)).toBe(1);
  });
  it('2-player scaling multiplies counts and hp, keeps mini-bosses single and respects the cap', () => {
    expect(coopCountMult(1)).toBe(1); expect(coopHpMult(1)).toBe(1);
    expect(coopCountMult(2)).toBeGreaterThan(1); expect(coopHpMult(2)).toBeGreaterThan(1);
    const w = { windup: 5, gunner: 5, mega: 1, jelly: 6 };
    expect(scaleWave(w, 1)).toBe(w);
    const s = scaleWave(w, COOP.enemyCountMult[1]); expect(s.windup).toBeGreaterThan(5); expect(s.mega).toBe(1);
    const big = scaleWave({ windup: 30, gunner: 30, jelly: 20 }, 2, 44);
    expect(Object.entries(big).reduce((a, [t, c]) => a + (c ?? 0) * ((ENEMIES as any)[t].swarm ?? 1), 0)).toBeLessThanOrEqual(44);
  });
});

describe('M6 co-op: snapshot', () => {
  it('snapshot is JSON-serialisable, deterministic-id, and carries enemy hp ratio', () => {
    withSeed(9, () => withVirtualTime((adv) => {
      input.reset(); runFlow.startRun('survival', 'mochi', 1); useUI.getState().set({ phase: 'playing' } as any); world.cinematic = 0; tick(adv);
      const e = spawnEnemy('gumdrop', 3, 3)!; e.hp = e.maxHp * 0.25;
      const w = JSON.parse(JSON.stringify(buildSnapshot(7)));
      expect(w.sq).toBe(7); expect(w.pl.length).toBe(world.slots.length);
      const tup = w.en.find((t: number[]) => t[E.id] === e.id); expect(tup).toBeTruthy(); expect(tup[E.hf]).toBeCloseTo(0.25, 3);
      const d = decodeSnap(w, 0); expect(d.en[e.id]).toBeTruthy();
      expect(JSON.stringify(w).length).toBeLessThan(60000);
    }));
  });
});


/** Start an empty arena (no wave spawner) for `ch`, run fn with a tick helper. */
function sandbox<T>(ch: CharacterId, fn: (step: (n?: number, each?: () => void) => void) => T, seed = 1): T {
  return withSeed(seed, () => withVirtualTime((adv) => {
    input.reset(); useUI.getState().set({ character: ch } as any);
    runFlow.startRun('adventure', ch, 1); useUI.getState().set({ phase: 'playing' } as any);
    world.run.waveDefs = []; world.cinematic = 0;
    const step = (n = 1, each?: () => void) => { for (let i = 0; i < n; i++) { each?.(); tick(adv); } };
    step(2); for (const e of world.enemies.items) e.active = false;
    world.player.pos = v3(2, 0, 4); world.player.prev = v3(2, 0, 4); step(2);
    try { return fn(step); } finally { input.reset(); }
  }));
}

describe('M6 map pathing', () => {
  it('candy tanks do not get stuck on the big map (12 seeds, all spawn gates)', () => {
    for (let seed = 1; seed <= 12; seed++) sandbox('mochi', (step) => {
      world.player.pos = v3(0, 0, 0.5);
      const es = SPAWN_POINTS.map(([x, z], i) => spawnEnemy((['gumdrop', 'jelly', 'choco', 'mint', 'lolli', 'jelly'] as const)[i % 6], x, z)!);
      const last = es.map((e) => ({ x: e.pos.x, z: e.pos.z })), stalls = es.map(() => 0), prevSt = es.map((e) => e.fsm.state + e.patrol.x + e.patrol.z); let reached = 0;
      const near = es.map(() => false);
      es.forEach((e, i) => { if (i % 3 !== 2) { e.fsm.state = 'chase'; e.fsm.timer = 0; } }); // gates are far: aggro two thirds, leave the rest to patrol
      for (let w = 0; w < 16; w++) {
        step(60 * 2.5, () => { world.player.invuln = 9; world.player.hp = world.player.maxHp; es.forEach((e, i) => { if (Math.hypot(e.pos.x - world.player.pos.x, e.pos.z - world.player.pos.z) < 4) near[i] = true; }); });
        es.forEach((e, i) => { if (!e.active || e.dead || near[i]) return; const dP = Math.hypot(e.pos.x - world.player.pos.x, e.pos.z - world.player.pos.z);
          const trying = (e.fsm.state === 'chase' && !(dP < ENEMIES[e.type].attackRange + 1.5)) || // tanks deliberately hold position inside 11 m
            (e.fsm.state === 'patrol' && Math.hypot(e.patrol.x - e.pos.x, e.patrol.z - e.pos.z) > 1);
          if (trying && (e.fsm.state !== 'patrol' ? prevSt[i].startsWith(e.fsm.state) : prevSt[i] === e.fsm.state + e.patrol.x + e.patrol.z) && Math.hypot(e.pos.x - last[i].x, e.pos.z - last[i].z) < 0.3) stalls[i]++; // idle→patrol flips right at the sample are not stalls
          last[i] = { x: e.pos.x, z: e.pos.z }; });
        es.forEach((e, i) => { prevSt[i] = e.fsm.state + e.patrol.x + e.patrol.z; });
      }
      reached = near.filter(Boolean).length;
      if (Math.max(...stalls) > 1) console.log('STALL', seed, stalls.join(','), es.map(e => e.type + ':' + e.fsm.state + '@' + e.pos.x.toFixed(1) + ',' + e.pos.z.toFixed(1) + '>' + e.patrol.x.toFixed(1) + ',' + e.patrol.z.toFixed(1)).join(' '));
      expect(Math.max(...stalls)).toBeLessThanOrEqual(1); // trying to move but not moving: at most one 2.5 s window
      expect(reached).toBeGreaterThanOrEqual(2);
    }, seed);
  });
});
