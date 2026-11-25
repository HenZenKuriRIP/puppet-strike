export type CharacterId = 'mochi' | 'bubu' | 'kiki' | 'bolt' | 'luna' | 'poppy' | 'brix';
export type EarStyle = 'bunny' | 'bear' | 'cat' | 'antenna' | 'fox' | 'none';
export interface CharacterSpec {
  id: CharacterId; name: string; nameZh: string; species: string; emoji: string;
  tagline: string;
  /** M4: real per-character stats + unique F skill (cosmeticOnly is always false now) */
  cosmeticOnly: boolean;
  material: 'plush' | 'vinyl' | 'metal';
  colors: { body: string; belly: string; accent: string; accent2: string; eye: string; cheek: string };
  ears: EarStyle; tail: 'puff' | 'cat' | 'fox' | 'none' | 'penguin';
  headScale: [number, number, number];
  extras: ('scarf' | 'hoodie' | 'bowtie' | 'dualPistols' | 'visor' | 'bolts' | 'moonCharm' | 'beak' | 'flippers' | 'beanie' | 'overalls')[];
}
export const CHARACTERS: CharacterSpec[] = [
  { id: 'mochi', name: 'MOCHI', nameZh: '麻糬', species: '白兔人偶', emoji: '🐰', tagline: '软糯又勇敢的突击队长', cosmeticOnly: false, material: 'plush',
    colors: { body: '#fffaf5', belly: '#ffd3e2', accent: '#8ec9ff', accent2: '#ff9ec7', eye: '#3a2a5c', cheek: '#ffb3c8' },
    ears: 'bunny', tail: 'puff', headScale: [1.08, 0.95, 1], extras: ['scarf', 'hoodie'] },
  { id: 'bubu', name: 'BUBU', nameZh: '布布', species: '泰迪熊', emoji: '🧸', tagline: '抱抱就是最强的防御', cosmeticOnly: false, material: 'plush',
    colors: { body: '#c98b5a', belly: '#f2d2a9', accent: '#ff6b6b', accent2: '#fff3a0', eye: '#2b1a12', cheek: '#ff9c8a' },
    ears: 'bear', tail: 'puff', headScale: [1.12, 0.98, 1.02], extras: ['bowtie', 'overalls'] },
  { id: 'kiki', name: 'KIKI', nameZh: '琪琪', species: '粉红猫', emoji: '🐱', tagline: '双枪喵喵，快如闪电', cosmeticOnly: false, material: 'vinyl',
    colors: { body: '#ffb8d6', belly: '#fff0f6', accent: '#7b5cff', accent2: '#ffe066', eye: '#2f1d4a', cheek: '#ff7eb6' },
    ears: 'cat', tail: 'cat', headScale: [1.1, 0.92, 1], extras: ['dualPistols', 'bowtie'] },
  { id: 'bolt', name: 'BOLT', nameZh: '波特', species: '黄色机器人', emoji: '🤖', tagline: '电量 100%，准备开火', cosmeticOnly: false, material: 'metal',
    colors: { body: '#ffd84d', belly: '#7fd8ff', accent: '#5a6b8c', accent2: '#ff7a59', eye: '#7fffe0', cheek: '#ff9c6b' },
    ears: 'antenna', tail: 'none', headScale: [1.05, 0.9, 0.95], extras: ['visor', 'bolts'] },
  { id: 'luna', name: 'LUNA', nameZh: '露娜', species: '紫狐狸', emoji: '🦊', tagline: '月光下的狡黠狙击手', cosmeticOnly: false, material: 'plush',
    colors: { body: '#b48cff', belly: '#fff4fb', accent: '#ffe066', accent2: '#5b3fa8', eye: '#3a1f63', cheek: '#ff9ec7' },
    ears: 'fox', tail: 'fox', headScale: [1.06, 0.93, 1.05], extras: ['moonCharm', 'scarf'] },
  { id: 'poppy', name: 'POPPY', nameZh: '波比', species: '蓝企鹅', emoji: '🐧', tagline: '滑行冲锋的冰淇淋炮手', cosmeticOnly: false, material: 'vinyl',
    colors: { body: '#5aa9ff', belly: '#ffffff', accent: '#ffb347', accent2: '#ff6b9a', eye: '#1c2541', cheek: '#ff9eb5' },
    ears: 'none', tail: 'penguin', headScale: [1.1, 1, 1.05], extras: ['beak', 'flippers', 'beanie'] },
  { id: 'brix', name: 'BRIX', nameZh: '布里克斯', species: '积木机器人', emoji: '🧱', tagline: '通关积木都市的拼砌工程师', cosmeticOnly: false, material: 'vinyl',
    colors: { body: '#e53935', belly: '#ffd21f', accent: '#1e6fe8', accent2: '#2fb344', eye: '#fff7c2', cheek: '#ff8a1f' },
    ears: 'antenna', tail: 'none', headScale: [1.08, 0.9, 1.0], extras: ['visor', 'bolts'] },
];
export const getCharacter = (id: string): CharacterSpec => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

