import type { WeaponConfig } from '../../config/game';

export type WeaponStatus = 'ready' | 'cooldown' | 'reloading' | 'empty';
export interface WeaponState { status: WeaponStatus; ammo: number; cooldown: number; reloadTimer: number }
export interface WeaponInput { trigger: boolean; reload: boolean }
export interface WeaponEvents { fired: boolean; reloadStarted: boolean; reloadFinished: boolean; dryFire: boolean }

export const createWeaponState = (cfg: WeaponConfig): WeaponState =>
  ({ status: 'ready', ammo: cfg.magSize, cooldown: 0, reloadTimer: 0 });

/** Weapon state machine: ready -> cooldown -> ready, empty/reload -> reloading -> ready. Mutates state. */
export function stepWeapon(s: WeaponState, cfg: WeaponConfig, input: WeaponInput, dt: number): WeaponEvents {
  const ev: WeaponEvents = { fired: false, reloadStarted: false, reloadFinished: false, dryFire: false };
  if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);

  if (s.status === 'reloading') {
    s.reloadTimer -= dt;
    if (s.reloadTimer <= 0) { s.ammo = cfg.magSize; s.reloadTimer = 0; s.status = 'ready'; ev.reloadFinished = true; }
    else return ev;
  }
  if (s.status === 'cooldown' && s.cooldown <= 0) s.status = s.ammo > 0 ? 'ready' : 'empty';

  const startReload = () => { s.status = 'reloading'; s.reloadTimer = cfg.reloadTime; ev.reloadStarted = true; };
  if (input.reload && s.ammo < cfg.magSize && s.status !== 'cooldown') { startReload(); return ev; }

  if (input.trigger) {
    if (s.status === 'ready' && s.ammo > 0) {
      s.ammo--; s.cooldown = 1 / cfg.fireRate; ev.fired = true;
      s.status = 'cooldown';
    } else if (s.status === 'empty' || (s.status === 'ready' && s.ammo === 0)) {
      ev.dryFire = true; startReload();
    }
  }
  if (s.status === 'cooldown' && s.ammo === 0 && s.cooldown <= 0) s.status = 'empty';
  return ev;
}
