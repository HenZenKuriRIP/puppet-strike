import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { WorldArena } from '../game/levels/WorldArena';
import { useWorldId, WORLDS } from '../game/levels/worlds';
import { enterWorld } from '../game/core/world';
import { MECH, triggerDomino } from '../game/levels/mech';
import { Mochi } from '../game/entities/Mochi';
import { Enemies } from '../game/entities/Enemies';
import { KingGummy, Hazards } from '../game/entities/Boss';
import { Colossus } from '../game/entities/Colossus';
import * as runFlow from '../game/systems/runFlow';
import { KING } from '../game/boss/kingGummy';
import { COLOSSUS } from '../game/boss/colossus';
import { Effects } from '../game/effects/Effects';
import { world, defaultRaycast, spawnEnemy } from '../game/core/world';
import { terrainRaycast } from '../game/levels/terrain';
import { MOVER_BOXES, SPRING_PADS, MOUNTS } from '../game/levels/arenaLayout';
import { DYN_BOXES } from '../game/levels/mech';
import { rayBoxes } from '../game/combat/raycast';
import { input } from '../game/core/input';
import { preferTouchControls } from '../game/core/touchDetect';
import { computeAimAssist } from '../game/combat/aimAssist';
import { effectiveAimAssistScale } from '../game/core/touchInput';
import { ENEMIES } from '../config/game';
import { FixedStepper } from '../game/core/fixedStep';
import { stepSim, damageEnemy, hurtPlayer } from '../game/systems/simulation';
import { doFunnyKill } from '../game/systems/fx';
import { computeCamera } from '../game/camera/cameraRig';
import { ADS, CAMERA, SIM } from '../config/game';
import { QUALITY } from '../config/quality';
import { getCharacter } from '../game/characters/registry';
import { Puppet } from '../game/entities/Puppet';
import { BlenderHero, GlbBoundary } from '../game/assets/BlenderKit';
import { Sky } from '../game/levels/Decor';
import { EffectComposer, Bloom, Vignette, N8AO, ChromaticAberration, SMAA } from '@react-three/postprocessing';
import { ContactShadows } from '@react-three/drei';
import { setMaterialTier } from '../game/entities/materials';
import { clamp } from '../game/core/math';
import { useUI } from '../app/store';
import { audioState } from '../audio/sfx';
import * as actions from '../app/actions';
import { hostFrame, clientFrame, net } from '../net/session';
import { useNet } from '../net/netStore';
import { perfStats } from '../game/perf/perfStats';
import { botStep, createBot, BOT_SKILL } from '../game/sim/bot';

/** Debug / e2e hook: only in dev server or the VITE_E2E build — never in the production bundle. */
export const DEBUG_HOOK = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';

/** Routes world raycasts through Rapier's query pipeline once it's ready. */
function RapierBridge() {
  const { world: rw, rapier } = useRapier();
  useEffect(() => {
    const ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    world.raycast = (o, d, max) => {
      ray.origin = o; ray.dir = d;
      const hit = rw.castRay(ray, max, true);
      let best: number | null = hit ? (hit as any).timeOfImpact ?? (hit as any).toi : null;
      // terrain heightfield + moving covers are not Rapier colliders -> combine analytically
      const t = terrainRaycast(o.x, o.y, o.z, d.x, d.y, d.z, best ?? max); if (t !== null && (best === null || t < best)) best = t;
      const m = rayBoxes(o, d, MOVER_BOXES, best ?? max); if (m !== null && (best === null || m < best)) best = m;
      const dy = rayBoxes(o, d, DYN_BOXES, best ?? max); if (dy !== null && (best === null || dy < best)) best = dy; // W2: bricks / train / lifts / dominoes
      return best;
    };
    return () => { world.raycast = defaultRaycast; };
  }, [rw, rapier]);
  return null;
}

