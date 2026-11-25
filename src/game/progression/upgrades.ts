// M4 roguelite Upgrade Registry: data-driven, rarity-weighted, capped, with synergies.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY = {
  common: { weight: 60, color: '#9ef0d0', label: '普通 Common' },
  rare: { weight: 25, color: '#8ec9ff', label: '稀有 Rare' },
  epic: { weight: 11, color: '#c9a8ff', label: '史诗 Epic' },
  legendary: { weight: 4, color: '#ffd36b', label: '传说 Legendary' },
} as const;
/** hard perf caps independent of stacks */
export const PERF_CAPS = { extraProjectiles: 3, chainTargets: 4, bounces: 2, splitShards: 3 };

export type UpgradeId = 'multishot' | 'rapid' | 'power' | 'bounce' | 'crit' | 'vampire' | 'lightning' | 'freezeBlast'
  | 'rollIframes' | 'split' | 'infusion' | 'vitality' | 'swift' | 'skillCd' | 'magazine' | 'stormCore' | 'sugarRush';
export interface UpgradeDef { id: UpgradeId; name: string; nameZh: string; icon: string; rarity: Rarity; maxStacks: number; desc: string; requires?: UpgradeId[] }
export const UPGRADES: UpgradeDef[] = [
  { id: 'multishot', name: '+1 Projectile', nameZh: '多重弹', icon: '🍡', rarity: 'rare', maxStacks: 3, desc: '每次射击额外 +1 发弹丸' },
  { id: 'rapid', name: 'Sugar Rush Trigger', nameZh: '速射', icon: '⚡', rarity: 'common', maxStacks: 5, desc: '射速 +12%' },
  { id: 'power', name: 'Hard Candy', nameZh: '硬糖弹头', icon: '💥', rarity: 'common', maxStacks: 5, desc: '伤害 +12%' },
  { id: 'bounce', name: 'Bouncy Bullets', nameZh: '弹跳子弹', icon: '🏀', rarity: 'rare', maxStacks: 2, desc: '命中后弹向附近敌人（50% 伤害）' },
  { id: 'crit', name: 'Lucky Sprinkle', nameZh: '幸运糖屑', icon: '🎯', rarity: 'common', maxStacks: 4, desc: '暴击率 +8%' },
  { id: 'vampire', name: 'Sweet Tooth', nameZh: '甜牙', icon: '🧁', rarity: 'common', maxStacks: 4, desc: '击杀回复 4 生命' },
  { id: 'lightning', name: 'Fizzy Lightning', nameZh: '汽水闪电', icon: '🌩️', rarity: 'epic', maxStacks: 3, desc: '命中 15% 几率连锁闪电（+1 目标/层）' },
  { id: 'freezeBlast', name: 'Ice Pop', nameZh: '冰棒爆裂', icon: '🧊', rarity: 'epic', maxStacks: 1, desc: '击杀时冰爆，冻结 3 米内敌人' },
  { id: 'rollIframes', name: 'Marshmallow Roll', nameZh: '棉花糖翻滚', icon: '☁️', rarity: 'common', maxStacks: 3, desc: '翻滚无敌 +0.12 秒，冷却 -15%' },
  { id: 'split', name: 'Candy Split', nameZh: '糖果分裂', icon: '✨', rarity: 'rare', maxStacks: 2, desc: '击杀时分裂糖片打击附近敌人' },
  { id: 'infusion', name: 'Chili Candy', nameZh: '辣糖附魔', icon: '🌶️', rarity: 'epic', maxStacks: 1, desc: '命中附加灼烧（每秒 8 伤害，2 秒）' },
  { id: 'vitality', name: 'Extra Stuffing', nameZh: '加厚棉花', icon: '❤️', rarity: 'common', maxStacks: 4, desc: '最大生命 +25 并回满' },
  { id: 'swift', name: 'Roller Skates', nameZh: '溜冰鞋', icon: '🛼', rarity: 'common', maxStacks: 3, desc: '移动速度 +8%' },
  { id: 'skillCd', name: 'Wind-up Key', nameZh: '发条钥匙', icon: '🔑', rarity: 'rare', maxStacks: 3, desc: 'F 技能冷却 -15%' },
  { id: 'magazine', name: 'Gumball Clip', nameZh: '大弹匣', icon: '🍬', rarity: 'common', maxStacks: 3, desc: '弹匣 +30%，换弹 -15%' },
  { id: 'stormCore', name: 'Storm Core', nameZh: '风暴核心', icon: '🌀', rarity: 'legendary', maxStacks: 1, desc: '协同：闪电必定触发且附加灼烧', requires: ['lightning', 'infusion'] },
  { id: 'sugarRush', name: 'Sugar Rush', nameZh: '糖分暴走', icon: '🍭', rarity: 'legendary', maxStacks: 1, desc: '连击倍率上限 +1，击杀减少技能冷却 0.5 秒' },
];
export const getUpgrade = (id: string) => UPGRADES.find((u) => u.id === id)!;
export type Stacks = Partial<Record<UpgradeId, number>>;

