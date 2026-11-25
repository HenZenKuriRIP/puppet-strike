// All key tunables live here (M2).
export const SIM = { fixedDt: 1 / 60, maxStepsPerFrame: 5 };

export const PLAYER = {
  maxHp: 100, radius: 0.38, height: 1.45,
  walkSpeed: 5.2, sprintSpeed: 8.4, accel: 45, decel: 32, airControl: 0.45,
  jumpVelocity: 8.2, gravity: 24, coyoteTime: 0.12, jumpBuffer: 0.13,
  turnSpeed: 14, hurtInvuln: 0.25,
};

export const CAMERA = {
  pivotHeight: 1.7, distance: 3.7, shoulderX: 1.0, shoulderY: 0.15, fov: 70,
  sensitivity: 0.0022, minPitch: -1.1, maxPitch: 0.9, collisionPadding: 0.25, followLerp: 18,
};

export type BulletVisualId = 'gumdrop' | 'wrapped' | 'star' | 'heart' | 'bean' | 'swirl' | 'cane' | 'cookie' | 'ribbon' | 'choc';
export const BULLET_VISUALS: BulletVisualId[] = ['gumdrop', 'wrapped', 'star', 'heart', 'bean', 'swirl', 'cane', 'cookie', 'ribbon', 'choc'];
export const bvIndex = (id: BulletVisualId) => BULLET_VISUALS.indexOf(id);
export type WeaponId = 'candySmg' | 'bubbleLauncher' | 'rainbowShotgun' | 'springRocket';
export interface WeaponConfig {
  id: WeaponId; name: string; nameZh: string; icon: string; color: string;
  kind: 'hitscan' | 'projectile';
  fireRate: number; damage: number; magSize: number; reloadTime: number;
  pellets: number; spreadHip: number; spreadMoving: number;
  recoilPitch: number; recoilYaw: number; shake: number;
  range: number; falloffStart: number; falloffMin: number;
  muzzleOffset: [number, number, number];
  tracerColors: string[];
  /** M6: candy-shaped bullet visual (id into BULLET_VISUALS) + cosmetic params */
  bulletVisual: BulletVisualId; bulletSize: number; bulletSpeed: number; sprinkles: number;
  // projectile params
  projectileSpeed?: number; projectileGravity?: number; projectileLife?: number; projectileRadius?: number;
  aoeRadius?: number; knockback?: number;
  bindTime?: number; bindSplash?: number;
}

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  candySmg: {
    id: 'candySmg', name: 'Candy SMG', nameZh: '糖果冲锋枪', icon: '🍬', color: '#ff7eb6', kind: 'hitscan',
    fireRate: 11, damage: 11, magSize: 32, reloadTime: 1.5, pellets: 1,
    spreadHip: 0.012, spreadMoving: 0.028, recoilPitch: 0.011, recoilYaw: 0.006, shake: 0.04,
    range: 90, falloffStart: 25, falloffMin: 0.6, muzzleOffset: [0.32, 1.02, -0.75], tracerColors: ['#fff6b0'],
    bulletVisual: 'wrapped', bulletSize: 0.22, bulletSpeed: 110, sprinkles: 2,
  },
  bubbleLauncher: {
    id: 'bubbleLauncher', name: 'Bubble Launcher', nameZh: '泡泡发射器', icon: '🫧', color: '#7fe8ff', kind: 'projectile',
    fireRate: 2.6, damage: 8, magSize: 8, reloadTime: 1.7, pellets: 1,
    spreadHip: 0.01, spreadMoving: 0.02, recoilPitch: 0.02, recoilYaw: 0.01, shake: 0.06,
    range: 60, falloffStart: 60, falloffMin: 1, muzzleOffset: [0.32, 1.05, -0.8], tracerColors: ['#bff6ff'],
    projectileSpeed: 15, projectileGravity: -1.2, projectileLife: 2.6, projectileRadius: 0.32,
    bindTime: 2.8, bindSplash: 1.6,
    bulletVisual: 'gumdrop', bulletSize: 0.42, bulletSpeed: 0, sprinkles: 1,
  },
  rainbowShotgun: {
    id: 'rainbowShotgun', name: 'Rainbow Shotgun', nameZh: '彩虹霰弹枪', icon: '🌈', color: '#ffd36b', kind: 'hitscan',
    fireRate: 1.5, damage: 9, magSize: 6, reloadTime: 1.9, pellets: 9,
    spreadHip: 0.085, spreadMoving: 0.03, recoilPitch: 0.06, recoilYaw: 0.02, shake: 0.22,
    range: 40, falloffStart: 8, falloffMin: 0.35, muzzleOffset: [0.32, 1.02, -0.85],
    tracerColors: ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'],
    bulletVisual: 'ribbon', bulletSize: 0.17, bulletSpeed: 90, sprinkles: 1,
  },
  springRocket: {
    id: 'springRocket', name: 'Spring Rocket', nameZh: '弹簧火箭', icon: '🚀', color: '#b79cff', kind: 'projectile',
    fireRate: 1.1, damage: 70, magSize: 3, reloadTime: 2.3, pellets: 1,
    spreadHip: 0.004, spreadMoving: 0.01, recoilPitch: 0.07, recoilYaw: 0.01, shake: 0.3,
    range: 80, falloffStart: 80, falloffMin: 1, muzzleOffset: [0.32, 1.1, -0.9], tracerColors: ['#ffb3a0'],
    projectileSpeed: 24, projectileGravity: 3.5, projectileLife: 3, projectileRadius: 0.22,
    aoeRadius: 3.8, knockback: 9,
    bulletVisual: 'cane', bulletSize: 0.42, bulletSpeed: 0, sprinkles: 3,
  },
};
export const WEAPON_ORDER: WeaponId[] = ['candySmg', 'bubbleLauncher', 'rainbowShotgun', 'springRocket'];
export const WEAPON_SWITCH_TIME = 0.28;

