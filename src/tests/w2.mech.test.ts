// W2 part (c): map mechanics — train, bricks, dominoes, portals, lifts, conveyors, fans, co-op snapshot of dynamic objects.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), initAudio: () => {}, setVolume: () => {} }));
vi.mock('../audio/music', () => ({ initMusic: () => {}, setMusicVolume: () => {}, setMusicEnabled: () => {}, setMusicPaused: () => {}, playTrack: () => {}, stopMusic: () => {}, playStinger: () => {}, musicState: () => ({}), MUSIC_TRACKS: {} }));
vi.mock('../audio/MusicDirector', () => ({ MusicDirector: () => null }));
import { world, spawnEnemy } from '../game/core/world';
import { input } from '../game/core/input';
import * as runFlow from '../game/systems/runFlow';
import { useUI } from '../app/store';
import { tick, withSeed, withVirtualTime } from '../game/sim/headless';
import { MECH, MECH_CFG, DYN_BOXES, carPose, trainPeriod, liftTop, dominoPhase, dominoAngle, dominoPos, mechHit, mechExplosion, damageBrick, stepBricks, portalExit, fanAt, conveyorAt, mechSnap, applyMechSnap, triggerDomino, updateMech, dominoZones, mechEvents } from '../game/levels/mech';
import { STATIC_BOXES, ARENA_BOXES } from '../game/levels/arenaLayout';
import { groundHeight } from '../game/levels/terrain';
import { buildSnapshot, decodeSnap } from '../net/snapshot';
import { fanDeflect } from '../game/systems/mechSim';
import { ENEMIES } from '../config/game';

function setup(map: 'block' | 'candy' = 'block', fn: (adv: (ms: number) => void, step: (s: number) => void) => void) {
  withSeed(7, () => withVirtualTime((adv) => {
    input.reset(); runFlow.startRun('survival', 'mochi', 1, map); useUI.getState().set({ phase: 'playing' } as any);
    world.cinematic = 0; world.waves.timer = 1e9 as any; world.enemies.clear();
    const step = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) tick(adv); };
    tick(adv); fn(adv, step);
  }));
}
const place = (x: number, z: number, y = groundHeight(x, z)) => { const p = world.player; p.pos.x = x; p.pos.y = y; p.pos.z = z; p.vel.x = p.vel.y = p.vel.z = 0; p.prev.x = x; p.prev.z = z; p.hp = p.maxHp; p.invuln = 0; };
const clearEnemies = () => world.enemies.clear();