export function isEligible(u: UpgradeDef, stacks: Stacks) {
  if ((stacks[u.id] ?? 0) >= u.maxStacks) return false;
  return !u.requires || u.requires.every((r) => (stacks[r] ?? 0) > 0);
}
/** Weight of an upgrade given current stacks. Synergy upgrades get boosted once unlocked. */
export function upgradeWeight(u: UpgradeDef, stacks: Stacks) {
  if (!isEligible(u, stacks)) return 0;
  return RARITY[u.rarity].weight * (u.requires ? 3 : 1);
}
/** weighted pick of n distinct eligible upgrades */
export function rollChoices(stacks: Stacks, n = 3, rng: () => number = Math.random): UpgradeDef[] {
  const pool = UPGRADES.map((u) => ({ u, w: upgradeWeight(u, stacks) })).filter((x) => x.w > 0);
  const out: UpgradeDef[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, x) => a + x.w, 0);
    let r = rng() * total, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r < 0) break; }
    out.push(pool[i].u); pool.splice(i, 1);
  }
  return out;
}
export function addUpgrade(stacks: Stacks, id: UpgradeId): boolean {
  const u = getUpgrade(id); if (!isEligible(u, stacks)) return false;
  stacks[id] = (stacks[id] ?? 0) + 1; return true;
}

export interface Mods {
  fireRate: number; damage: number; extraProjectiles: number; bounces: number; critChance: number; lifesteal: number;
  chainChance: number; chainTargets: number; freezeOnKill: boolean; rollIframes: number; rollCdMult: number; splitShards: number;
  burnDps: number; maxHpBonus: number; move: number; skillCdMult: number; magMult: number; reloadMult: number;
  comboCapBonus: number; killCdr: number;
}
export function computeMods(st: Stacks): Mods {
  const n = (id: UpgradeId) => st[id] ?? 0;
  const storm = n('stormCore') > 0;
  return {
    fireRate: 1 + 0.12 * n('rapid'), damage: 1 + 0.12 * n('power'),
    extraProjectiles: Math.min(PERF_CAPS.extraProjectiles, n('multishot')),
    bounces: Math.min(PERF_CAPS.bounces, n('bounce')), critChance: 0.08 * n('crit'), lifesteal: 4 * n('vampire'),
    chainChance: n('lightning') ? (storm ? 1 : 0.15) : 0, chainTargets: n('lightning') ? Math.min(PERF_CAPS.chainTargets, 1 + n('lightning')) : 0,
    freezeOnKill: n('freezeBlast') > 0, rollIframes: 0.12 * n('rollIframes'), rollCdMult: Math.pow(0.85, n('rollIframes')),
    splitShards: Math.min(PERF_CAPS.splitShards, n('split') ? 1 + n('split') : 0),
    burnDps: n('infusion') ? (storm ? 12 : 8) : 0, maxHpBonus: 25 * n('vitality'), move: 1 + 0.08 * n('swift'),
    skillCdMult: Math.pow(0.85, n('skillCd')), magMult: 1 + 0.3 * n('magazine'), reloadMult: Math.pow(0.85, n('magazine')),
    comboCapBonus: n('sugarRush'), killCdr: n('sugarRush') ? 0.5 : 0,
  };
}
