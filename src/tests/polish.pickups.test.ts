// POLISH A: every candy can be placed on a valid reachable spot, picked up (also full / elevated / airborne / co-op guest).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, spawnEnemy } from '../game/core/world';
import { input, createRemoteInput } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { _pickupHooks, PICKUP_BONUS } from '../game/systems/simulation';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime, mulberry32 } from '../game/sim/headless';
import { PICKUP_SPOTS, BALLOON_DEFS, STATIC_BOXES, PLAYER_SPAWN } from '../game/levels/arenaLayout';
import { setWorld, WorldId } from '../game/levels/worlds';
import { groundHeight } from '../game/levels/terrain';
import { inCollectRange, inMagnetRange, resolvePickupSpot, validPickupAt, standHeight, pickupInsideSolid, COLLECT_R, MAP_LIM, REACH_UP } from '../game/levels/pickupSpot';
import { buildSnapshot } from '../net/snapshot';
import { drain, evq } from '../game/core/events';
import { PLAYER } from '../config/game';
import { v3 } from '../game/core/math';

const MAPS: WorldId[] = ['candy', 'block'];

/** grid flood fill: cells a player can walk/hop to from the spawn (capsule vs static boxes, hops <= REACH_UP) */
function reachable(): (x: number, z: number) => boolean {
  const Cs = 0.5, N = Math.round((MAP_LIM * 2) / Cs) + 1, idx = (x: number, z: number) => [Math.round((x + MAP_LIM) / Cs), Math.round((z + MAP_LIM) / Cs)] as const;
  const h = new Float32Array(N * N), ok = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = -MAP_LIM + i * Cs, z = -MAP_LIM + j * Cs; const y = standHeight(x, z, 99); h[i * N + j] = y;
    ok[i * N + j] = STATIC_BOXES.some((b) => x > b.min.x - 0.38 && x < b.max.x + 0.38 && z > b.min.z - 0.38 && z < b.max.z + 0.38 && y + PLAYER.height > b.min.y + 0.05 && y + 0.1 < b.max.y - 0.05) ? 0 : 1;
  }
  const seen = new Uint8Array(N * N), q: number[] = [];
  const [si, sj] = idx(PLAYER_SPAWN[0], PLAYER_SPAWN[2]); q.push(si * N + sj); seen[si * N + sj] = 1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k], i = (c / N) | 0, j = c % N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue; const n = a * N + b;
      if (seen[n] || !ok[n] || Math.abs(h[n] - h[c]) > REACH_UP) continue; seen[n] = 1; q.push(n);
    }
  }
  return (x, z) => { const [i, j] = idx(x, z); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < N && jj < N && seen[ii * N + jj]) return true; } return false; };
}

describe('POLISH pickups: placement', () => {
  for (const w of MAPS) {
    it(`${w}: fixed pickup spots + balloon drops are valid, outside solids and reachable`, () => {
      setWorld(w, true); const reach = reachable();
      expect(PICKUP_SPOTS.length).toBeGreaterThanOrEqual(8);
      for (const s of PICKUP_SPOTS) { const v = validPickupAt(s.x, s.z, groundHeight(s.x, s.z)); expect(v.ok, `spot ${s.x},${s.z}`).toBe(true); expect(reach(s.x, s.z), `reach ${s.x},${s.z}`).toBe(true); }
      for (const b of BALLOON_DEFS) { const r = resolvePickupSpot(b.x, b.z, groundHeight(b.x, b.z)); expect(pickupInsideSolid(r.x, r.y, r.z), `balloon ${b.x},${b.z}`).toBe(false); expect(reach(r.x, r.z), `balloon reach ${b.x},${b.z}`).toBe(true); }
    });
    it(`${w}: resolver gives a valid reachable spot for 600 random seeds-points (incl. inside blocks / river / edges)`, () => {
      setWorld(w, true); const reach = reachable(); let moved = 0;
      for (let seed = 1; seed <= 600; seed++) {
        const rnd = mulberry32(seed * 7919), x = (rnd() * 2 - 1) * 37, z = (rnd() * 2 - 1) * 37, ref = rnd() < 0.3 ? groundHeight(x, z) + rnd() * 2 : 0;
        const r = resolvePickupSpot(x, z, ref);
        expect(Number.isFinite(r.x + r.y + r.z)).toBe(true);
        expect(pickupInsideSolid(r.x, r.y, r.z), `seed ${seed} (${x.toFixed(1)},${z.toFixed(1)})`).toBe(false);
        expect(Math.abs(r.x) <= MAP_LIM + 1e-6 && Math.abs(r.z) <= MAP_LIM + 1e-6).toBe(true);
        expect(r.y).toBeGreaterThanOrEqual(groundHeight(r.x, r.z) + 0.5);
        expect(reach(r.x, r.z), `reach seed ${seed} (${x.toFixed(1)},${z.toFixed(1)}) -> ${r.x.toFixed(1)},${r.z.toFixed(1)}`).toBe(true);
        if (Math.hypot(r.x - x, r.z - z) > 0.01) moved++;
      }
      expect(moved).toBeGreaterThan(0);
    });
  }
  it('boss plaza clamp keeps drops inside the allowed radius', () => {
    setWorld('candy', true);
    for (let a = 0; a < 40; a++) { const r = resolvePickupSpot(Math.cos(a) * 30, Math.sin(a) * 30, 0, 15); expect(Math.hypot(r.x, r.z)).toBeLessThanOrEqual(15.01); }
  });
});