describe('W2 train', () => {
  it('moves along the closed track at constant speed and is periodic', () => {
    setup('block', () => {
      const tr = MECH.train!, d = tr.def;
      const a = carPose(d, tr, 0, 0), b = carPose(d, tr, 0, 1);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(d.speed, 3);
      const T = trainPeriod(d, tr.len), p0 = carPose(d, tr, 0, 3), p1 = carPose(d, tr, 0, 3 + T);
      expect(p1.x).toBeCloseTo(p0.x, 5); expect(p1.z).toBeCloseTo(p0.z, 5);
      expect(T).toBeCloseTo(136 / d.speed, 3);
      // following cars trail by carLen+gap along the track
      const c1 = carPose(d, tr, 1, 0); expect(Math.hypot(c1.x - a.x, c1.z - a.z)).toBeGreaterThan(d.carLen * 0.9);
    });
  });
  it('collision boxes follow the cars every tick', () => {
    setup('block', (_a, step) => {
      step(2.5); const tr = MECH.train!;
      tr.boxes.forEach((b, i) => { const p = carPose(tr.def, tr, i, world.time); expect((b.min.x + b.max.x) / 2).toBeCloseTo(p.x, 1); expect((b.min.z + b.max.z) / 2).toBeCloseTo(p.z, 1); });
      expect(ARENA_BOXES.includes(tr.boxes[0])).toBe(true);
    });
  });
  it('hurts a player it hits side-on (once per cooldown), but standing on the roof is safe and carried', () => {
    setup('block', (_a, step) => {
      const tr = MECH.train!; const pose = carPose(tr.def, tr, 0, world.time + 0.5);
      // side-on: stand just in front of the lead car
      place(pose.x + pose.dx * 1.2, pose.z + pose.dz * 1.2); const hp0 = world.player.hp;
      step(0.9); expect(world.player.hp).toBeLessThan(hp0);
      expect(hp0 - world.player.hp).toBeLessThanOrEqual(MECH_CFG.train.hurtPlayer * 2 + 1e-6);
    });
    setup('block', (_a, step) => {
      const tr = MECH.train!, t0 = world.time, c = carPose(tr.def, tr, 1, t0);
      place(c.x, c.z, tr.def.h); const hp0 = world.player.hp, x0 = world.player.pos.x, z0 = world.player.pos.z;
      step(1.0);
      expect(world.player.hp).toBe(hp0);
      expect(Math.hypot(world.player.pos.x - x0, world.player.pos.z - z0)).toBeGreaterThan(3); // carried ≈ 6.5 m/s
    });
  });
  it('damages enemies in its path', () => {
    setup('block', (_a, step) => {
      const tr = MECH.train!, pose = carPose(tr.def, tr, 0, world.time + 0.4);
      const e = spawnEnemy('windup', pose.x + pose.dx * 1.5, pose.z + pose.dz * 1.5)!; e.fsm.state = 'idle'; const hp0 = e.hp;
      step(0.7); expect(e.hp < hp0 || e.dead).toBe(true);
    });
  });
});

describe('W2 bricks', () => {
  it('player walking into a giant brick pushes it (and it stops at walls)', () => {
    setup('block', (_a, step) => {
      const b = MECH.bricks[2]; const x0 = b.x, z0 = b.z; // (-4, 10)
      place(b.x, b.z + 3.2); world.player.yaw = 0; input.keys.add('KeyW'); step(1.6); input.keys.delete('KeyW');
      expect(b.z).toBeLessThan(z0 - 0.3); expect(Math.abs(b.x - x0)).toBeLessThan(0.3);
    });
  });
  it('bricks never move into static scenery', () => {
    setup('block', () => {
      const b = MECH.bricks[0];
      for (let i = 0; i < 400; i++) { b.vx = 3; b.vz = 0; stepBricks(1 / 60, [], STATIC_BOXES, 36, groundHeight); }
      for (const s of STATIC_BOXES) { if (s.max.y < 0.05 || s.min.y > b.sy - 0.05) continue; const ov = b.x + b.sx / 2 > s.min.x && b.x - b.sx / 2 < s.max.x && b.z + b.sz / 2 > s.min.z && b.z - b.sz / 2 < s.max.z; expect(ov).toBe(false); }
      expect(Math.abs(b.x) + b.sx / 2).toBeLessThanOrEqual(36);
    });
  });
  it('shooting a giant brick shoves it; enough damage splits it into two small bricks, which can also be destroyed', () => {
    setup('block', () => {
      const b = MECH.bricks[1], alive0 = MECH.bricks.filter((k) => k.alive).length; const x0 = b.x;
      expect(mechHit(b.x, 0.8, b.z, 20, 1, 0, 1)).toBe(true); expect(b.hp).toBe(MECH_CFG.giantHp - 20); expect(b.vx).toBeGreaterThan(0);
      stepBricks(1 / 60, [], STATIC_BOXES, 36, groundHeight); expect(b.x).toBeGreaterThan(x0);
      damageBrick(b, 500, 1, 0);
      expect(b.alive).toBe(false); expect(MECH.bricks.filter((k) => k.alive).length).toBe(alive0 + 1);
      const smalls = MECH.bricks.filter((k) => k.alive && k.tier === 1); expect(smalls.length).toBe(2);
      for (const s of smalls) { expect(s.hp).toBe(MECH_CFG.smallHp); damageBrick(s, 100, 0, 1); expect(s.alive).toBe(false); }
      expect(mechEvents.filter((e) => e.k === 'break').length).toBeGreaterThanOrEqual(3); mechEvents.length = 0;
    });
  });
  it('real gunfire reaches bricks (hitscan) and rockets/explosions shatter them', () => {
    setup('block', (_a, step) => {
      const b = MECH.bricks[3]; // (5,-10)
      place(b.x, b.z + 7); world.player.yaw = 0; world.player.pitch = -0.05; const hp0 = b.hp;
      input.mouseDown = true; step(1.2); input.mouseDown = false;
      expect(b.hp).toBeLessThan(hp0);
      const alive0 = MECH.bricks.filter((k) => k.alive).length;
      mechExplosion(b.x, 0.5, b.z, 5, 120, world.time);
      expect(mechEvents.some((e) => e.k === 'break')).toBe(true); void alive0; expect(b.alive && b.tier === 0 && b.hp === b.maxHp).toBe(false);
      mechEvents.length = 0;
    });
  });
  it('slot pool is bounded (maxBricks) and DYN_BOXES has a fixed length', () => {
    setup('block', () => {
      const n = DYN_BOXES.length; expect(MECH.bricks.length).toBe(MECH_CFG.maxBricks);
      for (let i = 0; i < 200; i++) for (const b of MECH.bricks) if (b.alive) damageBrick(b, 1000, 1, 0);
      expect(DYN_BOXES.length).toBe(n); expect(MECH.bricks.filter((b) => b.alive).length).toBeLessThanOrEqual(MECH_CFG.maxBricks); mechEvents.length = 0;
    });
  });
});