/** Toy combo interaction: a bubble-bound enemy caught in an explosion bursts, dealing its own AoE. */
export const BUBBLE_BURST = { radius: 3.2, damage: 40, knockback: 6, maxChain: 10 };

export const SKILLS = {
  dash: { cooldown: 4, duration: 0.22, speed: 24, invuln: 0.32, damage: 30, hitRadius: 1.3, knockback: 7 },
  roll: { cooldown: 1.3, duration: 0.42, speed: 11, iframes: 0.34 },
};

export const COMBO = {
  window: 3.0,
  thresholds: [2, 5, 10, 15],           // kills needed for tier 1..4
  names: ['', 'COMBO x2', 'COMBO x5', 'SUPER COMBO!', 'TOY MAYHEM!'],
  multipliers: [1, 1.5, 2, 3, 4],
  maxMultiplier: 4,
  cooldownRegen: [0, 0.25, 0.4, 0.6, 0.8], // seconds shaved off skill cooldowns per kill at tier
  regenCapPerChain: 3,                     // max total cooldown regen in one chain
  healOnTierUp: 5,
};

export type EnemyType = 'windup' | 'gunner' | 'bunny' | 'tank' | 'drone' | 'clown' | 'gumdrop' | 'choco' | 'lolli' | 'mint' | 'jelly' | 'mega' | 'king' | 'bsoldier' | 'bturret' | 'bgolem' | 'bcrane' | 'colossus';
export interface EnemyConfig {
  name: string; hp: number; speed: number; radius: number; height: number;
  detectRange: number; loseRange: number; attackRange: number;
  windup: number; cooldown: number; damage: number; detectDelay: number; score: number;
  projectileSpeed?: number; projectileSize?: number; projectileColor?: string;
  flying?: boolean; hoverHeight?: number; orbitRadius?: number;
  armorFront?: number;     // damage multiplier for frontal hitscan hits
  leapTime?: number; blastRadius?: number;
  bindResist?: number;     // bind time multiplier
  /** M6 candy tank family */
  candyTank?: boolean; bullet?: BulletVisualId;
  burst?: number;          // gumdrop: shots per burst
  minRange?: number;       // lolli: keeps at least this far away
  lob?: { time: number; radius: number; spread: number };            // lolli/mega: arcing shell (flight time, blast radius, aim scatter)
  ring?: { shots: number; arms: number; interval: number; speed: number; spin: number };  // mint spiral rings
  swarm?: number;          // jelly: group size multiplier when queued
  /** W2 block-world enemies: brick-built model, telegraph via Enemy.tele, `mount` = static (spawns at the map's turret / crane mounts) */
  brick?: boolean; mount?: 'turret' | 'crane';
}
export const ENEMIES = {
  windup: { name: '发条士兵', hp: 55, speed: 3.6, radius: 0.5, height: 1.3, detectRange: 16, loseRange: 70, attackRange: 1.7,
    windup: 0.55, cooldown: 0.9, damage: 14, detectDelay: 0.35, score: 100 },
  gunner: { name: '玩具炮手', hp: 40, speed: 2.4, radius: 0.48, height: 1.4, detectRange: 24, loseRange: 70, attackRange: 15,
    windup: 0.85, cooldown: 1.5, damage: 11, detectDelay: 0.45, score: 150, projectileSpeed: 15, projectileSize: 1, projectileColor: '#ff5c9a' },
  bunny: { name: '弹跳兔', hp: 45, speed: 4.6, radius: 0.45, height: 1.2, detectRange: 22, loseRange: 70, attackRange: 7,
    windup: 0.6, cooldown: 1.6, damage: 16, detectDelay: 0.3, score: 175, leapTime: 0.6, blastRadius: 1.9 },
  tank: { name: '铁皮坦克', hp: 220, speed: 1.3, radius: 0.95, height: 1.5, detectRange: 26, loseRange: 70, attackRange: 18,
    windup: 1.3, cooldown: 2.6, damage: 24, detectDelay: 0.6, score: 400, projectileSpeed: 11, projectileSize: 2.4, projectileColor: '#ff8c42',
    armorFront: 0.3, bindResist: 0.45 },
  drone: { name: '飞行无人机', hp: 35, speed: 4.2, radius: 0.5, height: 0.6, detectRange: 26, loseRange: 70, attackRange: 16,
    windup: 0.5, cooldown: 1.2, damage: 8, detectDelay: 0.3, score: 200, projectileSpeed: 19, projectileSize: 0.8, projectileColor: '#7fd8ff',
    flying: true, hoverHeight: 4, orbitRadius: 9 },
  clown: { name: '炸弹小丑', hp: 30, speed: 5.0, radius: 0.45, height: 1.35, detectRange: 22, loseRange: 70, attackRange: 2.3,
    windup: 0.9, cooldown: 99, damage: 32, detectDelay: 0.25, score: 175, blastRadius: 3.4 },
} as Record<EnemyType, EnemyConfig>;
Object.assign(ENEMIES, {
  gumdrop: { name: '软糖坦克', hp: 75, speed: 5.4, radius: 0.65, height: 0.95, detectRange: 26, loseRange: 80, attackRange: 13,
    windup: 0.45, cooldown: 1.6, damage: 7, detectDelay: 0.3, score: 220, projectileSpeed: 17, projectileSize: 0.9, projectileColor: '#ff7eb6',
    candyTank: true, bullet: 'gumdrop', burst: 3, bindResist: 1 },
  choco: { name: '巧克力重型坦克', hp: 420, speed: 1.0, radius: 1.15, height: 1.6, detectRange: 28, loseRange: 80, attackRange: 17,
    windup: 1.25, cooldown: 3.0, damage: 26, detectDelay: 0.6, score: 650, projectileSpeed: 10, projectileSize: 2.6, projectileColor: '#8a5230',
    armorFront: 0.22, bindResist: 0.3, candyTank: true, bullet: 'choc' },
  lolli: { name: '棒棒糖炮兵坦克', hp: 130, speed: 1.7, radius: 0.85, height: 1.5, detectRange: 40, loseRange: 90, attackRange: 30, minRange: 9,
    windup: 1.5, cooldown: 4.2, damage: 24, detectDelay: 0.5, score: 500, projectileColor: '#ff9ec7',
    candyTank: true, bullet: 'swirl', lob: { time: 1.7, radius: 3.0, spread: 1.2 }, bindResist: 0.6 },
  mint: { name: '薄荷旋转坦克', hp: 170, speed: 1.6, radius: 0.9, height: 1.25, detectRange: 30, loseRange: 80, attackRange: 14,
    windup: 0.9, cooldown: 3.4, damage: 7, detectDelay: 0.4, score: 450, projectileSpeed: 8.5, projectileSize: 1.0, projectileColor: '#7fe8d0',
    candyTank: true, bullet: 'swirl', ring: { shots: 18, arms: 3, interval: 0.09, speed: 8.5, spin: 0.38 }, bindResist: 0.6 },
  jelly: { name: '迷你果冻坦克', hp: 28, speed: 4.3, radius: 0.45, height: 0.62, detectRange: 26, loseRange: 80, attackRange: 1.5,
    windup: 0.35, cooldown: 0.9, damage: 7, detectDelay: 0.15, score: 60, candyTank: true, swarm: 5, bindResist: 1 },
  mega: { name: '巨型糖果坦克', hp: 1500, speed: 1.5, radius: 1.75, height: 2.5, detectRange: 40, loseRange: 90, attackRange: 22, minRange: 7,
    windup: 1.1, cooldown: 2.4, damage: 14, detectDelay: 0.5, score: 2500, projectileSpeed: 11, projectileSize: 1.6, projectileColor: '#ffd36b',
    armorFront: 0.5, bindResist: 0.08, candyTank: true, bullet: 'star', lob: { time: 1.8, radius: 3.4, spread: 2.5 }, ring: { shots: 14, arms: 14, interval: 0.0, speed: 9, spin: 0 } },
} as Record<string, EnemyConfig>);
ENEMIES.king = { name: '软糖国王 KING GUMMY', hp: 3000, speed: 2.2, radius: 1.9, height: 4.4, detectRange: 99, loseRange: 99, attackRange: 99,
  windup: 1, cooldown: 1, damage: 12, detectDelay: 0, score: 5000, projectileSpeed: 9, projectileSize: 1.3, projectileColor: '#ff5c9a', bindResist: 0, blastRadius: 7.5 };
