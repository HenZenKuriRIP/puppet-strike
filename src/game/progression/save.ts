// M4 localStorage save with versioning + migration.
import type { CharacterId } from '../characters/registry';
export const SAVE_KEY = 'puppet-strike-save';
export const SAVE_VERSION = 3;
export interface SaveSettings { shake: boolean; volume: number; sensitivity: number; quality: 'low' | 'medium' | 'high'; flash: boolean; postFX: boolean; hitStop: boolean; funnyFx: boolean; aimAssist?: boolean; music?: boolean }
export interface SaveData {
  version: number;
  /** v3 (W2): bestSurvival/bestWave are Candy Land; the *Block fields are Block City; unlockedWorlds is derived from clears (1-3 opens 'block') but stored so it survives */
  progress: { cleared: number[]; bestSurvival: number; bestWave: number; bestAdventure: number; bestSurvivalBlock: number; bestWaveBlock: number; unlockedWorlds: string[]; lastWorld: 'candy' | 'block'; survivalMap: 'candy' | 'block' };
  character: CharacterId;
  settings: Partial<SaveSettings>;
}
export const defaultSave = (): SaveData => ({ version: SAVE_VERSION, progress: { cleared: [], bestSurvival: 0, bestWave: 0, bestAdventure: 0, bestSurvivalBlock: 0, bestWaveBlock: 0, unlockedWorlds: ['candy'], lastWorld: 'candy', survivalMap: 'candy' }, character: 'mochi', settings: {} });
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const mem = new Map<string, string>();
const memKV: KV = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
const kv = (): KV => { try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* blocked */ } return memKV; };

/** Upgrade any older/partial save into the current shape. v1 = {version:1, highScore, settings} (pre-M4 prototype format). */
export function migrate(raw: any): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const v = typeof raw.version === 'number' ? raw.version : 1;
  if (v <= 1) {
    d.progress.bestSurvival = Number(raw.highScore) || 0;
    d.settings = { ...(raw.settings ?? {}) };
    return d;
  }
  const cleared: number[] = Array.isArray(raw.progress?.cleared) ? [...new Set<number>(raw.progress.cleared.filter((n: any) => Number.isInteger(n) && n > 0 && n <= 6))] : [];
  const pr = raw.progress ?? {};
  const num = (x: any) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);
  // v2 → v3: new world progress fields; World 2 is open when 1-3 is already cleared (or the v3 list says so)
  const worlds = new Set<string>(['candy', ...(Array.isArray(pr.unlockedWorlds) ? pr.unlockedWorlds.filter((w: any) => w === 'block' || w === 'candy') : [])]);
  if (cleared.includes(3)) worlds.add('block');
  return {
    version: SAVE_VERSION,
    progress: {
      ...d.progress, ...pr, cleared, bestSurvival: num(pr.bestSurvival), bestWave: num(pr.bestWave), bestAdventure: num(pr.bestAdventure),
      bestSurvivalBlock: num(pr.bestSurvivalBlock), bestWaveBlock: num(pr.bestWaveBlock), unlockedWorlds: [...worlds],
      lastWorld: pr.lastWorld === 'block' && worlds.has('block') ? 'block' : 'candy', survivalMap: pr.survivalMap === 'block' && worlds.has('block') ? 'block' : 'candy',
    },
    character: raw.character ?? 'mochi', settings: { ...(raw.settings ?? {}) },
  };
}
export function loadSave(store: KV = kv()): SaveData {
  try { const s = store.getItem(SAVE_KEY); return s ? migrate(JSON.parse(s)) : defaultSave(); } catch { return defaultSave(); }
}
export function writeSave(data: SaveData, store: KV = kv()) { try { store.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION })); } catch { /* quota */ } }
export function resetSave(store: KV = kv()) { try { store.removeItem(SAVE_KEY); } catch { /* */ } return defaultSave(); }