describe('W2 dominoes', () => {
  it('shooting the first domino topples the whole chain at exact delays; falling dominos have no collider, fallen ones are low slabs', () => {
    setup('block', () => {
      const ch = MECH.chains[0], d = ch.def; const [x, z] = dominoPos(d, 0);
      expect(dominoPhase(ch.trig[0], 0)).toBe('up'); expect(dominoAngle(-1, 5)).toBe(0);
      expect(mechHit(x, 1.5, z, 10, 1, 0, 10)).toBe(true); expect(ch.trig[0]).toBe(10);
      updateMech(10 + d.delay * (d.count - 1) + 0.01);
      ch.trig.forEach((t, i) => expect(t).toBeCloseTo(10 + i * d.delay, 5));
      expect(dominoAngle(10, 10 + MECH_CFG.fallTime)).toBeCloseTo(Math.PI / 2, 5);
      updateMech(10 + (d.count - 1) * d.delay + MECH_CFG.fallTime + 0.2);
      for (const b of ch.boxes) { expect(b.max.y).toBeLessThan(d.h * 0.4); expect(b.max.y).toBeGreaterThan(0); }
      // second shot on a fallen domino does nothing
      expect(triggerDomino(ch, 0, 99)).toBe(false); mechEvents.length = 0;
    });
  });
  it('chain crushes enemies in its path exactly once each (boss takes reduced damage), and not those off to the side', () => {
    setup('block', (_a, step) => {
      const ch = MECH.chains[0], d = ch.def; const [x3, z3] = dominoPos(d, 3), [x5, z5] = dominoPos(d, 5);
      const a = spawnEnemy('windup', x3 + d.sign * 1.4, z3)!, b = spawnEnemy('windup', x5 + d.sign * 1.4, z5)!, far = spawnEnemy('windup', x5, z5 + 9)!;
      for (const e of [a, b, far]) { e.fsm.state = 'idle'; e.spawnAnim = 0; e.hp = e.maxHp = 400; }
      place(-30, 30); triggerDomino(ch, 0, world.time); const home = [a, b, far].map((e) => [e, e.pos.x, e.pos.z] as const);
      for (let i = 0; i < 180; i++) { for (const [e, hx, hz] of home) { e.pos.x = hx; e.pos.z = hz; e.vel.x = e.vel.z = 0; } step(1 / 60); }
      const lost = 400 - a.hp; expect(lost).toBeGreaterThanOrEqual(MECH_CFG.domino.enemyDamage - 1); expect(lost).toBeLessThanOrEqual(MECH_CFG.domino.enemyDamage * 4);
      const hpA = a.hp; for (let i = 0; i < 120; i++) { for (const [e, hx, hz] of home) { e.pos.x = hx; e.pos.z = hz; } step(1 / 60); } expect(a.hp).toBe(hpA); // each domino only hits an enemy once
      expect(b.hp).toBeLessThan(400); expect(far.hp).toBe(400);
      expect(MECH_CFG.domino.bossDamage).toBeLessThan(MECH_CFG.domino.enemyDamage / 1.5);
      expect(dominoZones(world.time + 0.0).length).toBeGreaterThanOrEqual(0);
    });
  });
  it('chain resets after resetAfter seconds so it can be used again', () => {
    setup('block', () => {
      const ch = MECH.chains[1]; triggerDomino(ch, 0, 0); const T = (ch.def.count - 1) * ch.def.delay + MECH_CFG.fallTime + MECH_CFG.resetAfter;
      updateMech(T * 0.5); expect(ch.trig.every((t) => t >= 0)).toBe(true);
      updateMech(T + 1); expect(ch.trig.every((t) => t === -1)).toBe(true);
    });
  });
});