describe('POLISH pickups: radius logic with vertical offset', () => {
  const H = PLAYER.height;
  it('uses body centre, so elevated candies and jumping players both work', () => {
    const pk = { x: 0, y: 0.55, z: 0 };
    expect(inCollectRange(pk, { x: 1.0, y: 0, z: 0 }, H)).toBe(true);
    expect(inCollectRange(pk, { x: 1.7, y: 0, z: 0 }, H)).toBe(false);
    expect(inCollectRange(pk, { x: 0, y: 1.4, z: 0 }, H)).toBe(true);     // at the jump apex
    expect(inCollectRange(pk, { x: 0, y: 3.2, z: 0 }, H)).toBe(false);    // on the floor above
    expect(inCollectRange({ x: 0, y: 2.95, z: 0 }, { x: 0, y: 2.4, z: 0 }, H)).toBe(true); // dome top
    expect(inCollectRange({ x: 0, y: 2.95, z: 0 }, { x: 0, y: 0, z: 0 }, H)).toBe(false);  // far below the dome
    expect(inCollectRange({ x: 0, y: 1.85, z: 0 }, { x: 0, y: 0, z: 0 }, H)).toBe(true);   // candy on a 1.3 m block, player on the ground
    expect(COLLECT_R).toBeGreaterThan(1.4);
    expect(inMagnetRange(pk, { x: 3.0, y: 0, z: 0 }, H)).toBe(true);
    expect(inMagnetRange(pk, { x: 4, y: 0, z: 0 }, H)).toBe(false);
  });
});

function sandbox<T>(map: WorldId, fn: (step: (n?: number, each?: () => void) => void) => T, seed = 3, coop = false): T {
  return withSeed(seed, () => withVirtualTime((adv) => {
    input.reset(); evq.recording = coop; evq.list = [];
    if (coop) runFlow.startCoopRun('survival', ['mochi', 'bubu'] as any, ['A', 'B'], [null, createRemoteInput()], 1, map);
    else runFlow.startRun('survival', 'mochi', 1, map);
    useUI.getState().set({ phase: 'playing' } as any);
    world.run.waveDefs = []; world.cinematic = 0; world.waves.timer = 1e9 as any;
    const step = (n = 1, each?: () => void) => { for (let i = 0; i < n; i++) { each?.(); tick(adv); } };
    step(2); for (const e of world.enemies.items) e.active = false;
    for (const pk of world.pickups.items) pk.active = false;
    try { return fn(step); } finally { input.reset(); evq.recording = false; evq.list = []; }
  }));
}
const put = (p: typeof world.player, x: number, y: number, z: number) => { p.pos = v3(x, y, z); p.prev = v3(x, y, z); p.vel = v3(0, 0, 0); p.invuln = 99; };
const drop = (kind: 'hp' | 'ammo', x: number, z: number, y?: number) => { const pk = world.pickups.spawn()!; pk.kind = kind; pk.pos.x = x; pk.pos.z = z; pk.pos.y = y ?? groundHeight(x, z) + 0.55; pk.life = 30; pk.spot = -1; pk.age = 1; return pk; };

