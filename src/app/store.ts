import { create } from 'zustand';
import { FX, PLAYER, WAVES, WEAPONS, WEAPON_ORDER } from '../config/game';
import type { QualityLevel } from '../config/quality';
import type { CharacterId } from '../game/characters/registry';
import { loadSave, writeSave, SaveData } from '../game/progression/save';
import type { UpgradeId } from '../game/progression/upgrades';
import type { GameMode } from '../game/core/world';

export type Phase = 'menu' | 'playing' | 'paused' | 'upgrade' | 'results' | 'won' | 'lost';
export type MenuView = 'main' | 'characters' | 'settings' | 'controls' | 'play' | 'adventure' | 'coop';
export interface PartnerHud { name: string; hp: number; maxHp: number; dead: boolean; revive: number; character: CharacterId; connected: boolean; ping: number }
export interface Results {
  won: boolean; mode: GameMode; stage: number; score: number; kills: number; maxCombo: number; time: number;
  wave: number; upgrades: UpgradeId[]; newBest: boolean; unlocked: CharacterId[]; character: CharacterId;
}
export interface UIState {
  phase: Phase; hp: number; maxHp: number; ammo: number; mag: number; reloading: boolean; reloadFrac: number;
  wave: number; totalWaves: number; enemiesLeft: number; banner: string; score: number; hitMarker: number;
  weaponIndex: number; ammoList: number[];
  dashCd: number; rollCd: number;
  combo: number; comboTier: number; comboFrac: number; multiplier: number;
  callout: { text: string; tier: number; key: number } | null;
  settings: { shake: boolean; volume: number; sensitivity: number; quality: QualityLevel; flash: boolean; postFX: boolean; hitStop: boolean; perfOverlay: boolean; funnyFx: boolean; aimAssist: boolean; music: boolean };
  character: CharacterId; menuView: MenuView; aiming: boolean;
  // M4
  mode: GameMode; stage: number; skillActive: boolean; rollCharges: number; rollMax: number; shield: number;
  boss: { hpFrac: number; phase: number; invuln: boolean; kind: 'king' | 'colossus' } | null;
  upgradeChoices: UpgradeId[]; upgradeReason: string; results: Results | null; fade: number;
  // M6 co-op
  coop: boolean; coopOffer: boolean; partner: PartnerHud | null; hint: string; reviveFrac: number; downed: boolean; ping: number; netMsg: string;
  save: SaveData;
  set: (p: Partial<UIState>) => void;
  setSettings: (p: Partial<UIState['settings']>) => void;
  persist: (mut?: (s: SaveData) => void) => void;
}
export const initialHud = () => ({
  hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, ammo: WEAPONS.candySmg.magSize, mag: WEAPONS.candySmg.magSize,
  reloading: false, reloadFrac: 0, wave: 1, totalWaves: WAVES.length, enemiesLeft: 0, banner: '', score: 0, hitMarker: 0,
  weaponIndex: 0, ammoList: WEAPON_ORDER.map((id) => WEAPONS[id].magSize), dashCd: 0, rollCd: 0,
  combo: 0, comboTier: 0, comboFrac: 0, multiplier: 1, callout: null,
  partner: null as PartnerHud | null, hint: '', reviveFrac: 0, downed: false, skillActive: false, rollCharges: 1, rollMax: 1, shield: 0, boss: null, upgradeChoices: [] as UpgradeId[], upgradeReason: '', results: null,
});
const saved = loadSave();
const defaults = { shake: FX.shakeEnabledDefault, volume: 0.5, sensitivity: 1, quality: 'medium' as QualityLevel, flash: true, postFX: true, hitStop: true, perfOverlay: false, funnyFx: true, aimAssist: false, music: true };
export const useUI = create<UIState>((set, get) => ({
  phase: 'menu', ...initialHud(),
  settings: { ...defaults, ...saved.settings },
  character: saved.character, menuView: 'main', aiming: false,
  mode: 'survival', stage: 1, fade: 0, save: saved, coop: false, coopOffer: false, ping: 0, netMsg: '',
  set: (p) => set(p),
  setSettings: (p) => { set((s) => ({ settings: { ...s.settings, ...p } })); get().persist(); },
  persist: (mut) => {
    const s = get(); const next: SaveData = JSON.parse(JSON.stringify(s.save));
    next.settings = { ...s.settings }; next.character = s.character;
    mut?.(next); writeSave(next); set({ save: next });
  },
}));
export const DEFAULT_SETTINGS = defaults;