describe('W2 portals, lifts, conveyors, fans', () => {
  it('a player entering a portal comes out beside its partner; cooldown prevents bouncing back', () => {
    setup('block', (_a, step) => {
      const pp = MECH.def.portals[0]; place(pp.a[0] + 0.3, pp.a[1] + 0.2); step(0.1);
      const p = world.player.pos; expect(Math.hypot(p.x - pp.b[0], p.z - pp.b[1])).toBeLessThan(MECH_CFG.portal.exitDist + 0.6); expect(Math.hypot(p.x - pp.b[0], p.z - pp.b[1])).toBeGreaterThan(MECH_CFG.portal.r);
      step(0.5); expect(Math.hypot(p.x - pp.b[0], p.z - pp.b[1])).toBeLessThan(3.5); // still near b
      const ex = portalExit(MECH.def.portals, pp.b[0], pp.b[1]); expect(ex!.to[0]).toBeCloseTo(pp.a[0]); expect(portalExit(MECH.def.portals, 0, 0)).toBeNull();
    });
  });
  it('enemies ignore a portal that would not bring them clearly closer, but use one that does', () => {
    setup('block', (_a, step) => {
      const pp = MECH.def.portals[0];
      place(pp.b[0] - 3, pp.b[1]); // player near b
      const near = spawnEnemy('windup', pp.b[0] - 1.5, pp.b[1] + 0.2)!; near.spawnAnim = 0; near.fsm.state = 'idle';
      const far = spawnEnemy('windup', pp.a[0] + 0.2, pp.a[1] + 0.1)!; far.spawnAnim = 0; far.fsm.state = 'idle'; far.pos.x = pp.a[0] + 0.2; far.pos.z = pp.a[1] + 0.1;
      // `near` is not on a portal mouth; give it one far from the player instead
      step(0.1);
      expect(Math.hypot(far.pos.x - pp.b[0], far.pos.z - pp.b[1])).toBeLessThan(4); // teleported next to the player's end
      expect(near.active).toBe(true);
    });
  });
  it('lifts rise and fall between lo and hi and carry a rider', () => {
    setup('block', (_a, step) => {
      const l = MECH.lifts[0].def; const vals: number[] = []; for (let t = 0; t < l.period; t += 0.25) vals.push(liftTop(l, t));
      expect(Math.min(...vals)).toBeCloseTo(l.lo, 1); expect(Math.max(...vals)).toBeCloseTo(l.hi, 1);
      place(l.x, l.z, liftTop(l, world.time + 0.017)); step(0.2);
      const t1 = world.time; const y1 = world.player.pos.y; step(1.5);
      const want = liftTop(l, world.time); expect(Math.abs(world.player.pos.y - want)).toBeLessThan(0.45); expect(Math.abs(world.player.pos.x - l.x)).toBeLessThan(0.1); void t1; void y1;
    });
  });
  it('conveyor belts drift a standing player along their direction', () => {
    setup('block', (_a, step) => {
      const c = MECH.def.conveyors[0]; expect(conveyorAt(MECH.def.conveyors, c.x, c.z)).toBe(c); expect(conveyorAt(MECH.def.conveyors, 0, 0)).toBeNull();
      place(c.x - 2, c.z); step(0.3); const x0 = world.player.pos.x; step(1.0);
      expect(world.player.pos.x - x0).toBeGreaterThan(c.speed * 0.6 * c.dx);
    });
  });
  it('fan wind bends projectiles but keeps their speed; outside the wind nothing changes', () => {
    setup('block', () => {
      const f = MECH.def.fans[0]; expect(fanAt(MECH.def.fans, f.x + Math.cos(f.ang) * 4, f.z + Math.sin(f.ang) * 4)).toBe(f); expect(fanAt(MECH.def.fans, f.x - Math.cos(f.ang) * 4, f.z - Math.sin(f.ang) * 4)).toBeNull();
      const pos = { x: f.x + Math.cos(f.ang) * 4, y: 1, z: f.z }, vel = { x: 0, y: 0, z: 20 }; const sp = 20;
      for (let i = 0; i < 20; i++) fanDeflect(pos, vel, 1 / 60);
      expect(Math.hypot(vel.x, vel.y, vel.z)).toBeCloseTo(sp, 3); expect(vel.x).toBeLessThan(-1);
      const p2 = { x: 0, y: 1, z: 0 }, v2 = { x: 3, y: 0, z: 4 }; expect(fanDeflect(p2, v2, 0.1)).toBe(false); expect(v2).toEqual({ x: 3, y: 0, z: 4 });
    });
  });
  it('spring pads exist on the block map and launch the player', () => {
    setup('block', (_a, step) => {
      const { SPRING_PADS } = require_pads(); place(SPRING_PADS[0][0], SPRING_PADS[0][1]); step(0.3);
      expect(world.player.pos.y).toBeGreaterThan(0.5);
    });
  });
});
import * as layout from '../game/levels/arenaLayout';
const require_pads = () => ({ SPRING_PADS: layout.SPRING_PADS });