const SHOW_Z = 13;
const stepper = new FixedStepper(SIM.fixedDt, SIM.maxStepsPerFrame);
const camTarget = new THREE.Vector3();
/** e2e: scripted bot (same as headless balance bot) can drive the real game in the browser. */
/** dev/e2e only: free camera for overview screenshots */
const camDebug = { on: false, studio: false, pos: [0, 80, 0] as number[], look: [0, 0, 0] as number[], fov: 0 };
const botHook = { on: false, bot: createBot(), skill: 'good' as keyof typeof BOT_SKILL };

/** Reads renderer.info each frame (manual reset so post-processing passes are all counted). */
/** open-3d-skills (threejs-scene/performance.md "Auto tiering"): average frame time over 3 s windows and, if > 25 ms,
 *  drop the device pixel ratio one step (never raise it again in this canvas, ignore >250 ms hitches). Quality preset itself is untouched. */
function AdaptiveDprGuard({ min }: { min: number }) {
  const { gl, setDpr } = useThree(); const acc = useRef({ t: 0, n: 0, sum: 0 });
  useFrame((_, dt) => {
    const ms = dt * 1000; if (ms > 250) return; const a = acc.current; a.t += dt; a.n++; a.sum += ms;
    if (a.t < 3) return; const avg = a.sum / a.n; a.t = 0; a.n = 0; a.sum = 0;
    const cur = gl.getPixelRatio(); if (avg > 25 && cur > min + 0.01) { const next = Math.max(min, Math.round((cur - 0.25) * 4) / 4); setDpr(next); perfStats.dpr = next; }
  });
  return null;
}
/** open-3d-skills: pre-compile shaders when a run starts so the first seconds don't stutter on mobile GPUs */
function ShaderWarmup() {
  const { gl, scene, camera } = useThree(); const phase = useUI((s) => s.phase);
  useEffect(() => { if (phase !== 'playing') return; const id = requestAnimationFrame(() => { try { gl.compile(scene, camera); } catch { /* best effort */ } }); return () => cancelAnimationFrame(id); }, [phase, gl, scene, camera]);
  return null;
}

function PerfProbe() {
  const { gl } = useThree();
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  useFrame((_, dt) => {
    const i = gl.info; perfStats.calls = i.render.calls; perfStats.triangles = i.render.triangles;
    perfStats.geometries = i.memory.geometries; perfStats.textures = i.memory.textures; perfStats.programs = i.programs?.length ?? 0;
    perfStats.frameMs = perfStats.frameMs * 0.9 + dt * 1000 * 0.1; perfStats.fps = 1000 / Math.max(1, perfStats.frameMs); perfStats.frames++;
    i.reset();
  }, -2);
  return null;
}

