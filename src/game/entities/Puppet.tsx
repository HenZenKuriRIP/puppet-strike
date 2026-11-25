import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { world } from '../core/world';
import { PLAYER, SKILLS, WEAPON_SWITCH_TIME } from '../../config/game';
import type { CharacterSpec } from '../characters/registry';
import { surface, glossy, glow, flat, vinyl, metal } from './materials';
import { WeaponModels, Pistol } from './WeaponModels';

const lerp = THREE.MathUtils.lerp;
export type Expression = 'normal' | 'blink' | 'happy' | 'hurt' | 'ko' | 'focus';
const HEAD_Y = 1.24, HEAD_R = 0.36;

function Face({ spec, refs }: { spec: CharacterSpec; refs: Record<string, THREE.Object3D | null> }) {
  const c = spec.colors, robot = spec.id === 'bolt';
  const eyeMat = robot ? glow(c.eye, 1.4) : glossy(c.eye);
  const irisMat = robot ? glow('#ffffff', 1) : glossy(new THREE.Color(c.eye).lerp(new THREE.Color(c.accent), 0.45).getStyle());
  const dark = flat('#2b1d3d');
  const z = -HEAD_R * spec.headScale[2] + 0.04;
  const mouthY = spec.extras.includes('beak') ? -0.15 : -0.1;
  return (
    <group>
      {/* normal eyes (blink by scaling Y) */}
      <group ref={(g) => (refs.eyes = g)}>
        {[-1, 1].map((s) => (
          <group key={s} position={[0.135 * s, 0.02, z]}>
            <mesh scale={robot ? [1.2, 0.7, 0.4] : [0.9, 1.2, 0.45]} material={eyeMat}><sphereGeometry args={[0.075, 18, 14]} /></mesh>
            {!robot && <mesh position={[0, -0.018, -0.018]} scale={[0.85, 0.9, 0.35]} material={irisMat}><sphereGeometry args={[0.05, 14, 10]} /></mesh>}
            <mesh position={[0.022 * s, 0.035, -0.035]} material={flat('#ffffff')}><sphereGeometry args={[0.024, 10, 8]} /></mesh>
            <mesh position={[-0.02 * s, -0.03, -0.034]} material={flat('#ffffff')}><sphereGeometry args={[0.011, 8, 6]} /></mesh>
          </group>
        ))}
      </group>
      {/* happy ^ ^ */}
      <group ref={(g) => (refs.eyesHappy = g)} visible={false}>
        {[-1, 1].map((s) => <mesh key={s} position={[0.135 * s, 0.0, z - 0.005]} rotation-z={0} material={dark}><torusGeometry args={[0.05, 0.014, 6, 14, Math.PI]} /></mesh>)}
      </group>
      {/* hurt > < */}
      <group ref={(g) => (refs.eyesHurt = g)} visible={false}>
        {[-1, 1].map((s) => (
          <group key={s} position={[0.135 * s, 0.02, z - 0.01]}>
            <mesh position={[0, 0.018, 0]} rotation-z={0.5 * s} material={dark}><boxGeometry args={[0.08, 0.018, 0.02]} /></mesh>
            <mesh position={[0, -0.018, 0]} rotation-z={-0.5 * s} material={dark}><boxGeometry args={[0.08, 0.018, 0.02]} /></mesh>
          </group>
        ))}
      </group>
      {/* KO x x */}
      <group ref={(g) => (refs.eyesKo = g)} visible={false}>
        {[-1, 1].map((s) => (
          <group key={s} position={[0.135 * s, 0.02, z - 0.01]}>
            <mesh rotation-z={0.785} material={dark}><boxGeometry args={[0.09, 0.02, 0.02]} /></mesh>
            <mesh rotation-z={-0.785} material={dark}><boxGeometry args={[0.09, 0.02, 0.02]} /></mesh>
          </group>
        ))}
      </group>
      {/* cheeks */}
      {[-1, 1].map((s) => <mesh key={'c' + s} position={[0.22 * s, -0.075, z + 0.06]} scale={[1, 0.6, 0.3]} material={flat(c.cheek)}><sphereGeometry args={[0.055, 12, 8]} /></mesh>)}
      {/* nose / beak */}
      {spec.extras.includes('beak')
        ? <mesh position={[0, -0.06, z - 0.06]} rotation-x={-Math.PI / 2} material={vinyl(c.accent)}><coneGeometry args={[0.07, 0.14, 14]} /></mesh>
        : !robot && <mesh position={[0, -0.045, z - 0.012]} scale={[1.3, 0.9, 0.7]} material={glossy(c.accent2)}><sphereGeometry args={[0.024, 10, 8]} /></mesh>}
      {/* mouths */}
      <mesh ref={(g) => (refs.mouthSmile = g)} position={[0, mouthY, z - 0.004]} rotation-z={Math.PI} material={dark}><torusGeometry args={[0.035, 0.009, 6, 14, Math.PI]} /></mesh>
      <mesh ref={(g) => (refs.mouthOpen = g)} visible={false} position={[0, mouthY - 0.01, z - 0.005]} scale={[1, 1.2, 0.4]} material={dark}><sphereGeometry args={[0.03, 12, 8]} /></mesh>
      <group ref={(g) => (refs.mouthGrin = g)} visible={false} position={[0, mouthY, z - 0.005]}>
        <mesh rotation-x={Math.PI / 2} scale={[1.2, 1, 0.5]} material={dark}><sphereGeometry args={[0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <mesh position={[0, -0.02, -0.005]} scale={[1, 0.5, 0.4]} material={flat('#ff7a9a')}><sphereGeometry args={[0.025, 10, 8]} /></mesh>
      </group>
    </group>
  );
}

function Ears({ spec, refs, body }: { spec: CharacterSpec; refs: Record<string, THREE.Object3D | null>; body: THREE.Material }) {
  const c = spec.colors, inner = surface(spec.material, c.cheek);
  const set = (s: number) => (g: THREE.Group | null) => (refs[s < 0 ? 'earL' : 'earR'] = g);
  switch (spec.ears) {
    case 'bunny': return <>{[-1, 1].map((s) => (
      <group key={s} ref={set(s)} position={[0.15 * s, 0.28, 0.02]} rotation-z={-0.18 * s}>
        <mesh position={[0, 0.27, 0]} scale={[0.55, 1, 0.32]} material={body} castShadow><capsuleGeometry args={[0.11, 0.36, 8, 16]} /></mesh>
        <mesh position={[0, 0.27, -0.03]} scale={[0.32, 0.82, 0.2]} material={inner}><capsuleGeometry args={[0.11, 0.36, 8, 16]} /></mesh>
      </group>))}</>;
    case 'bear': return <>{[-1, 1].map((s) => (
      <group key={s} ref={set(s)} position={[0.25 * s, 0.24, 0.02]}>
        <mesh material={body} castShadow><sphereGeometry args={[0.11, 16, 12]} /></mesh>
        <mesh position={[0, 0, -0.06]} scale={[1, 1, 0.4]} material={surface(spec.material, c.belly)}><sphereGeometry args={[0.07, 12, 10]} /></mesh>
      </group>))}</>;
    case 'cat': return <>{[-1, 1].map((s) => (
      <group key={s} ref={set(s)} position={[0.2 * s, 0.25, 0]} rotation-z={-0.38 * s}>
        <mesh position={[0, 0.08, 0]} scale={[1, 1, 0.55]} material={body} castShadow><coneGeometry args={[0.12, 0.22, 16]} /></mesh>
        <mesh position={[0, 0.07, -0.04]} scale={[0.6, 0.75, 0.3]} material={inner}><coneGeometry args={[0.12, 0.22, 16]} /></mesh>
      </group>))}</>;
    case 'fox': return <>{[-1, 1].map((s) => (
      <group key={s} ref={set(s)} position={[0.2 * s, 0.26, 0.02]} rotation-z={-0.32 * s}>
        <mesh position={[0, 0.13, 0]} scale={[1, 1, 0.5]} material={body} castShadow><coneGeometry args={[0.14, 0.34, 16]} /></mesh>
        <mesh position={[0, 0.25, 0]} scale={[1, 1, 0.55]} material={surface(spec.material, '#fff4fb')}><coneGeometry args={[0.055, 0.11, 12]} /></mesh>
        <mesh position={[0, 0.1, -0.04]} scale={[0.55, 0.7, 0.3]} material={inner}><coneGeometry args={[0.14, 0.34, 16]} /></mesh>
      </group>))}</>;
    case 'antenna': return (
      <group ref={set(-1)} position={[0, 0.3, 0]}>
        <mesh position={[0, 0.1, 0]} material={metal(c.accent)}><cylinderGeometry args={[0.015, 0.02, 0.2, 8]} /></mesh>
        <mesh position={[0, 0.23, 0]} material={glow(c.accent2, 1.5)}><sphereGeometry args={[0.05, 14, 10]} /></mesh>
      </group>);
    default: return null;
  }
}

function Tail({ spec, refs, body }: { spec: CharacterSpec; refs: Record<string, THREE.Object3D | null>; body: THREE.Material }) {
  const catCurve = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.05, 0.18), new THREE.Vector3(0, 0.25, 0.28), new THREE.Vector3(0.05, 0.42, 0.22)]), 20, 0.035, 8), []);
  const c = spec.colors;
  return (
    <group ref={(g) => (refs.tail = g)} position={[0, 0.48, 0.25]}>
      {spec.tail === 'puff' && <mesh material={surface(spec.material, spec.id === 'mochi' ? '#ffffff' : c.body)}><sphereGeometry args={[0.09, 14, 10]} /></mesh>}
      {spec.tail === 'cat' && <><mesh geometry={catCurve} material={body} /><mesh position={[0.05, 0.42, 0.22]} material={body}><sphereGeometry args={[0.04, 10, 8]} /></mesh></>}
      {spec.tail === 'fox' && <group rotation-x={-0.6}>
        <mesh position={[0, 0.05, 0.12]} scale={[0.8, 0.8, 1.3]} material={body} castShadow><sphereGeometry args={[0.13, 16, 12]} /></mesh>
        <mesh position={[0, 0.12, 0.3]} scale={[0.9, 0.9, 1.2]} material={body} castShadow><sphereGeometry args={[0.14, 16, 12]} /></mesh>
        <mesh position={[0, 0.17, 0.45]} scale={[0.8, 0.8, 1]} material={surface(spec.material, '#fff4fb')}><sphereGeometry args={[0.11, 14, 10]} /></mesh>
      </group>}
      {spec.tail === 'penguin' && <mesh position={[0, -0.2, 0.02]} rotation-x={2.2} scale={[1.4, 1, 0.4]} material={body}><coneGeometry args={[0.08, 0.18, 10]} /></mesh>}
    </group>
  );
}