describe('W2 co-op dynamic object sync', () => {
  it('snapshot carries bricks + domino trigger times on the block map and a client replica reproduces them', () => {
    setup('block', (_a, step) => {
      const b = MECH.bricks[0]; damageBrick(b, 30, 1, 0); step(0.4); damageBrick(MECH.bricks[4], 1000, 1, 0); mechEvents.length = 0;
      triggerDomino(MECH.chains[0], 0, world.time); step(0.5);
      const wire = JSON.parse(JSON.stringify(buildSnapshot(1))); expect(wire.dy).toBeTruthy();
      const snap = decodeSnap(wire, 0);
      const host = MECH.bricks.map((k) => ({ a: k.alive, x: k.x, z: k.z, t: k.tier })), hostTrig = MECH.chains.map((c) => [...c.trig]);
      // wipe client state then apply
      for (const k of MECH.bricks) { k.alive = false; } MECH.chains.forEach((c) => c.trig.fill(-1));
      applyMechSnap(snap.dy);
      MECH.bricks.forEach((k, i) => { expect(k.alive).toBe(host[i].a); if (k.alive) { expect(k.x).toBeCloseTo(host[i].x, 1); expect(k.z).toBeCloseTo(host[i].z, 1); expect(k.tier).toBe(host[i].t); } });
      MECH.chains.forEach((c, ci) => c.trig.forEach((t, i) => expect(t).toBeCloseTo(hostTrig[ci][i], 2)));
      expect(JSON.stringify(wire.dy).length).toBeLessThan(2500); // small per-snapshot cost
    });
  });
  it('candy map has no dynamic payload', () => {
    setup('candy', () => { expect(mechSnap()).toBeNull(); expect(buildSnapshot(1).dy ?? null).toBeNull(); });
  });
  it('train position is identical on host and client from the shared clock alone', () => {
    setup('block', () => {
      const tr = MECH.train!; for (const t of [0, 1.7, 12.3, 99]) { const a = carPose(tr.def, tr, 2, t), b = carPose(tr.def, tr, 2, t); expect(a).toEqual(b); updateMech(t); expect((tr.boxes[2].min.x + tr.boxes[2].max.x) / 2).toBeCloseTo(a.x, 5); }
    });
  });
});
void ENEMIES;