function GameLoop() {
  const { camera, scene } = useThree();
  useFrame((state, dt) => {
    const ui = useUI.getState();
    const cam = camera as THREE.PerspectiveCamera;
    if (ui.phase === 'menu') {
      const t = state.clock.elapsedTime;
      if (ui.menuView === 'characters') { cam.position.set(-0.2 + Math.sin(t * 0.2) * 0.25, 1.75, SHOW_Z + 5.6); cam.lookAt(1.1, 0.9, SHOW_Z); }
      else { cam.position.set(1.2 + Math.sin(t * 0.15) * 0.6, 1.7, SHOW_Z + 4.2); cam.lookAt(-0.9, 1.0, SHOW_Z); }
      if (cam.fov !== CAMERA.fov) { cam.fov = CAMERA.fov; cam.updateProjectionMatrix(); }
      return;
    }
    const p = world.player;
    const cc = world.coop.on && world.coop.client, ch = world.coop.on && world.coop.host;
    const live = ui.phase === 'playing' || ((cc || ch) && ui.phase === 'paused'); // co-op never pauses the shared sim
    if (ui.phase === 'playing') {
      const [dx, dy] = input.consumeLook();
      const sens = CAMERA.sensitivity * ui.settings.sensitivity * (1 - world.aiming * (1 - ADS.sensMult));
      // Touch: mild pull-up boost when near pitch floor so a slam to minPitch is recoverable
      let lookDy = dy;
      if (preferTouchControls() && Number.isFinite(dy) && dy < 0 && p.pitch <= CAMERA.minPitch + 0.28) {
        lookDy = dy * 1.32;
      }
      p.yaw -= dx * sens; p.pitch = clamp(p.pitch - lookDy * sens, CAMERA.minPitch, CAMERA.maxPitch);
      // P0-2: light aim assist on touch (toggleable; visible enemies + LOS only)
      if (ui.settings.aimAssist && preferTouchControls()) {
        const eye = { x: p.pos.x, y: p.pos.y + 1.25, z: p.pos.z };
        // Soften assist while player is actively dragging look (prevents fighting turn-away)
        const lookScale = effectiveAimAssistScale();
        const aa = computeAimAssist({
          yaw: p.yaw, pitch: p.pitch, eye,
          enemies: world.enemies.items.map((e) => ({
            active: e.active, dead: e.dead, pos: e.pos,
            aimY: (ENEMIES[e.type]?.height ?? 1.2) * 0.55,
          })),
          raycast: (o, d, max) => world.raycast(o, d, max),
        });
        const dyaw = aa.dyaw * lookScale;
        const dpitch = aa.dpitch * lookScale;
        if (Number.isFinite(dyaw)) p.yaw += dyaw;
        if (Number.isFinite(dpitch)) p.pitch = clamp(p.pitch + dpitch, CAMERA.minPitch, CAMERA.maxPitch);
      }
      if (!Number.isFinite(p.yaw)) p.yaw = 0;
      if (!Number.isFinite(p.pitch)) p.pitch = 0;
    } else input.consumeLook();
    if (cc) { if (live) clientFrame(dt); }
    else if (live) {
      if (!ch && world.hitStop > 0 && ui.settings.hitStop) { world.hitStop -= Math.min(dt, 0.05); } // freeze sim briefly
      else {
        world.hitStop = 0;
        const n = stepper.advance(dt); const t0 = performance.now();
        for (let i = 0; i < n; i++) { if (DEBUG_HOOK && botHook.on) botStep(botHook.bot, SIM.fixedDt, { ...BOT_SKILL[botHook.skill], rand: Math.random }); stepSim(SIM.fixedDt); }
        perfStats.simMs = perfStats.simMs * 0.9 + (performance.now() - t0) * 0.1;
        world.alpha = stepper.alpha;
        if (ch) hostFrame(dt);
      }
    } else stepper.acc = 0;
    const a = world.alpha;
    const ip = { x: p.prev.x + (p.pos.x - p.prev.x) * a, y: p.prev.y + (p.pos.y - p.prev.y) * a, z: p.prev.z + (p.pos.z - p.prev.z) * a };
    const ad = world.aiming;
    const c = computeCamera(ip, p.yaw, p.pitch, world.raycast, { distance: CAMERA.distance + (ADS.distance - CAMERA.distance) * ad, shoulderX: CAMERA.shoulderX + (ADS.shoulderX - CAMERA.shoulderX) * ad });
    const fov = CAMERA.fov + (ADS.fov - CAMERA.fov) * ad;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    world.cam.pos = c.pos; world.cam.fwd = c.fwd;
    const sh = ui.settings.shake ? world.shake : 0;
    cam.position.set(c.pos.x + (Math.random() - 0.5) * sh * 0.5, c.pos.y + (Math.random() - 0.5) * sh * 0.5, c.pos.z);
    camTarget.set(c.pos.x + c.fwd.x, c.pos.y + c.fwd.y, c.pos.z + c.fwd.z);
    cam.lookAt(camTarget);
    const king = world.boss.id >= 0 ? world.enemies.items[world.boss.id] : null;
    if (world.cinematic > 0 && king && king.active) { // boss intro: swoop toward the king
      const big = king.type === 'colossus', k = 1 - world.cinematic / (big ? COLOSSUS.introTime : KING.introTime), R0 = big ? 19 : 11, H0 = big ? 4 : 2.5;
      cam.position.set(king.pos.x + Math.sin(k * 1.2 - 0.6) * (R0 - k * 3), H0 + k * 1.5, king.pos.z + Math.cos(k * 1.2 - 0.6) * (R0 - k * 3));
      cam.lookAt(king.pos.x, big ? 4.5 : 2.8, king.pos.z);
    }
    if (DEBUG_HOOK && scene.fog) { const f = scene.fog as THREE.Fog; f.far = camDebug.on ? 2000 : 190; f.near = camDebug.on ? 400 : 70; }
    if (DEBUG_HOOK && camDebug.on) { cam.position.set(camDebug.pos[0], camDebug.pos[1], camDebug.pos[2]); cam.lookAt(camDebug.look[0], camDebug.look[1], camDebug.look[2]); if (camDebug.fov && cam.fov !== camDebug.fov) { cam.fov = camDebug.fov; cam.updateProjectionMatrix(); } }
    if (sh > 0) cam.rotateZ((Math.random() - 0.5) * sh * 0.08);
  }, -1);
  return null;
}

