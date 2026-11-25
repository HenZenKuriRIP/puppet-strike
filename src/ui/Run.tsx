import { useEffect } from 'react';
import { useUI } from '../app/store';
import { getUpgrade, RARITY, OFFER_SKIP, OFFER_REROLL } from '../game/progression/upgrades';
import { chooseUpgrade } from '../game/systems/runFlow';
import { startGame, toMenu } from '../app/actions';
import { getCharacter } from '../game/characters/registry';
import { getStage, nextStage, stagesOf } from '../game/progression/adventure';
import { world } from '../game/core/world';

export function UpgradePick() {
  const ids = useUI((s) => s.upgradeChoices), reason = useUI((s) => s.upgradeReason), rerolls = useUI((s) => s.upgradeRerolls);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && ids[i]) chooseUpgrade(ids[i]); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [ids]);
  const stacks = world.run.stacks;
  return (
    <div className="ui-screen menu-overlay flex flex-col items-center backdrop-blur-sm" style={{ background: 'radial-gradient(circle, rgba(255,236,247,.55), rgba(90,40,120,.55))' }}>
      <div className="menu-title text-5xl font-black text-white outline-text mb-1">选择强化</div>
      <div className="menu-sub font-bold text-white mb-4 drop-shadow">{reason === 'start' ? '开局自选（通关世界 1 解锁）' : reason === 'stage' ? '关卡奖励' : '波次奖励'}</div>
      <div className="upg-row flex gap-6">
        {ids.map((id, i) => {
          const u = getUpgrade(id), r = RARITY[u.rarity], have = stacks[id] ?? 0;
          return (
            <button key={id} id={`upg-${i}`} onClick={() => chooseUpgrade(id)}
              className="upg-card relative w-60 h-80 rounded-3xl p-5 text-left flex flex-col transition-transform hover:-translate-y-2 hover:scale-105"
              style={{ background: `linear-gradient(160deg, #ffffff 0%, ${r.color}33 55%, ${r.color}88 100%)`, border: `5px solid ${r.color}`, boxShadow: `0 10px 0 ${r.color}aa, 0 0 ${u.rarity === 'legendary' ? 40 : 14}px ${r.color}`, animation: `cardIn .35s ${i * 0.08}s both` }}>
              <div className="absolute top-3 right-3 text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: r.color }}>{r.label}</div>
              <div className="absolute top-3 left-4 font-black text-purple-900/50">{i + 1}</div>
              <div className="text-7xl text-center mt-6">{u.icon}</div>
              <div className="text-2xl font-black text-purple-900 mt-3 text-center">{u.nameZh}</div>
              <div className="text-sm font-extrabold text-purple-700 text-center">{u.name}</div>
              <div className="text-sm font-bold text-purple-900 mt-3 flex-1">{u.desc}</div>
              <div className="text-xs font-black text-purple-700">{u.requires ? '✨ 协同 SYNERGY · ' : ''}层数 {have}/{u.maxStacks}</div>
            </button>
          );
        })}
      </div>
        <div className="flex gap-3 mt-5">
          <button id="upg-reroll" disabled={rerolls <= 0} onClick={() => chooseUpgrade(OFFER_REROLL)}
            className="candy-btn bg-candy-mint text-purple-900 disabled:opacity-40">{rerolls > 0 ? `重随一次（剩 ${rerolls}）` : '已重随'}</button>
          <button id="upg-skip" onClick={() => chooseUpgrade(OFFER_SKIP)} className="candy-btn bg-candy-grape text-white">跳过</button>
        </div>
    </div>
  );
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export function ResultsScreen() {
  const r = useUI((s) => s.results), coop = useUI((s) => s.coop);
  if (!r) return null;
  const ch = getCharacter(r.character), st = getStage(r.stage);
  const title = r.won ? (r.mode === 'adventure' ? '🏆 冒险通关！VICTORY!' : '胜利！VICTORY!') : '被打败了… DEFEAT';
  const sub = r.mode === 'survival' ? `玩具生存 · 坚持到第 ${r.wave} 波` : r.won ? (st.world === 'block' ? '积木都市重建完成 🧱 BRICK COLOSSUS 被拆解了！' : '糖果乐园安全啦 🍭 King Gummy 被打败！') : `冒险 ${st.label} ${st.nameZh}`;
  const rows: [string, string][] = [['分数 SCORE', String(r.score)], ['击败 KILLS', String(r.kills)], ['最大连击 MAX COMBO', `x${r.maxCombo}`], ['时间 TIME', fmt(r.time)]];
  return (
    <div className={`ui-screen menu-overlay flex items-center justify-center backdrop-blur-sm ${r.won ? 'bg-yellow-100/50' : 'bg-purple-900/40'}`}>
      {r.won && <div className="confetti-rain">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.25}s`, background: ['#ff9ec7', '#ffd84d', '#9ef0d0', '#c9a8ff', '#7fe8ff'][i % 5] }} />)}</div>}
      <div id="results" className="panel menu-scroll-panel results-panel flex flex-col items-center gap-3" style={{ animation: 'cardIn .5s both' }}>
        <div className={`text-6xl font-black text-white outline-text ${r.won ? 'victory-bounce' : ''}`}>{title}</div>
        <div className="text-xl font-bold text-purple-800">{coop ? '👥 CO-OP · ' : ''}{ch.emoji} {ch.name} · {sub}</div>
        {r.newBest && <div className="text-2xl font-black text-candy-berry animate-pulse">★ 新纪录 NEW BEST! ★</div>}
        <div className="grid grid-cols-2 gap-3 w-full">
          {rows.map(([k, v]) => <div key={k} className="soft-card px-4 py-2 text-center"><div className="text-xs font-black opacity-60">{k}</div><div className="text-3xl font-black text-purple-900">{v}</div></div>)}
        </div>
        <div className="w-full">
          <div className="text-sm font-black text-purple-800 mb-1">强化 UPGRADES ({r.upgrades.length})</div>
          <div className="flex flex-wrap gap-1">{r.upgrades.length ? r.upgrades.map((id, i) => { const u = getUpgrade(id); return <span key={i} className="px-2 py-0.5 rounded-full text-sm font-bold text-white" style={{ background: RARITY[u.rarity].color }}>{u.icon} {u.nameZh}</span>; }) : <span className="opacity-60 font-bold">—</span>}</div>
        </div>
        {r.won && r.mode === 'adventure' && r.stage === 3 && <div id="world-unlock" className="soft-card px-4 py-2 font-black text-purple-900">🧱 世界 2「积木都市」已开启！WORLD 2 UNLOCKED</div>}
        {r.won && r.mode === 'adventure' && r.stage === 6 && <div id="world-clear" className="soft-card px-4 py-2 font-black text-purple-900">🏙️ 积木都市通关！WORLD 2 CLEARED — 积木巨像已拆解</div>}
        {r.unlocked.length > 0 && <div className="soft-card px-4 py-2 font-black text-purple-900">🔓 解锁新角色 UNLOCKED: {r.unlocked.map((id) => `${getCharacter(id).emoji} ${getCharacter(id).name}`).join('  ')}</div>}
        <div className="flex gap-3 mt-2">
          {!coop && <button id="btn-restart" className="candy-btn bg-candy-pink text-white" onClick={() => startGame(r.mode, r.mode === 'adventure' ? (r.won ? stagesOf(st.world)[0].id : r.stage) : 1)}>再来一局 RESTART</button>}
          {r.mode === 'adventure' && !r.won && nextStage(r.stage - 1) && <span />}
          <button id="btn-menu" className="candy-btn bg-candy-grape text-white" onClick={toMenu}>主菜单 MENU</button>
        </div>
      </div>
    </div>
  );
}

export function BossBar() {
  const b = useUI((s) => s.boss);
  if (!b) return null;
  return (
    <div id="boss-bar" className="absolute top-20 left-1/2 -translate-x-1/2 w-[560px] text-center">
      <div className="text-2xl font-black text-white outline-text">{b.kind === 'colossus' ? '🧱 BRICK COLOSSUS 积木巨像' : '👑 KING GUMMY 软糖国王'} <span className="text-lg">· PHASE {b.phase}/3</span></div>
      <div className="relative h-6 rounded-full bg-purple-900/50 border-4 border-white overflow-hidden mt-1">
        <div className="h-full transition-all" style={{ width: `${b.hpFrac * 100}%`, background: b.invuln ? '#c9c2d6' : b.kind === 'colossus' ? (b.phase === 3 ? 'linear-gradient(90deg,#e53935,#ff8a1f)' : b.phase === 2 ? 'linear-gradient(90deg,#1e6fe8,#ffd21f)' : 'linear-gradient(90deg,#1e6fe8,#6fb4ff)') : b.phase === 3 ? 'linear-gradient(90deg,#ff2d55,#ff8c42)' : 'linear-gradient(90deg,#ff5c9a,#ffb3d1)' }} />
        {(b.kind === 'colossus' ? [0.7, 0.35] : [0.66, 0.33]).map((x) => <div key={x} className="absolute top-0 bottom-0 w-1 bg-white/80" style={{ left: `${x * 100}%` }} />)}
      </div>
      {b.invuln && <div className="text-sm font-black text-white drop-shadow">无敌中 INVULNERABLE…</div>}
    </div>
  );
}