// ---------------- M4: config-driven stats, skills, unlocks ----------------
export type SkillId = 'candyDash' | 'honeyShield' | 'phantomRoll' | 'mechBuddy' | 'starlightSnipe' | 'bubbleStorm';
export interface CharStats {
  maxHp: number; moveMult: number; fireRateMult: number; damageMult: number;
  rollCharges: number; startWeapon: number; // index into WEAPON_ORDER
  weaponTweak?: { weapon: number; fireRateMult?: number; damageMult?: number; label: string };
}
export interface SkillDef { id: SkillId; name: string; nameZh: string; icon: string; cooldown: number; duration: number; desc: string; params: Record<string, number> }
export type Unlock = { kind: 'start' } | { kind: 'stage'; stage: number } | { kind: 'score'; score: number };
export const CHAR_STATS: Record<CharacterId, CharStats> = {
  mochi: { maxHp: 100, moveMult: 1.1, fireRateMult: 1.15, damageMult: 1, rollCharges: 1, startWeapon: 0 },
  bubu: { maxHp: 145, moveMult: 0.9, fireRateMult: 0.95, damageMult: 1.1, rollCharges: 1, startWeapon: 2,
    weaponTweak: { weapon: 3, damageMult: 1.25, label: '重武器：火箭 +25% 伤害' } },
  kiki: { maxHp: 95, moveMult: 1.12, fireRateMult: 1, damageMult: 1, rollCharges: 3, startWeapon: 0,
    weaponTweak: { weapon: 0, fireRateMult: 1.35, damageMult: 0.85, label: '双枪：冲锋枪射速 +35%' } },
  bolt: { maxHp: 120, moveMult: 0.95, fireRateMult: 1, damageMult: 1, rollCharges: 1, startWeapon: 1 },
  luna: { maxHp: 85, moveMult: 1.05, fireRateMult: 0.9, damageMult: 1.2, rollCharges: 1, startWeapon: 0 },
  poppy: { maxHp: 110, moveMult: 1, fireRateMult: 1, damageMult: 1, rollCharges: 1, startWeapon: 1 },
  brix: { maxHp: 130, moveMult: 1, fireRateMult: 1, damageMult: 1.1, rollCharges: 2, startWeapon: 3,
    weaponTweak: { weapon: 3, damageMult: 1.15, label: '工程火箭：火箭 +15% 伤害' } },
};
export const CHAR_SKILLS: Record<CharacterId, SkillDef> = {
  mochi: { id: 'candyDash', name: 'Candy Dash', nameZh: '糖果冲刺', icon: '💨', cooldown: 4, duration: 0.22, desc: '高速冲刺，撞飞路径上的敌人', params: {} },
  bubu: { id: 'honeyShield', name: 'Honey Shield', nameZh: '蜂蜜护盾', icon: '🍯', cooldown: 12, duration: 6, desc: '获得 55 点吸收伤害的护盾', params: { absorb: 55 } },
  kiki: { id: 'phantomRoll', name: 'Phantom Roll', nameZh: '幻影翻滚', icon: '👻', cooldown: 8, duration: 0.42, desc: '无敌翻滚并留下吸引火力的诱饵 4 秒', params: { decoyTime: 4 } },
  bolt: { id: 'mechBuddy', name: 'Mech Buddy', nameZh: '机甲伙伴', icon: '🛠️', cooldown: 15, duration: 8, desc: '部署自动炮塔 8 秒', params: { range: 18, rate: 5, damage: 7 } },
  luna: { id: 'starlightSnipe', name: 'Starlight Snipe', nameZh: '星光狙击', icon: '🌙', cooldown: 7, duration: 0.55, desc: '蓄力 0.55 秒后发射贯穿星光（必定暴击）', params: { damage: 160, range: 90 } },
  poppy: { id: 'bubbleStorm', name: 'Bubble Storm', nameZh: '泡泡风暴', icon: '🫧', cooldown: 10, duration: 0.3, desc: '半径 7 米泡泡冻结所有敌人并造成伤害', params: { radius: 7, damage: 25, bind: 3 } },
  brix: { id: 'mechBuddy', name: 'Brick Turret', nameZh: '积木炮台', icon: '🧱', cooldown: 13, duration: 9, desc: '搭起积木自动炮台 9 秒（射程 20、更高火力）', params: { range: 20, rate: 5, damage: 9 } },
};
export const CHAR_UNLOCKS: Record<CharacterId, Unlock> = {
  mochi: { kind: 'start' }, bubu: { kind: 'start' },
  kiki: { kind: 'stage', stage: 1 }, bolt: { kind: 'stage', stage: 2 }, luna: { kind: 'stage', stage: 3 },
  poppy: { kind: 'score', score: 6000 }, brix: { kind: 'stage', stage: 6 },
};
export const unlockText = (u: Unlock) => u.kind === 'start' ? '初始角色' : u.kind === 'stage' ? `通关冒险 ${u.stage > 3 ? `2-${u.stage - 3}` : `1-${u.stage}`} 解锁` : `生存模式 ${u.score} 分解锁`;
export function isUnlocked(id: CharacterId, prog: { cleared: number[]; bestSurvival: number }) {
  const u = CHAR_UNLOCKS[id];
  return u.kind === 'start' || (u.kind === 'stage' ? prog.cleared.includes(u.stage) : prog.bestSurvival >= u.score);
}
