import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export const HERO_GLB = '/models/hero.glb';
export const WEAPONS_GLB = '/models/weapons.glb';
export const PROPS_GLB = '/models/props.glb';

export const WEAPON_ROOTS = ['CandySMG', 'BubbleLauncher', 'RainbowShotgun', 'SpringRocket'] as const;
export const PROP_ROOTS = ['Gumdrop', 'Lollipop', 'CakeChunk', 'SprinkleStar'] as const;
export type WeaponRootName = (typeof WEAPON_ROOTS)[number];
export type PropRootName = (typeof PROP_ROOTS)[number];

/** Catch Suspense/loader failures so procedural art can take over. */
export class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* swallow — procedural fallback renders */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function cloneNamed(scene: THREE.Object3D, name: string): THREE.Object3D | null {
  const src = scene.getObjectByName(name);
  if (!src) return null;
  const c = src.clone(true);
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      if (Array.isArray(m.material)) m.material = m.material.map((mat) => mat.clone());
      else if (m.material) m.material = m.material.clone();
    }
  });
  return c;
}

/** Menu showcase hero — static candy chibi from Blender kit. */
export function BlenderHero({ scale = 1, ...props }: { scale?: number } & JSX.IntrinsicElements['group']) {
  const { scene } = useGLTF(HERO_GLB);
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  return (
    <group scale={scale} {...props}>
      <primitive object={clone} />
    </group>
  );
}

/** One weapon subtree cloned from weapons.glb (barrel along local -Z after glTF Y-up). */
export function BlenderWeapon({
  name, scale = 1, ...props
}: { name: WeaponRootName; scale?: number } & JSX.IntrinsicElements['group']) {
  const { scene } = useGLTF(WEAPONS_GLB);
  const clone = useMemo(() => cloneNamed(scene, name), [scene, name]);
  if (!clone) return null;
  return (
    <group scale={scale} {...props}>
      <primitive object={clone} />
    </group>
  );
}

/** Env accent prop from props.glb. */
export function BlenderProp({
  name, scale = 1, ...props
}: { name: PropRootName; scale?: number } & JSX.IntrinsicElements['group']) {
  const { scene } = useGLTF(PROPS_GLB);
  const clone = useMemo(() => cloneNamed(scene, name), [scene, name]);
  if (!clone) return null;
  return (
    <group scale={scale} {...props}>
      <primitive object={clone} />
    </group>
  );
}

/** Four GLB weapons with the same ref API as procedural WeaponModels. */
export function BlenderWeaponModels({
  refs,
}: {
  refs?: React.MutableRefObject<(THREE.Group | null)[]>;
}) {
  const { scene } = useGLTF(WEAPONS_GLB);
  const clones = useMemo(
    () => WEAPON_ROOTS.map((n) => cloneNamed(scene, n)),
    [scene],
  );
  const set = (i: number) => (g: THREE.Group | null) => { if (refs) refs.current[i] = g; };
  return (
    <>
      {clones.map((obj, i) => (
        <group key={WEAPON_ROOTS[i]} ref={set(i)} visible={i === 0}>
          {obj && <primitive object={obj} />}
        </group>
      ))}
    </>
  );
}

/** A few high-quality Blender accents near plaza / spawn — not a full sprinkle replace. */
export function BlenderPropAccents() {
  const spots: { name: PropRootName; p: [number, number, number]; s: number; r?: number }[] = [
    { name: 'Gumdrop', p: [3.2, 0, 2.4], s: 1.1 },
    { name: 'Gumdrop', p: [-4.1, 0, 1.6], s: 0.85 },
    { name: 'Lollipop', p: [5.5, 0, -3.2], s: 0.7, r: 0.4 },
    { name: 'Lollipop', p: [-6.2, 0, 4.0], s: 0.65, r: -0.3 },
    { name: 'CakeChunk', p: [2.0, 0, -5.5], s: 0.9 },
    { name: 'CakeChunk', p: [-2.8, 0, -4.8], s: 0.75, r: 1.1 },
    { name: 'SprinkleStar', p: [0.8, 0.15, 4.6], s: 0.9 },
    { name: 'SprinkleStar', p: [-1.5, 0.15, -3.4], s: 0.7, r: 0.8 },
  ];
  return (
    <group>
      {spots.map((sp, i) => (
        <BlenderProp key={i} name={sp.name} position={sp.p} scale={sp.s} rotation-y={sp.r ?? 0} />
      ))}
    </group>
  );
}

/** Preload all kit GLBs (Draco on by default via drei). */
export function preloadBlenderKit() {
  useGLTF.preload(HERO_GLB);
  useGLTF.preload(WEAPONS_GLB);
  useGLTF.preload(PROPS_GLB);
}

preloadBlenderKit();