function InputBinder() {
  const { gl } = useThree();
  useEffect(() => {
    const off = input.attach(gl.domElement);
    const click = () => {
      if (preferTouchControls()) return; // Android / coarse pointer: no pointer lock
      if (useUI.getState().phase === 'playing' && !document.pointerLockElement) gl.domElement.requestPointerLock?.();
    };
    gl.domElement.addEventListener('click', click);
    (window as any).__canvas = gl.domElement; // used for pointer-lock requests
    if (DEBUG_HOOK) { (window as any).__ps = { world, spawnEnemy, useUI, runFlow, damageEnemy, doFunnyKill, perfStats, botHook, camDebug, createBot, gl, actions, audioState, net, useNet, input, hurtPlayer, enterWorld, MECH, triggerDomino, SPRING_PADS, MOUNTS }; }
    return () => { off(); gl.domElement.removeEventListener('click', click); };
  }, [gl]);
  return null;
}

/** Menu showcase: Blender hero kit on main menu; character Puppet on picker (expressions/variants). */
function MenuShowcase({ softShadow }: { softShadow: boolean }) {
  const phase = useUI((s) => s.phase), view = useUI((s) => s.menuView), sel = useUI((s) => s.character);
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (spin.current) spin.current.rotation.y += dt * 0.6; });
  if (phase !== 'menu') return null;
  // Characters UI owns the picker; keep procedural Puppet so ears/colors/wave stay live.
  if (view === 'characters') return (
    <group position={[1.35, 0, SHOW_Z]} rotation-y={Math.PI + 0.15} ref={spin}>
      <Puppet key={sel} spec={getCharacter(sel)} mode="preview" wave />
      <Pedestal color="#ffd166" softShadow={softShadow} />
      <pointLight position={[1.2, 1.6, -1.4]} intensity={0.55} color="#ff9ec7" distance={5} />
      <pointLight position={[-1.4, 1.2, 1.0]} intensity={0.35} color="#9fd6ff" distance={5} />
    </group>
  );
  // Main menu: prefer Blender candy hero (GLB); fall back to selected Puppet.
  return (
    <group position={[-0.6, 0, SHOW_Z]} rotation-y={Math.PI + 0.3} ref={spin}>
      <GlbBoundary fallback={<Puppet key={sel} spec={getCharacter(sel)} mode="preview" wave />}>
        <Suspense fallback={<Puppet key={sel} spec={getCharacter(sel)} mode="preview" wave />}>
          <BlenderHero />
        </Suspense>
      </GlbBoundary>
      <Pedestal softShadow={softShadow} />
      <pointLight position={[1.2, 1.6, -1.4]} intensity={0.55} color="#ff9ec7" distance={5} />
      <pointLight position={[-1.4, 1.2, 1.0]} intensity={0.35} color="#9fd6ff" distance={5} />
    </group>
  );
}
function Pedestal({ color = '#fff3e6', softShadow = false }: { color?: string; softShadow?: boolean }) {
  return (
    <group>
      <mesh position-y={0.06} receiveShadow castShadow><cylinderGeometry args={[0.6, 0.66, 0.12, 32]} /><meshPhysicalMaterial color={color} roughness={0.22} metalness={0.05} clearcoat={1} clearcoatRoughness={0.08} sheen={0.4} sheenColor="#ffffff" /></mesh>
      <mesh position-y={0.12}><torusGeometry args={[0.6, 0.03, 8, 40]} /><meshPhysicalMaterial color="#ff8fb8" roughness={0.22} clearcoat={1} clearcoatRoughness={0.1} emissive="#ff8fb8" emissiveIntensity={0.18} /></mesh>
      <mesh position-y={0.14}><torusGeometry args={[0.42, 0.018, 8, 36]} /><meshPhysicalMaterial color="#ffe066" roughness={0.2} clearcoat={1} emissive="#ffe066" emissiveIntensity={0.25} /></mesh>
      {softShadow && <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={3.2} blur={2.4} far={2.5} resolution={256} color="#6b3a55" frames={1} />}
    </group>
  );
}
/** key light + shadow frustum follow the camera target so shadows stay crisp on the big map */
function ShadowLight({ castShadow, size }: { castShadow: boolean; size: number }) {
  const l = useRef<THREE.DirectionalLight>(null!); const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const p = world.player.pos; const light = l.current; if (!light) return;
    // open-3d-skills/threejs-scene: snap the shadow frustum to whole shadow-map texels (40 world units / mapSize) so edges don't shimmer
    const texel = 40 / size; const px = Math.round(p.x / texel) * texel, pz = Math.round(p.z / texel) * texel;
    light.position.set(px + 14, 24, pz + 10); target.position.set(px, 0, pz); target.updateMatrixWorld();
  });
  return <>
    <directionalLight ref={l} target={target} position={[14, 24, 10]} intensity={1.85} color="#fff4e6" castShadow={castShadow}
      shadow-mapSize={[size, size]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-near={1} shadow-camera-far={60} shadow-bias={-0.00018} shadow-normalBias={0.04} />
    <primitive object={target} />
  </>;
}
function GameOnly({ children }: { children: React.ReactNode }) {
  const phase = useUI((s) => s.phase);
  return phase === 'menu' ? null : <>{children}</>;
}