describe('POLISH pickups: collection in the simulation', () => {
  for (const w of MAPS) {
    it(`${w}: hp candy heals, ammo candy refills`, () => sandbox(w, (step) => {
      const p = world.player; put(p, 3, 0, 3); step(2);
      p.hp = 40; const a = drop('hp', 3.5, 3); step(3); expect(a.active).toBe(false); expect(p.hp).toBeCloseTo(70, 0);
      p.arsenal.states.forEach((st) => { st.ammo = 0; }); const b = drop('ammo', 3.5, 3); step(3); expect(b.active).toBe(false); expect(p.arsenal.states.every((st) => st.ammo > 0)).toBe(true);
    }));
    it(`${w}: a full player can still collect — candy turns into a score bonus (no silent rejection)`, () => sandbox(w, (step) => {
      const p = world.player; put(p, 3, 0, 3); step(2); p.hp = p.maxHp; const s0 = world.score;
      const a = drop('hp', 3.2, 3); step(3); expect(a.active).toBe(false); expect(world.score).toBe(s0 + PICKUP_BONUS.hp);
      const b = drop('ammo', 3.2, 3); step(3); expect(b.active).toBe(false); expect(world.score).toBe(s0 + PICKUP_BONUS.hp + PICKUP_BONUS.ammo);
    }));
    it(`${w}: a jumping player collects a candy; magnet pulls a needed candy but not an unneeded one`, () => sandbox(w, (step) => {
      const p = world.player; put(p, 3, 0, 3); step(2); p.hp = 30;
      const a = drop('hp', 3, 3); put(p, 3.4, 1.2, 3); p.grounded = false; world.player.vel.y = 0; step(1); expect(a.active).toBe(false);
      put(p, 3, 0, 3); step(2); p.hp = 30; const b = drop('hp', 3 + 2.9, 3); step(120, () => { p.invuln = 99; }); expect(b.active, 'magnet should have collected it').toBe(false);
      put(p, 3, 0, 3); step(2); p.hp = p.maxHp; const c = drop('hp', 3 + 2.9, 3); step(60, () => { p.invuln = 99; p.hp = p.maxHp; }); expect(c.active).toBe(true); expect(c.pos.x).toBeCloseTo(5.9, 1);
    }));
    it(`${w}: every fixed spot respawns a candy on a valid spot and a walking player can pick it up`, () => sandbox(w, (step) => {
      const p = world.player;
      PICKUP_SPOTS.forEach((s, i) => {
        world.spotTimers[i] = 0.01; step(3);
        const pk = world.pickups.items.find((q) => q.active && q.spot === i)!; expect(pk, `spot ${i} spawned`).toBeTruthy();
        expect(pickupInsideSolid(pk.pos.x, pk.pos.y, pk.pos.z)).toBe(false);
        put(p, pk.pos.x, pk.pos.y - 0.55, pk.pos.z); p.hp = 50; step(3); expect(pk.active, `spot ${i} (${s.x},${s.z}) collectible`).toBe(false);
      });
    }));
    it(`${w}: every balloon drops a candy that can be collected`, () => sandbox(w, (step) => {
      const p = world.player;
      world.balloons.forEach((b, i) => {
        for (const q of world.pickups.items) q.active = false;
        _pickupHooks.popBalloon(b); const pk = world.pickups.items.find((q) => q.active)!; expect(pk, `balloon ${i} drop`).toBeTruthy();
        expect(pickupInsideSolid(pk.pos.x, pk.pos.y, pk.pos.z)).toBe(false);
        put(p, pk.pos.x, pk.pos.y - 0.55, pk.pos.z); p.hp = 20; p.arsenal.states.forEach((st) => { st.ammo = 0; }); step(3);
        expect(pk.active, `balloon ${i} candy collectible`).toBe(false);
      });
    }));
    it(`${w}: enemy drops are placed validly (60 forced drops) and collectible`, () => sandbox(w, (step) => {
      const p = world.player; const types = ['windup', 'gumdrop', 'choco', 'bsoldier', 'bgolem', 'drone'] as const; let n = 0;
      for (let i = 0; i < 60; i++) {
        for (const q of world.pickups.items) q.active = false;
        const rnd = mulberry32(i + 1), x = (rnd() * 2 - 1) * 30, z = (rnd() * 2 - 1) * 30;
        const e = spawnEnemy(types[i % types.length] as any, x, z); if (!e) continue; e.hp = 1;
        const orig = Math.random; Math.random = () => 0; try { _pickupHooks.maybeDrop(e); } finally { Math.random = orig; }
        e.active = false; const pk = world.pickups.items.find((q) => q.active); if (!pk) continue; n++;
        expect(pickupInsideSolid(pk.pos.x, pk.pos.y, pk.pos.z), `drop ${i} (${x.toFixed(1)},${z.toFixed(1)})`).toBe(false);
        put(p, pk.pos.x, pk.pos.y - 0.55, pk.pos.z); p.hp = 10; p.arsenal.states.forEach((st) => { st.ammo = 0; }); step(2); expect(pk.active).toBe(false);
      }
      expect(n).toBeGreaterThan(40);
    }));
  }
  it('candy: candies on elevated dome terrain are collected from the dome, not from the ground below', () => sandbox('candy', (step) => {
    setWorld('candy'); const p = world.player; const s = PICKUP_SPOTS.find((q) => groundHeight(q.x, q.z) > 2)!; expect(s).toBeTruthy();
    world.spotTimers.fill(-1); const pk = drop(s.kind, s.x, s.z);
    p.hp = 10; p.arsenal.states.forEach((st) => { st.ammo = 0; });
    put(p, s.x, groundHeight(s.x, s.z), s.z + 1); step(2); expect(pk.active).toBe(false);
  }));
});

