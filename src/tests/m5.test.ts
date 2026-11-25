import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, spawnEnemy } from '../game/core/world';
import { input } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime, botPlayStage } from '../game/sim/headless';
import { CHAR_SKILLS, CharacterId } from '../game/characters/registry';
import { ARENA_BOXES, SPAWN_POINTS } from '../game/levels/arenaLayout';
import { ARENA, POOLS } from '../config/game';
import { computeCamera } from '../game/camera/cameraRig';
import { v3 } from '../game/core/math';

/** Start an empty arena (no wave spawner) for `ch`, run fn with a tick helper. */
function sandbox<T>(ch: CharacterId, fn: (step: (n?: number, each?: () => void) => void) => T, seed = 1): T {
  return withSeed(seed, () => withVirtualTime((adv) => {
    input.reset(); useUI.getState().set({ character: ch } as any);
    runFlow.startRun('adventure', ch, 1); useUI.getState().set({ phase: 'playing' } as any);
    world.run.waveDefs = []; world.cinematic = 0;
    const step = (n = 1, each?: () => void) => { for (let i = 0; i < n; i++) { each?.(); tick(adv); } };
    step(2); for (const e of world.enemies.items) e.active = false;
    world.player.pos = v3(2, 0, 4); world.player.prev = v3(2, 0, 4); step(2); // open spot in the central plaza
    try { return fn(step); } finally { input.reset(); }
  }));
}
const ahead = (d: number) => { const p = world.player.pos, f = world.cam.fwd, l = Math.hypot(f.x, f.z); return [p.x + f.x / l * d, p.z + f.z / l * d] as const; };
const tapF = () => input.pressed.add('KeyF');
const inside = (q: { x: number; y: number; z: number }, m = 0) => ARENA_BOXES.some((b) => q.x > b.min.x + m && q.x < b.max.x - m && q.y > b.min.y + m && q.y < b.max.y - m && q.z > b.min.z + m && q.z < b.max.z - m);

describe('M5: all 6 F skills trigger and have an effect', () => {
  it('candyDash (MOCHI) hits enemies in its path', () => sandbox('mochi', (step) => {
    const [x, z] = ahead(3.5); const e = spawnEnemy('tank', x, z)!; const hp0 = e.hp;
    tapF(); step(1); expect(world.player.dash.active).toBeGreaterThan(0); step(30);
    expect(e.hp).toBeLessThan(hp0); expect(world.stats.skillCasts).toBe(1);
  }));
  it('honeyShield (BUBU) absorbs damage', () => sandbox('bubu', (step) => {
    tapF(); step(1); expect(world.shield.hp).toBe(CHAR_SKILLS.bubu.params.absorb);
    const hp0 = world.player.hp, p = world.player.pos;
    const pr = world.projectiles.spawn()!; pr.pos = v3(p.x, 1, p.z - 2); pr.vel = v3(0, 0, 12); pr.life = 2; pr.damage = 20; pr.size = 0.5; pr.color = '#fff';
    step(20); expect(world.player.hp).toBe(hp0); expect(world.shield.hp).toBeLessThan(CHAR_SKILLS.bubu.params.absorb);
  }));
  it('phantomRoll (KIKI) rolls with i-frames and leaves a decoy that draws aggro', () => sandbox('kiki', (step) => {
    const start = { ...world.player.pos }; input.keys.add('KeyW'); tapF(); step(1);
    expect(world.decoy.t).toBeGreaterThan(3.5); expect(world.player.invuln).toBeGreaterThan(0); expect(world.player.roll.active).toBeGreaterThan(0);
    step(25); input.keys.delete('KeyW');
    expect(Math.hypot(world.player.pos.x - start.x, world.player.pos.z - start.z)).toBeGreaterThan(1);
    expect(Math.hypot(world.decoy.pos.x - start.x, world.decoy.pos.z - start.z)).toBeLessThan(0.5);
  }));
  it('mechBuddy (BOLT) deploys a turret that damages a visible enemy', () => sandbox('bolt', (step) => {
    const [x, z] = ahead(8); const e = spawnEnemy('tank', x, z)!; const hp0 = e.hp;
    tapF(); step(1); expect(world.turret.t).toBeGreaterThan(7); step(90); expect(e.hp).toBeLessThan(hp0);
  }));
  it('starlightSnipe (LUNA) charges then pierces multiple enemies', () => sandbox('luna', (step) => {
    world.player.pitch = 0; step(1);
    const a = ahead(6), b = ahead(10); const e1 = spawnEnemy('tank', a[0], a[1])!, e2 = spawnEnemy('tank', b[0], b[1])!;
    const h1 = e1.hp, h2 = e2.hp; tapF(); step(1); expect(world.player.snipeCharge).toBeGreaterThan(0);
    step(45); expect(world.player.snipeCharge).toBeLessThanOrEqual(0); expect(e1.hp).toBeLessThan(h1); expect(e2.hp).toBeLessThan(h2);
  }));
  it('bubbleStorm (POPPY) damages and binds enemies in radius only', () => sandbox('poppy', (step) => {
    const p = world.player.pos; const near = spawnEnemy('tank', p.x + 3, p.z)!, far = spawnEnemy('tank', p.x - 15, p.z - 8 > -20 ? p.z - 8 : p.z)!;
    const h = near.hp, hf = far.hp; tapF(); step(1);
    expect(near.hp).toBeLessThan(h); expect(near.bound).toBeGreaterThan(0); expect(far.hp).toBe(hf);
  }));
});