function Outfit({ spec }: { spec: CharacterSpec }) {
  const c = spec.colors, ex = spec.extras, M = (col: string) => surface(spec.material === 'metal' ? 'vinyl' : spec.material, col);
  return (
    <>
      {ex.includes('hoodie') && <>
        <mesh position={[0, 1.02, 0.2]} scale={[1, 0.75, 0.6]} material={plushOr(spec, c.accent)}><sphereGeometry args={[0.28, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.6]} /></mesh>
        <RoundedBox args={[0.26, 0.11, 0.06]} radius={0.03} position={[0, 0.5, -0.27]} material={M(c.accent)} />
        {[-1, 1].map((s) => <mesh key={s} position={[0.06 * s, 0.78, -0.27]} material={vinyl('#ffffff')}><capsuleGeometry args={[0.008, 0.08, 4, 6]} /></mesh>)}
      </>}
      {ex.includes('scarf') && <>
        <mesh position={[0, 0.9, 0]} rotation-x={Math.PI / 2} material={M(spec.id === 'luna' ? c.accent : c.accent)} castShadow><torusGeometry args={[0.2, 0.06, 12, 24]} /></mesh>
        <RoundedBox args={[0.1, 0.2, 0.04]} radius={0.02} position={[0.13, 0.78, -0.2]} rotation={[0.2, 0, 0.2]} material={M(spec.id === 'luna' ? c.accent : c.accent)} />
      </>}
      {ex.includes('bowtie') && <group position={[0, 0.9, -0.22]}>
        {[-1, 1].map((s) => <mesh key={s} position={[0.06 * s, 0, 0]} rotation-z={(Math.PI / 2) * s} material={glossy(c.accent)}><coneGeometry args={[0.05, 0.1, 10]} /></mesh>)}
        <mesh material={glossy(c.accent2)}><sphereGeometry args={[0.03, 10, 8]} /></mesh>
      </group>}
      {ex.includes('overalls') && <>
        <RoundedBox args={[0.3, 0.24, 0.06]} radius={0.03} position={[0, 0.62, -0.25]} material={M('#6fa8ff')} />
        <mesh position={[0, 0.42, 0]} material={M('#6fa8ff')}><cylinderGeometry args={[0.31, 0.3, 0.16, 20]} /></mesh>
        {[-1, 1].map((s) => <group key={s}><mesh position={[0.11 * s, 0.78, -0.18]} rotation-x={-0.4} material={M('#6fa8ff')}><boxGeometry args={[0.05, 0.22, 0.03]} /></mesh>
          <mesh position={[0.11 * s, 0.7, -0.29]} material={glossy(c.accent2)}><sphereGeometry args={[0.025, 8, 6]} /></mesh></group>)}
      </>}
      {ex.includes('moonCharm') && <group position={[0, 0.66, -0.27]}>
        <mesh rotation-z={0.6} material={glow(c.accent, 0.5)}><torusGeometry args={[0.06, 0.018, 8, 16, Math.PI * 1.3]} /></mesh>
        <mesh position={[0.05, 0.05, 0]} material={glow('#ffffff', 0.6)}><octahedronGeometry args={[0.02, 0]} /></mesh>
      </group>}
      {ex.includes('bolts') && <>
        <RoundedBox args={[0.24, 0.16, 0.04]} radius={0.02} position={[0, 0.62, -0.26]} material={glossy(c.belly)} />
        {[0, 1, 2].map((i) => <mesh key={i} position={[-0.06 + i * 0.06, 0.62, -0.285]} material={glow(['#ff7a59', '#7fffe0', '#ffe066'][i], 1)}><sphereGeometry args={[0.018, 8, 6]} /></mesh>)}
      </>}
    </>
  );
}
const plushOr = (spec: CharacterSpec, col: string) => surface(spec.material === 'metal' ? 'vinyl' : spec.material, col);

