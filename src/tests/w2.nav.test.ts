// W2 part (g): navigation sanity on the Block City map — enemies never stall, the camera never ends inside geometry.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, spawnEnemy } from '../game/core/world';
import { input } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime } from '../game/sim/headless';
import { ARENA_BOXES, SPAWN_POINTS } from '../game/levels/arenaLayout';
import { computeCamera } from '../game/camera/cameraRig';
import { ENEMIES } from '../config/game';
import { v3 } from '../game/core/math';

function blockSandbox<T>(fn: (step: (n?: number, each?: () => void) => void) => T, seed: number): T {
  return withSeed(seed, () => withVirtualTime((adv) => {
    input.reset(); runFlow.startRun('survival', 'mochi', 1, 'block'); useUI.getState().set({ phase: 'playing' } as any);
    world.run.waveDefs = []; world.cinematic = 0; world.waves.timer = 1e9 as any;
    const step = (n = 1, each?: () => void) => { for (let i = 0; i < n; i++) { each?.(); tick(adv); } };
    step(2); for (const e of world.enemies.items) e.active = false;
    world.player.pos = v3(0, 0, 4); world.player.prev = v3(0, 0, 4); step(2);
    try { return fn(step); } finally { input.reset(); }
  }));
}
const inside = (q: { x: number; y: number; z: number }, m = 0) => ARENA_BOXES.some((b) => q.x > b.min.x + m && q.x < b.max.x - m && q.y > b.min.y + m && q.y < b.max.y - m && q.z > b.min.z + m && q.z < b.max.z - m);

describe('W2 nav: Block City', () => {
  it('has spawn points outside geometry', () => {
    blockSandbox(() => { expect(SPAWN_POINTS.length).toBeGreaterThanOrEqual(6); for (const [x, z] of SPAWN_POINTS) expect(inside({ x, y: 0.5, z }, 0.05)).toBe(false); }, 1);
  });
  it('ground and chasing enemies do not get stuck on the block map (12 seeds)', () => {
    const types = ['bsoldier', 'windup', 'bunny', 'bgolem'] as const;
    let worst = 0, reachedMin = 99;
    for (let seed = 1; seed <= 12; seed++) blockSandbox((step) => {
      const es = SPAWN_POINTS.slice(0, 8).map(([x, z], i) => spawnEnemy(types[i % types.length] as any, x, z)!);
      es.forEach((e) => { e.fsm.state = 'chase'; e.fsm.timer = 0; });
      const last = es.map((e) => ({ x: e.pos.x, z: e.pos.z })), stalls = es.map(() => 0), near = es.map(() => false);
      for (let w = 0; w < 16; w++) {
        step(150, () => { world.player.invuln = 9; world.player.hp = world.player.maxHp; es.forEach((e, i) => { if (Math.hypot(e.pos.x - world.player.pos.x, e.pos.z - world.player.pos.z) < 4.5) near[i] = true; }); });
        es.forEach((e, i) => { if (!e.active || e.dead || near[i]) return; const dP = Math.hypot(e.pos.x - world.player.pos.x, e.pos.z - world.player.pos.z); if (e.fsm.state === 'chase' && dP > ENEMIES[e.type].attackRange && Math.hypot(e.pos.x - last[i].x, e.pos.z - last[i].z) < 0.3) stalls[i]++; last[i] = { x: e.pos.x, z: e.pos.z }; });
      }
      const sm = Math.max(...stalls); if (sm > 1) console.log('STALL', seed, stalls.join(','), es.map((e) => e.type + '@' + e.pos.x.toFixed(1) + ',' + e.pos.z.toFixed(1)).join(' '));
      worst = Math.max(worst, sm); reachedMin = Math.min(reachedMin, near.filter(Boolean).length);
    }, seed);
    expect(worst).toBeLessThanOrEqual(1);
    expect(reachedMin).toBeGreaterThanOrEqual(5);
  });
  it('camera never ends inside geometry on the block map (3000 samples)', () => {
    blockSandbox(() => {
      const rnd = (s => () => ((s = (s * 16807) % 2147483647) / 2147483647))(99);
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        const pos = v3((rnd() - 0.5) * 66, 0, (rnd() - 0.5) * 66);
        if (inside({ x: pos.x, y: 0.5, z: pos.z })) continue;
        const c = computeCamera(pos, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.2, world.raycast);
        expect(inside(c.pos, 0.02)).toBe(false); expect(c.pos.y).toBeGreaterThan(0); n++;
      }
      expect(n).toBeGreaterThan(2000);
    }, 1);
  });
});
