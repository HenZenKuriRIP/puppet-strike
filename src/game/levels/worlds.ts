// W2: world / theme configuration. A world = terrain params + layout builder + visual theme. `setWorld` swaps the live layout in place
// (host and client both call it with the same id → identical deterministic maps).
import { useSyncExternalStore } from 'react';
import { applyLayout, buildCandyLayout } from './arenaLayout';
import { BLOCK_TERRAIN, CANDY_TERRAIN, applyTerrain } from './terrain';
import { buildBlockLayout } from './blockLayout';

export type WorldId = 'candy' | 'block';
export const WORLD_IDS: WorldId[] = ['candy', 'block'];
export interface Theme { sky: string; fog: string; fogNear: number; fogFar: number; ambient: string; sun: string; sunIntensity: number; ground: string; hemiSky: string; hemiGround: string; label: string }
export interface WorldDef { id: WorldId; name: string; nameEn: string; index: number; blurb: string; terrain: typeof CANDY_TERRAIN; build: typeof buildCandyLayout; theme: Theme; bossName: string }

export const WORLDS: Record<WorldId, WorldDef> = {
  candy: {
    id: 'candy', name: '糖果乐园', nameEn: 'Candy Land', index: 1, blurb: '棉花糖丘陵、巧克力河与棒棒糖森林', terrain: CANDY_TERRAIN, build: buildCandyLayout, bossName: 'KING GUMMY',
    theme: { label: 'candy', sky: '#bfeaff', fog: '#d7f1ff', fogNear: 55, fogFar: 150, ambient: '#ffffff', sun: '#fff4dd', sunIntensity: 2.4, ground: '#c8f5e0', hemiSky: '#ffffff', hemiGround: '#ffd9ee' },
  },
  block: {
    id: 'block', name: '积木都市', nameEn: 'Block City', index: 2, blurb: '原色积木塔楼、玩具火车与多米诺', terrain: BLOCK_TERRAIN, build: buildBlockLayout, bossName: 'BRICK COLOSSUS',
    theme: { label: 'block', sky: '#7cc8ff', fog: '#bfe4ff', fogNear: 60, fogFar: 170, ambient: '#ffffff', sun: '#fff8e8', sunIntensity: 2.7, ground: '#3aa655', hemiSky: '#e8f6ff', hemiGround: '#ffe9b0' },
  },
};
export let currentWorld: WorldId = 'candy';
export const worldOf = (id: string | undefined): WorldId => (id === 'block' ? 'block' : 'candy');
/** swap the live map. Idempotent unless `force`. Returns true when the layout was rebuilt. */
export function setWorld(id: WorldId, force = false): boolean {
  if (id === currentWorld && !force) return false;
  const w = WORLDS[id]; applyTerrain(w.terrain); applyLayout(w.build()); currentWorld = id; rev++; listeners.forEach((f) => f()); return true;
}
let rev = 0; const listeners = new Set<() => void>();
/** reactive world id for the renderer (arena is remounted when the live map changes) */
export const useWorldRev = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => rev);
export const useWorldId = (): WorldId => { useWorldRev(); return currentWorld; };
export const themeOf = (id: WorldId) => WORLDS[id].theme;