/** sky, fog and lights follow the live world's theme (Candy Land pastel vs Block City primary-bright) */
function WorldLighting({ castShadow, size }: { castShadow: boolean; size: number }) {
  const wid = useWorldId();
  if (wid === 'block') return <>
    <Sky top="#2f8fff" mid="#a8dcff" bottom="#f0f8ff" />
    <fog attach="fog" args={[WORLDS.block.theme.fog, 78, 205]} />
    <hemisphereLight args={['#eaf6ff', '#ffe4a8', 0.9]} />
    <ShadowLight castShadow={castShadow} size={size} />
    {/* cooler fill */}
    <directionalLight position={[-16, 8, -6]} intensity={0.5} color="#c4dcff" />
    {/* warm bounce / soft god-ray-ish fill — cheap directional, not volumetric */}
    <directionalLight position={[-2, 14, -18]} intensity={0.62} color="#ffe2a8" />
    {/* candy/primary rim */}
    <directionalLight position={[8, 4, -14]} intensity={0.42} color="#ff9ec7" />
  </>;
  return <>
    <Sky top="#7ec0ff" mid="#ffd0ea" bottom="#fff6e8" />
    <fog attach="fog" args={['#ffe6f2', 72, 195]} />
    <hemisphereLight args={['#fff4fc', '#c5f0e0', 0.82]} />
    <ShadowLight castShadow={castShadow} size={size} />
    {/* cooler fill */}
    <directionalLight position={[-16, 8, -6]} intensity={0.48} color="#b8d4ff" />
    {/* warm bounce fill (soft god-ray-ish) */}
    <directionalLight position={[-2, 14, -18]} intensity={0.55} color="#ffd9a8" />
    {/* pink/candy rim for silhouettes */}
    <directionalLight position={[8, 4, -14]} intensity={0.72} color="#ffb0d4" />
  </>;
}