describe('POLISH pickups: co-op', () => {
  for (const w of MAPS) {
    it(`${w}: the guest (slot 1) collects hp + ammo candies on the host sim, events reach the guest, snapshot drops the candy`, () => sandbox(w, (step) => {
      const g = world.slots[1].player, h = world.slots[0].player; expect(world.slots.length).toBe(2);
      put(h, -20, 0, -20); put(g, 3, 0, 3); step(2); g.hp = 30; g.arsenal.states.forEach((st) => { st.ammo = 0; }); h.hp = h.maxHp;
      const a = drop('hp', 3.3, 3), b = drop('ammo', 3.3, 3.4); drain();
      expect(JSON.parse(JSON.stringify(buildSnapshot(1))).pk.length).toBe(2);
      step(3, () => { g.invuln = 99; h.invuln = 99; });
      expect(a.active).toBe(false); expect(b.active).toBe(false); expect(g.hp).toBeCloseTo(30 + g.maxHp * 0.3, 0); expect(g.arsenal.states.every((st) => st.ammo > 0)).toBe(true);
      expect(h.hp).toBe(h.maxHp);
      const ev = drain(); expect(ev.some((e) => e[1] === 'sx' && e[2] === 'pickup'), 'pickup sound event').toBe(true); expect(ev.some((e) => e[1] === 'b'), 'pop burst event').toBe(true);
      expect(JSON.parse(JSON.stringify(buildSnapshot(2))).pk.length).toBe(0);
    }, 5, true));
    it(`${w}: in co-op the magnet pulls candies towards whichever player needs them`, () => sandbox(w, (step) => {
      const g = world.slots[1].player, h = world.slots[0].player;
      put(h, 10, 0, -10); h.hp = h.maxHp; put(g, 3, 0, 3); step(2); g.hp = 20;
      const a = drop('hp', 3 + 2.9, 3); step(150, () => { g.invuln = 99; h.invuln = 99; h.hp = h.maxHp; });
      expect(a.active).toBe(false); expect(g.hp).toBeGreaterThan(20);
    }, 6, true));
  }
});