/** W2: Block City enemies (appended AFTER king: ENEMY_IDS = Object.keys(ENEMIES) is the snapshot type index) */
Object.assign(ENEMIES, {
  bsoldier: { name: '积木士兵', hp: 75, speed: 4.0, radius: 0.5, height: 1.4, detectRange: 22, loseRange: 80, attackRange: 1.9,
    windup: 0.5, cooldown: 1.0, damage: 15, detectDelay: 0.3, score: 130, armorFront: 0.55, bindResist: 0.8, brick: true },
  bturret: { name: '积木炮台', hp: 170, speed: 0, radius: 0.8, height: 1.8, detectRange: 30, loseRange: 80, attackRange: 26,
    windup: 0.85, cooldown: 1.9, damage: 11, detectDelay: 0.4, score: 280, projectileSpeed: 15, projectileSize: 1.1, projectileColor: '#2f7bff', bullet: 'choc', burst: 3, bindResist: 0.3, brick: true, mount: 'turret' },
  bgolem: { name: '积木巨人', hp: 600, speed: 1.8, radius: 1.3, height: 3.0, detectRange: 34, loseRange: 90, attackRange: 20, minRange: 6,
    windup: 1.2, cooldown: 3.4, damage: 12, detectDelay: 0.5, score: 900, projectileColor: '#e53935', bullet: 'cookie', projectileSize: 1.5, armorFront: 0.35, bindResist: 0.25, blastRadius: 5.2,
    lob: { time: 1.5, radius: 2.8, spread: 1.3 }, brick: true },
  bcrane: { name: '拆楼吊车', hp: 320, speed: 0, radius: 1.4, height: 4.2, detectRange: 14, loseRange: 60, attackRange: 11,
    windup: 1.4, cooldown: 3.4, damage: 14, detectDelay: 0.3, score: 450, bindResist: 0.2, blastRadius: 9, brick: true, mount: 'crane' },
  colossus: { name: '积木巨像 BRICK COLOSSUS', hp: 3000, speed: 1.6, radius: 2.2, height: 6.4, detectRange: 99, loseRange: 99, attackRange: 99,
    windup: 1, cooldown: 1, damage: 14, detectDelay: 0, score: 8000, projectileSpeed: 11, projectileSize: 1.4, projectileColor: '#e53935', bindResist: 0, blastRadius: 8, brick: true },
} as Record<string, EnemyConfig>);
export const ENEMY_ORDER: EnemyType[] = ['windup', 'gunner', 'bunny', 'tank', 'drone', 'clown', 'gumdrop', 'choco', 'lolli', 'mint', 'jelly', 'mega', 'bsoldier', 'bturret', 'bgolem', 'bcrane'];
export const TANK_TYPES: EnemyType[] = ['gumdrop', 'choco', 'lolli', 'mint', 'jelly', 'mega'];