describe('M5: collision', () => {
  it('player is contained by arena bounds and cover, never falls through the floor', () => {
    for (const keys of [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD']]) sandbox('mochi', (step) => {
      for (const k of keys) input.keys.add(k);
      step(60 * 12, () => { if (world.time % 0.5 < 0.02) input.pressed.add('Space'); });
      const p = world.player.pos;
      expect(Math.abs(p.x)).toBeLessThan(ARENA.half); expect(Math.abs(p.z)).toBeLessThan(ARENA.half);
      expect(p.y).toBeGreaterThanOrEqual(-0.01); expect(inside({ x: p.x, y: p.y + 0.5, z: p.z }, 0.05)).toBe(false);
    });
  });
  it('dash and roll never tunnel through cover or arena walls', () => {
    for (const ch of ['mochi', 'kiki'] as const) for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) sandbox(ch, (step) => {
      world.player.yaw = yaw; input.keys.add('KeyW');
      for (let n = 0; n < 12; n++) { world.player.dash.cd = 0; world.player.roll.cd = 0; tapF(); input.pressed.add('ShiftLeft');
        step(10, () => { const p = world.player.pos; expect(inside({ x: p.x, y: p.y + 0.5, z: p.z }, 0.05)).toBe(false); expect(Math.abs(p.x)).toBeLessThan(ARENA.half); expect(Math.abs(p.z)).toBeLessThan(ARENA.half); }); }
    });
  });
  it('camera never ends inside cover/walls (many positions & angles)', () => {
    const rnd = (s => () => ((s = (s * 16807) % 2147483647) / 2147483647))(42);
    let n = 0;
    for (let i = 0; i < 3000; i++) {
      const pos = v3((rnd() - 0.5) * 40, 0, (rnd() - 0.5) * 40);
      if (inside({ x: pos.x, y: 0.5, z: pos.z })) continue;
      const c = computeCamera(pos, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.2, world.raycast);
      expect(inside(c.pos, 0.02)).toBe(false); expect(c.pos.y).toBeGreaterThan(0); n++;
    }
    expect(n).toBeGreaterThan(2000);
  });
  it('enemy projectiles are stopped by cover', () => sandbox('mochi', (step) => {
    // block at (0,-11) 4x2.2x1.6; shoot from behind it toward a player standing in front
    world.player.pos = v3(0, 0, -7); const hp0 = world.player.hp;
    const pr = world.projectiles.spawn()!; pr.pos = v3(0, 1, -15); pr.vel = v3(0, 0, 14); pr.life = 3; pr.damage = 30; pr.size = 0.4; pr.color = '#fff';
    step(60); expect(pr.active).toBe(false); expect(world.player.hp).toBe(hp0);
  }));
  it('enemies do not get stuck: patrol/chase keeps them moving, and chasers reach the player (16 seeds)', () => {
    for (let seed = 1; seed <= 16; seed++) sandbox('mochi', (step) => {
      world.player.pos = v3(0, 0, 0.5);
      const es = SPAWN_POINTS.map(([x, z], i) => spawnEnemy((['windup', 'bunny', 'tank', 'clown'] as const)[i % 4], x, z)!);
      const last = es.map((e) => ({ x: e.pos.x, z: e.pos.z })), stalls = es.map(() => 0), prevSt = es.map((e) => e.fsm.state + e.patrol.x + e.patrol.z); let reached = 0;
      const near = es.map(() => false);
      es.forEach((e, i) => { if (i % 3 !== 2) { e.fsm.state = 'chase'; e.fsm.timer = 0; } }); // gates are far: aggro two thirds, leave the rest to patrol
      for (let w = 0; w < 16; w++) {
        step(60 * 2.5, () => { world.player.invuln = 9; world.player.hp = world.player.maxHp; es.forEach((e, i) => { if (Math.hypot(e.pos.x - world.player.pos.x, e.pos.z - world.player.pos.z) < 4) near[i] = true; }); });
        es.forEach((e, i) => { if (!e.active || e.dead || near[i]) return; const dP = Math.hypot(e.pos.x - world.player.pos.x, e.pos.z - world.player.pos.z);
          const trying = (e.fsm.state === 'chase' && !(e.type === 'tank' && dP < 13.5)) || // tanks deliberately hold position inside 11 m
            (e.fsm.state === 'patrol' && Math.hypot(e.patrol.x - e.pos.x, e.patrol.z - e.pos.z) > 1);
          if (trying && (e.fsm.state !== 'patrol' ? prevSt[i].startsWith(e.fsm.state) : prevSt[i] === e.fsm.state + e.patrol.x + e.patrol.z) && Math.hypot(e.pos.x - last[i].x, e.pos.z - last[i].z) < 0.3) stalls[i]++; // idle→patrol flips right at the sample are not stalls
          last[i] = { x: e.pos.x, z: e.pos.z }; });
        es.forEach((e, i) => { prevSt[i] = e.fsm.state + e.patrol.x + e.patrol.z; });
      }
      reached = near.filter(Boolean).length;
      if (Math.max(...stalls) > 1) console.log('STALL', seed, stalls.join(','), es.map(e => e.type + ':' + e.fsm.state + '@' + e.pos.x.toFixed(1) + ',' + e.pos.z.toFixed(1) + '>' + e.patrol.x.toFixed(1) + ',' + e.patrol.z.toFixed(1)).join(' '));
      expect(Math.max(...stalls)).toBeLessThanOrEqual(1); // trying to move but not moving: at most one 2.5 s window
      expect(reached).toBeGreaterThanOrEqual(3);
    }, seed);
  });
});

describe('M5: pools stay bounded under stress', () => {
  it('long boss + survival bot runs never grow pools', () => {
    botPlayStage('poppy', 3, 7, { skill: 'good', maxTime: 120 });
    botPlayStage('bolt', 1, 3, { skill: 'average', maxTime: 120 });
    expect(world.enemies.items.length).toBe(POOLS.enemies); expect(world.projectiles.items.length).toBe(POOLS.projectiles);
    expect(world.sparks.items.length).toBe(POOLS.sparks); expect(world.tracers.items.length).toBe(POOLS.tracers);
    expect(world.hazards.length).toBeLessThanOrEqual(24);
  }, 60000);
});
