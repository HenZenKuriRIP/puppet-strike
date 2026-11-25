// M4 MODE B Adventure: World 1 Candy Land (stages 1-3). W2: World 2 Block City (stages 4-6 = "2-1".."2-3").
import type { WaveDef } from '../../config/game';
import type { WorldId } from '../levels/worlds';
export interface StageDef { id: number; world: WorldId; /** number inside the world (1..3) */ n: number; label: string; name: string; nameZh: string; kind: 'waves' | 'boss'; waves: WaveDef[]; desc: string }
export const WORLD1 = { id: 1, name: 'Candy Land', nameZh: '糖果乐园' };
export const WORLD2 = { id: 2, name: 'Block City', nameZh: '积木都市' };
/** the stage that must be cleared to open a world (World 2 unlocks after 1-3) */
export const WORLD_UNLOCK_STAGE: Record<WorldId, number> = { candy: 0, block: 3 };
export const STAGES: StageDef[] = [
  { id: 1, world: 'candy', n: 1, label: '1-1', name: 'Lollipop Plaza', nameZh: '棒棒糖广场', kind: 'waves', desc: '3 波：发条兵、软糖坦克与果冻坦克群',
    waves: [{ windup: 2, gunner: 2, gumdrop: 1 }, { windup: 2, gunner: 2, bunny: 2, gumdrop: 2, jelly: 1 }, { windup: 2, gunner: 2, bunny: 2, clown: 2, gumdrop: 2, jelly: 1, choco: 1 }] },
  { id: 2, world: 'candy', n: 2, label: '1-2', name: 'Chocolate Riverside', nameZh: '巧克力河畔', kind: 'waves', desc: '3 波：重型/炮兵/旋转坦克登场，小心地面红圈',
    waves: [{ gunner: 2, bunny: 2, drone: 1, gumdrop: 2, jelly: 1 }, { gunner: 2, clown: 1, drone: 2, gumdrop: 1, mint: 1, jelly: 1 }, { windup: 1, gunner: 2, drone: 1, tank: 1, mint: 1, lolli: 1, choco: 1, jelly: 1 }] },
  { id: 3, world: 'candy', n: 3, label: '1-3', name: "King Gummy's Court", nameZh: '软糖国王的宫殿', kind: 'boss', desc: 'BOSS：软糖国王 KING GUMMY', waves: [] },
  { id: 4, world: 'block', n: 1, label: '2-1', name: 'Brick Street', nameZh: '积木大街', kind: 'waves', desc: '3 波：积木士兵列队推进，积木炮台封锁路口 — 推倒多米诺、推开砖墙',
    waves: [{ bsoldier: 3, windup: 2, gunner: 1 }, { bsoldier: 3, gunner: 2, bunny: 2, bturret: 1 }, { bsoldier: 3, gumdrop: 2, jelly: 1, drone: 1, bturret: 2, clown: 2 }] },
  { id: 5, world: 'block', n: 2, label: '2-2', name: 'Train Yard', nameZh: '火车编组场', kind: 'waves', desc: '3 波：积木巨人与拆楼吊车登场，小心环线玩具火车',
    waves: [{ bsoldier: 3, gunner: 2, bcrane: 1 }, { bsoldier: 2, bgolem: 1, gumdrop: 1, bturret: 1, clown: 1 }, { bsoldier: 2, bgolem: 1, bcrane: 1, mint: 1, bturret: 1 }] },
  { id: 6, world: 'block', n: 3, label: '2-3', name: 'Colossus Plaza', nameZh: '巨像广场', kind: 'boss', desc: 'BOSS：积木巨像 BRICK COLOSSUS', waves: [] },
];
export const stagesOf = (w: WorldId) => STAGES.filter((s) => s.world === w);
export const getStage = (id: number) => STAGES.find((s) => s.id === id) ?? STAGES[0];
/** stage n is selectable if it's stage 1 or stage n-1 was cleared (4 = "2-1" therefore needs 1-3 cleared) */
export const stageUnlocked = (id: number, cleared: number[]) => id === 1 || cleared.includes(id - 1);
/** next stage inside the same world (null after a world's boss) */
export const nextStage = (id: number) => { const cur = STAGES.find((s) => s.id === id); const nx = STAGES.find((s) => s.id === id + 1); return cur && nx && nx.world === cur.world ? nx : null; };
export const worldUnlocked = (w: WorldId, cleared: number[]) => WORLD_UNLOCK_STAGE[w] === 0 || cleared.includes(WORLD_UNLOCK_STAGE[w]);
export const stageLabel = (id: number) => STAGES.find((s) => s.id === id)?.label ?? `${id}`;
export const worldCleared = (w: WorldId, cleared: number[]) => stagesOf(w).every((s) => cleared.includes(s.id));