function HeadExtras({ spec }: { spec: CharacterSpec }) {
  const c = spec.colors, z = -HEAD_R * spec.headScale[2];
  return (
    <>
      {spec.extras.includes('beanie') && <group position={[0, 0.17, 0]}>
        <mesh material={plushOr(spec, c.accent2)} castShadow><sphereGeometry args={[0.33, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2.3]} /></mesh>
        <mesh position={[0, 0.05, 0]} rotation-x={Math.PI / 2} material={plushOr(spec, '#ffffff')}><torusGeometry args={[0.3, 0.045, 10, 26]} /></mesh>
        <mesh position={[0, 0.33, 0]} material={plushOr(spec, '#ffffff')}><sphereGeometry args={[0.08, 14, 10]} /></mesh>
      </group>}
      {spec.extras.includes('beak') && <mesh position={[0, -0.05, z + 0.12]} scale={[1, 0.85, 0.6]} material={surface(spec.material, c.belly)}><sphereGeometry args={[0.28, 20, 14]} /></mesh>}
      {spec.extras.includes('visor') && <RoundedBox args={[0.5, 0.2, 0.06]} radius={0.05} position={[0, 0.02, z + 0.02]} material={glossy('#1c2541')} />}
      {spec.extras.includes('bolts') && [-1, 1].map((s) => <mesh key={s} position={[0.39 * s, 0, 0]} rotation-z={Math.PI / 2} material={metal(c.accent)}><cylinderGeometry args={[0.07, 0.07, 0.06, 14]} /></mesh>)}
      {spec.ears === 'fox' && <mesh position={[0, -0.08, z + 0.06]} scale={[1.2, 0.7, 0.6]} material={surface(spec.material, '#fff4fb')}><sphereGeometry args={[0.14, 16, 10]} /></mesh>}
      {spec.ears === 'bear' && <mesh position={[0, -0.07, z + 0.05]} scale={[1.2, 0.8, 0.6]} material={surface(spec.material, c.belly)}><sphereGeometry args={[0.11, 16, 10]} /></mesh>}
      {spec.ears === 'cat' && [-1, 1].map((s) => [0, 1].map((j) => <mesh key={s + '' + j} position={[0.24 * s, -0.06 + j * 0.035, z + 0.06]} rotation-z={(0.15 - j * 0.3) * s} material={flat('#7a4a6a')}><boxGeometry args={[0.1, 0.006, 0.006]} /></mesh>))}
    </>
  );
}