export type WaveDef = Partial<Record<EnemyType, number>>;
export const WAVES: WaveDef[] = [
  { windup: 3, gunner: 1 },
  { windup: 3, gunner: 2, bunny: 2 },
  { windup: 2, gunner: 2, bunny: 2, clown: 2, drone: 1 },
  { windup: 2, gunner: 2, bunny: 2, clown: 3, drone: 2, tank: 1 },
  { windup: 3, gunner: 2, bunny: 3, clown: 3, drone: 2, tank: 2 },
];
export const WAVE = { intermission: 3, spawnInterval: 0.6 };

export const POOLS = { enemies: 64, projectiles: 260, shots: 32, sparks: 720, tracers: 64, damageNumbers: 48, blasts: 16, lobs: 24, pickups: 24 };

export const FX = { shakeEnabledDefault: true, shakeOnHurt: 0.48, shakeOnBlast: 0.58, shakeDecay: 5.5, hitFlashTime: 0.18, deathPopTime: 0.35 };

export const ARENA = { half: 36 };
/** M6 co-op tuning (all configurable). Index by player count (1 or 2). */
export const COOP = { enemyCountMult: [1, 1.6], enemyHpMult: [1, 1.45], reviveTime: 2.2, reviveRange: 2.8, reviveHp: 0.5, downedBleed: 0, snapshotHz: 30, inputHz: 40, interpDelay: 0.1, upgradeTimeout: 30, targeting: 'nearest' as 'nearest' | 'random', wsPort: 8787 };

/** Hit-stop (brief sim freeze) on impactful hits; toggleable in settings. */
export const HITSTOP = { crit: 0.025, kill: 0.04, critKill: 0.07, max: 0.09 };
/** Aim-down-sights on right mouse. */
export const ADS = { fov: 48, distance: 2.3, shoulderX: 0.8, sensMult: 0.55, spreadMult: 0.55, moveMult: 0.7, blendTime: 0.15 };