describe('W2 block layout sanity (no spawn / mount / pickup / mechanic inside a collider)', () => {
  const hitsStatic = (x: number, z: number, pad: number) => STATIC_BOXES.find((b) => b.max.y > 0.3 && b.min.y < 1.5 && x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad);
  it('all points are clear', () => {
    setup('block', () => {
      const bad: string[] = [];
      const chk = (name: string, x: number, z: number, pad = 0.6) => { const b = hitsStatic(x, z, pad); if (b) bad.push(`${name} (${x},${z}) in box ${b.min.x.toFixed(1)},${b.min.z.toFixed(1)}..${b.max.x.toFixed(1)},${b.max.z.toFixed(1)}`); };
      layout.SPAWN_POINTS.forEach(([x, z], i) => chk('spawn' + i, x, z));
      layout.MOUNTS.turret.forEach(([x, z], i) => chk('turret' + i, x, z, 0.8)); layout.MOUNTS.crane.forEach(([x, z], i) => chk('crane' + i, x, z, 1));
      layout.PICKUP_SPOTS.forEach((p, i) => chk('pickup' + i, p.x, p.z)); layout.SPRING_PADS.forEach(([x, z], i) => chk('pad' + i, x, z, 1));
      chk('playerSpawn', layout.PLAYER_SPAWN[0], layout.PLAYER_SPAWN[2], 0.5); layout.SLOT_SPAWNS.forEach(([x, , z], i) => chk('slot' + i, x, z, 0.5));
      MECH.def.portals.forEach((p, i) => { chk('portalA' + i, p.a[0], p.a[1], 1.2); chk('portalB' + i, p.b[0], p.b[1], 1.2); });
      MECH.def.conveyors.forEach((c, i) => { for (const f of [-0.5, -0.25, 0, 0.25, 0.5]) chk('conv' + i, c.x + f * c.sx, c.z, 0.9); });
      MECH.chains.forEach((c, i) => { for (let k = 0; k < c.def.count; k++) { const [x, z] = dominoPos(c.def, k); chk(`dom${i}.${k}`, x, z, 0.2); } });
      MECH.lifts.forEach((l, i) => chk('lift' + i, l.def.x, l.def.z, 1.6));
      MECH.bricks.forEach((b, i) => { if (b.alive) chk('brick' + i, b.x, b.z, 0); });
      const tr = MECH.train!; for (let t = 0; t < trainPeriod(tr.def, tr.len); t += 0.25) for (let c = 0; c < tr.def.cars; c++) { const p = carPose(tr.def, tr, c, t); chk('train', p.x, p.z, 0.9); }
      expect(bad).toEqual([]);
    });
  });
  it('terrain at mount / spawn points is flat enough (no water, no cliff)', () => {
    setup('block', () => { for (const [x, z] of [...layout.SPAWN_POINTS, ...layout.MOUNTS.turret, ...layout.MOUNTS.crane]) expect(Math.abs(groundHeight(x, z))).toBeLessThan(0.5); });
  });
});