interface PuppetProps { spec: CharacterSpec; mode: 'game' | 'preview'; wave?: boolean; seed?: number; weaponIndex?: number; slot?: number }

/** Procedural chibi designer-toy puppet (~2.5 heads tall). Same rig drives all 6 characters. */
export function Puppet({ spec, mode, wave = false, seed = 0, weaponIndex = 0, slot }: PuppetProps) {
  const root = useRef<THREE.Group>(null!), body = useRef<THREE.Group>(null!), head = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!), armR = useRef<THREE.Group>(null!), legL = useRef<THREE.Group>(null!), legR = useRef<THREE.Group>(null!);
  const gun = useRef<THREE.Group>(null!), weaponRefs = useRef<(THREE.Group | null)[]>([]);
  const parts = useRef<Record<string, THREE.Object3D | null>>({});
  const blink = useRef({ next: 1 + seed * 0.7, t: 0 });
  const tag = mode === 'game' ? 'game' : 'preview';
  const c = spec.colors, robot = spec.id === 'bolt' || spec.id === 'brix', penguin = spec.id === 'poppy', kiki = spec.extras.includes('dualPistols');
  const bodyMat = useMemo(() => surface(spec.material, c.body, tag) as THREE.MeshPhysicalMaterial, [spec, tag]);
  const bellyMat = surface(spec.material === 'metal' ? 'vinyl' : spec.material, c.belly);
  const footMat = vinyl(spec.id === 'bolt' ? c.accent : c.accent2);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime + seed * 1.37;
    const k = 1 - Math.exp(-18 * dt);
    const P = parts.current;
    let anim: string = 'idle', run = 0, sw = 0, pitch = 0, aimHold = 0, shootAnim = 0, switchT = 0, rollFrac = 0, flash = 0, inv = 0, sprint = false;
    if (mode === 'game') {
      const sl = world.slots[slot ?? world.local] ?? world.slots[0], p = sl.player, a = world.alpha;
      root.current.visible = sl.connected !== false;
      root.current.position.set(lerp(p.prev.x, p.pos.x, a), lerp(p.prev.y, p.pos.y, a), lerp(p.prev.z, p.pos.z, a));
      root.current.rotation.y = p.anim === 'victory' ? p.yaw + Math.PI + Math.sin(t * 3) * 0.3 : p.facing;
      weaponRefs.current.forEach((g, i) => g && (g.visible = i === p.arsenal.index));
      anim = p.anim; run = Math.min(1, p.speed / PLAYER.walkSpeed); sw = Math.sin(p.runPhase * 2.2); pitch = p.pitch;
      aimHold = p.aimHold; shootAnim = p.shootAnim; switchT = p.arsenal.switchTimer; rollFrac = 1 - p.roll.active / SKILLS.roll.duration;
      flash = p.flash > 0 ? 1 : 0; inv = p.invuln > 0 && (anim === 'dodge' || anim === 'dash') ? 0.35 : 0; sprint = p.sprinting;
    } else {
      weaponRefs.current.forEach((g, i) => g && (g.visible = !kiki && i === weaponIndex));
      anim = wave && (t % 5) < 2.2 ? 'wave' : 'idle';
    }
    // blink scheduler
    const b = blink.current; b.t += dt;
    const blinking = b.t > b.next && b.t < b.next + 0.13; if (b.t > b.next + 0.13) { b.t = 0; b.next = 2.2 + ((seed * 997 + t * 13) % 2.5); }
    // expression
    let expr: Expression = blinking ? 'blink' : 'normal';
    if (anim === 'hit') expr = 'hurt'; else if (anim === 'victory' || anim === 'wave') expr = 'happy'; else if (anim === 'defeat') expr = 'ko'; else if (anim === 'shoot' || anim === 'dash') expr = blinking ? 'blink' : 'focus';
    if (P.eyes) { P.eyes.visible = expr === 'normal' || expr === 'blink' || expr === 'focus'; P.eyes.scale.y = expr === 'blink' ? 0.12 : expr === 'focus' ? 0.8 : 1; }
    if (P.eyesHappy) P.eyesHappy.visible = expr === 'happy';
    if (P.eyesHurt) P.eyesHurt.visible = expr === 'hurt';
    if (P.eyesKo) P.eyesKo.visible = expr === 'ko';
    if (P.mouthSmile) P.mouthSmile.visible = expr === 'normal' || expr === 'blink' || expr === 'focus';
    if (P.mouthOpen) P.mouthOpen.visible = expr === 'hurt' || expr === 'ko';
    if (P.mouthGrin) P.mouthGrin.visible = expr === 'happy';

    let bodyY = Math.sin(t * 2.5) * 0.015, bodyRX = 0, sy = 1 + Math.sin(t * 2.5) * 0.025 * (1 - run), sz = 1;
    let earBase = 0.12 + run * 0.45, legLX = sw * 0.9 * run, legRX = -sw * 0.9 * run;
    let armRX = 0.9 + sw * 0.3 * run, armLX = -sw * 0.8 * run, armLZ = 0.2, armRZ = 0, gunRZ = 0, rootRX = 0, rootY = 0, headRZ = Math.sin(t * 1.3) * 0.05 * (1 - run);
    const aimX = Math.PI / 2 + pitch;
    if (mode === 'preview') { armRX = 0.25 + Math.sin(t * 2.5) * 0.05; armLX = 0.15; armLZ = 0.25; armRZ = -0.15; if (kiki) { armRX = armLX = 0.9; armLZ = -0.1; armRZ = 0.1; } }
    switch (anim) {
      case 'run': bodyY += Math.abs(sw) * 0.06 * run; bodyRX = -0.15 * run * (sprint ? 1.6 : 1); break;
      case 'jump': earBase = -0.35; legLX = -0.7; legRX = 0.3; armLX = 2.4; break;
      case 'shoot': armRX = aimX; armLX = aimX - 0.1; armLZ = kiki ? 0.15 : -0.6; bodyY += Math.abs(sw) * 0.04 * run; break;
      case 'reload': armRX = 0.5; armRZ = 0.3; gunRZ = Math.sin(t * 14) * 0.5; armLX = 0.9; armLZ = -0.7; break;
      case 'hit': bodyRX = 0.35; earBase = -0.5; armLX = -0.6; armRX = 0.2; headRZ = 0.25; break;
      case 'dodge': bodyRX = -rollFrac * Math.PI * 2; sy = 0.8; bodyY = -0.2 + Math.sin(rollFrac * Math.PI) * 0.15; legLX = legRX = -1.2; armLX = armRX = 1.6; earBase = 1.2; break;
      case 'dash': bodyRX = -0.7; sz = 1.25; earBase = 1.4; legLX = 0.8; legRX = 0.6; armRX = aimX; armLX = 1.2; break;
      case 'victory': { const hop = Math.abs(Math.sin(t * 5)); rootY = hop * 0.35; armLX = armRX = Math.PI * 0.95 + Math.sin(t * 10) * 0.2; armLZ = 0.5; armRZ = -0.5; earBase = -0.2 + Math.sin(t * 10) * 0.3; legLX = legRX = hop > 0.5 ? -0.3 : 0; break; }
      case 'defeat': rootRX = (Math.PI / 2) * 0.95; rootY = 0.32; earBase = 1.2; armLX = 2.6; armRX = 2.6; armLZ = 0.8; armRZ = -0.8; legLX = 0.2; legRX = -0.2; break;
      case 'wave': armRX = Math.PI * 0.92; armRZ = -0.45 + Math.sin(t * 9) * 0.35; earBase = -0.1 + Math.sin(t * 9) * 0.1; headRZ = Math.sin(t * 4.5) * 0.12; bodyY += Math.abs(Math.sin(t * 4.5)) * 0.03; break;
      default: if (aimHold > 0) { armRX = aimX; armLX = aimX - 0.1; armLZ = kiki ? 0.15 : -0.6; }
    }
    if (switchT > 0) armRX = lerp(armRX, 0.2, switchT / WEAPON_SWITCH_TIME);
    root.current.rotation.x = lerp(root.current.rotation.x, rootRX, 1 - Math.exp(-6 * dt));
    if (mode === 'game') root.current.position.y += rootY; else root.current.position.y = rootY;
    body.current.position.y = lerp(body.current.position.y, 0.6 + bodyY, k);
    body.current.rotation.x = anim === 'dodge' ? bodyRX : lerp(body.current.rotation.x, bodyRX, k);
    body.current.scale.set(1, sy, sz);
    head.current.rotation.x = -pitch * 0.4;
    head.current.rotation.z = lerp(head.current.rotation.z, headRZ, k);
    const eL = P.earL, eR = P.earR;
    if (eL) eL.rotation.x = lerp(eL.rotation.x, earBase + Math.sin(t * 3 + 1) * 0.08 + sw * 0.1 * run, k);
    if (eR) eR.rotation.x = lerp(eR.rotation.x, earBase + Math.sin(t * 3.4) * 0.08 - sw * 0.1 * run, k);
    if (P.tail) P.tail.rotation.y = Math.sin(t * (spec.tail === 'fox' ? 3 : 5)) * (spec.tail === 'fox' ? 0.35 : 0.2);
    legL.current.rotation.x = lerp(legL.current.rotation.x, legLX, k);
    legR.current.rotation.x = lerp(legR.current.rotation.x, legRX, k);
    const ka = anim === 'shoot' || anim === 'dash' ? 1 - Math.exp(-30 * dt) : 1 - Math.exp(-14 * dt);
    armR.current.rotation.x = lerp(armR.current.rotation.x, armRX, ka);
    armR.current.rotation.z = lerp(armR.current.rotation.z, armRZ, ka);
    armL.current.rotation.x = lerp(armL.current.rotation.x, armLX, ka);
    armL.current.rotation.z = lerp(armL.current.rotation.z, armLZ, ka);
    // Q弹 weapon kick: squash Y + stretch XZ, slight bob — aim stays on shootAnim/recoil only
    const kick = shootAnim;
    const kSy = 1 - kick * 0.34 + Math.sin(kick * Math.PI) * 0.06;
    const kSx = 1 + kick * 0.22;
    gun.current.scale.set(kSx, kSy, kSx);
    gun.current.position.y = -0.34 + kick * 0.12 + Math.sin(kick * Math.PI) * 0.02;
    gun.current.rotation.z = gunRZ + kick * 0.08;
    if (mode === 'game') bodyMat.emissive.setRGB(flash + inv, 0.2 * flash + inv * 0.6, 0.3 * flash + inv);
  });

  const torso = robot
    ? <RoundedBox args={[0.56, 0.6, 0.48]} radius={0.16} smoothness={4} position={[0, 0.62, 0]} material={bodyMat} castShadow />
    : <mesh position={[0, 0.62, 0]} scale={penguin ? [1.05, 1.2, 0.95] : [1, 1.12, 0.92]} material={bodyMat} castShadow><sphereGeometry args={[0.29, 28, 20]} /></mesh>;
  const headMesh = robot
    ? <RoundedBox args={[0.78, 0.62, 0.66]} radius={0.22} smoothness={5} material={bodyMat} castShadow />
    : <mesh scale={spec.headScale} material={bodyMat} castShadow><sphereGeometry args={[HEAD_R, 32, 24]} /></mesh>;
  const flipper = spec.extras.includes('flippers');
  return (
    <group ref={root}>
      <group ref={body}>
        <group position={[0, -0.6, 0]}>
          {torso}
          {!robot && <mesh position={[0, 0.58, -0.17]} scale={penguin ? [0.95, 1.15, 0.55] : [0.82, 0.88, 0.45]} material={bellyMat}><sphereGeometry args={[0.23, 20, 14]} /></mesh>}
          <Outfit spec={spec} />
          <Tail spec={spec} refs={parts.current} body={bodyMat} />
          <group ref={head} position={[0, HEAD_Y, 0]}>
            {headMesh}
            <Face spec={spec} refs={parts.current} />
            <HeadExtras spec={spec} />
            <Ears spec={spec} refs={parts.current} body={bodyMat} />
          </group>
          <group ref={armL} position={[-0.31, 0.82, 0]}>
            <mesh position={[0, -0.17, 0]} scale={flipper ? [1.4, 1.1, 0.45] : [1, 1, 1]} material={bodyMat} castShadow><capsuleGeometry args={[0.08, 0.2, 6, 12]} /></mesh>
            {!flipper && <mesh position={[0, -0.32, 0]} material={bodyMat}><sphereGeometry args={[0.09, 14, 10]} /></mesh>}
            {kiki && <group rotation-x={-Math.PI / 2} position={[0, -0.34, 0]}><Pistol /></group>}
          </group>
          <group ref={armR} position={[0.31, 0.82, 0]}>
            <mesh position={[0, -0.17, 0]} scale={flipper ? [1.4, 1.1, 0.45] : [1, 1, 1]} material={bodyMat} castShadow><capsuleGeometry args={[0.08, 0.2, 6, 12]} /></mesh>
            {!flipper && <mesh position={[0, -0.32, 0]} material={bodyMat}><sphereGeometry args={[0.09, 14, 10]} /></mesh>}
            <group ref={gun} rotation-x={-Math.PI / 2} position={[0, -0.34, 0]}>
              <group position={[0, 0, 0.08]}>
                <WeaponModels refs={weaponRefs} />
                {kiki && mode === 'preview' && <Pistol />}
              </group>
            </group>
          </group>
          {[-1, 1].map((s) => (
            <group key={'l' + s} ref={s < 0 ? legL : legR} position={[0.13 * s, 0.36, 0]}>
              <mesh position={[0, -0.13, 0]} material={penguin ? flat('#ffb347') : bodyMat} castShadow><capsuleGeometry args={[0.09, 0.14, 6, 12]} /></mesh>
              <mesh position={[0, -0.29, -0.05]} scale={[1, 0.62, 1.4]} material={penguin ? vinyl('#ffb347') : footMat} castShadow><sphereGeometry args={[0.11, 16, 10]} /></mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
