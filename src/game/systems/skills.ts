export interface SkillState { cd: number; active: number }
export const createSkill = (): SkillState => ({ cd: 0, active: 0 });
export function tryActivate(s: SkillState, cfg: { cooldown: number; duration: number }, blocked = false): boolean {
  if (blocked || s.cd > 0 || s.active > 0) return false;
  s.cd = cfg.cooldown; s.active = cfg.duration; return true;
}
export function stepSkill(s: SkillState, dt: number) { s.cd = Math.max(0, s.cd - dt); s.active = Math.max(0, s.active - dt); }
export function reduceCooldown(s: SkillState, amount: number) { s.cd = Math.max(0, s.cd - amount); }