/** debug-only "studio": hides the arena and shows a plain floor so model close-ups are not blocked by scenery */
function ArenaGroup({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null), f = useRef<THREE.Mesh>(null);
  useFrame(() => { const on = DEBUG_HOOK && camDebug.studio; if (g.current) g.current.visible = !on; if (f.current) f.current.visible = on; });
  return <>
    <group ref={g}>{children}</group>
    <mesh ref={f} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} visible={false} receiveShadow><planeGeometry args={[400, 400]} /><meshStandardMaterial color="#e9dcc8" roughness={0.9} /></mesh>
  </>;
}

export function GameCanvas() {
  const quality = useUI((s) => s.settings.quality), postFX = useUI((s) => s.settings.postFX);
  const phase = useUI((s) => s.phase);
  const q = QUALITY[quality];
  setMaterialTier(quality);
  // ROOT FIX: full-screen WebGL must NOT capture touches in menus (breaks Android scroll).
  // Touch combat uses TouchControls; desktop playing keeps canvas pointer events for click-to-lock.
  const pe = (phase === 'playing' && !preferTouchControls()) ? 'auto' : 'none';
  const caOffset = useMemo(() => new THREE.Vector2(0.00055, 0.00045), []);
  return (
    <div className="absolute inset-0 game-canvas-host" style={{ pointerEvents: pe }} data-pe={pe}>
      <Canvas key={quality} shadows={q.shadows ? 'soft' : false} dpr={q.dpr} camera={{ fov: CAMERA.fov, near: 0.1, far: 400, position: [0, 6, 20] }}
        gl={{ antialias: q.antialias, preserveDrawingBuffer: DEBUG_HOOK, powerPreference: 'high-performance', stencil: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: q.exposure, outputColorSpace: THREE.SRGBColorSpace }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = q.exposure; gl.outputColorSpace = THREE.SRGBColorSpace; }}>
        <WorldLighting castShadow={q.shadows} size={q.shadowMapSize} />
        <Physics timeStep={SIM.fixedDt} gravity={[0, -24, 0]}>
          <RapierBridge />
          <ArenaGroup><WorldArena density={q.decorDensity} /></ArenaGroup>
        </Physics>
        <MenuShowcase softShadow={q.contactShadows} />
        <GameOnly><Mochi /></GameOnly>
        <Enemies />
        <KingGummy /><Colossus /><Hazards />
        <Effects />
        <GameLoop />
        <InputBinder />
        <PerfProbe />
        <AdaptiveDprGuard min={1} />
        <ShaderWarmup />
        {q.postFX && postFX && (
          <EffectComposer multisampling={q.antialias && !q.smaa ? 4 : 0}>
            {q.ao ? <N8AO aoRadius={1.35} intensity={1.65} distanceFalloff={1} halfRes /> : <></>}
            {q.bloom ? <Bloom intensity={q.bloomIntensity} luminanceThreshold={0.82} luminanceSmoothing={0.22} mipmapBlur /> : <></>}
            {q.chromaticAberration ? <ChromaticAberration offset={caOffset} radialModulation={false} modulationOffset={0} /> : <></>}
            {q.vignette ? <Vignette offset={0.28} darkness={0.5} /> : <></>}
            {q.smaa ? <SMAA /> : <></>}
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
