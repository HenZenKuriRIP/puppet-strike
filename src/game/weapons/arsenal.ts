import { WEAPONS, WEAPON_ORDER, WEAPON_SWITCH_TIME, WeaponConfig } from '../../config/game';
import { createWeaponState, WeaponState } from './weaponMachine';

export interface Arsenal { index: number; states: WeaponState[]; switchTimer: number }
export const createArsenal = (): Arsenal => ({ index: 0, states: WEAPON_ORDER.map((id) => createWeaponState(WEAPONS[id])), switchTimer: 0 });
export const currentConfig = (a: Arsenal): WeaponConfig => WEAPONS[WEAPON_ORDER[a.index]];
export const currentState = (a: Arsenal): WeaponState => a.states[a.index];

/** Switch to a slot; cancels an in-progress reload of the old weapon and applies a short draw delay. */
export function switchWeapon(a: Arsenal, index: number): boolean {
  const n = a.states.length;
  const i = ((index % n) + n) % n;
  if (i === a.index) return false;
  const old = a.states[a.index];
  if (old.status === 'reloading') { old.status = old.ammo > 0 ? 'ready' : 'empty'; old.reloadTimer = 0; }
  a.index = i; a.switchTimer = WEAPON_SWITCH_TIME;
  return true;
}
export const cycleWeapon = (a: Arsenal, dir = 1) => switchWeapon(a, a.index + dir);
export function stepArsenal(a: Arsenal, dt: number) { a.switchTimer = Math.max(0, a.switchTimer - dt); }
export const canFire = (a: Arsenal) => a.switchTimer <= 0;
