import type { ReactNode } from 'react';
import { startGame } from '../app/actions';
import { initAudio } from '../audio/sfx';
import { initMusic } from '../audio/music';
import { SettingsPanel, ControlsList } from './Settings';
import { useUI } from '../app/store';
import { CHARACTERS, getCharacter, CHAR_STATS, CHAR_SKILLS, CHAR_UNLOCKS, isUnlocked, unlockText } from '../game/characters/registry';
import { STAGES, stageUnlocked, stagesOf, worldUnlocked } from '../game/progression/adventure';
import { WORLDS, WORLD_IDS, type WorldId } from '../game/levels/worlds';
import { WEAPONS, WEAPON_ORDER } from '../config/game';
import { CoopScreen } from './Coop';

/** Full-screen scrollable UI shell — pointer-events:auto so Android WebView can pan. */
function UiScreen({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`ui-screen ${className}`}>{children}</div>
  );
}

function UiSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="ui-sheet" role="dialog" aria-modal="true">
      <div className="ui-sheet-panel glass-panel">
        <div className="ui-sheet-bar">
          <div className="menu-title sheet-title">{title}</div>
          <button type="button" className="soft-btn bg-cream sheet-close" onClick={onClose}>关闭</button>
        </div>
        <div className="ui-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function MainMenu() {
  const netMsg = useUI((s) => s.netMsg);
  const view = useUI((s) => s.menuView), charId = useUI((s) => s.character);
  const go = (v: typeof view) => { initAudio(); initMusic(); useUI.setState({ menuView: view === v ? 'main' : v }); };
  const ch = getCharacter(charId);
  if (view === 'characters') return <CharacterScreen />;
  if (view === 'play' || view === 'adventure') return <PlayScreen />;
  if (view === 'coop') return <CoopScreen />;
  return (
    <UiScreen className="menu-root" id="main-menu">
      <div className="menu-glow" aria-hidden />
      <div className="menu-main-grid">
        <div className="menu-hero">
          <div className="menu-badge">CUTE × COMBAT TPS</div>
          <div className="menu-hero-en">PUPPET STRIKE</div>
          <div className="menu-hero-sub">Toybox Mayhem</div>
          <div className="menu-hero-zh">人偶突击队</div>
          <div className="menu-hero-shine" aria-hidden />
        </div>
        <div className="menu-selected glass-card">
          <div className="menu-selected-lbl">当前角色</div>
          <div className="menu-selected-row">
            <span className="menu-selected-av" style={{ background: ch.colors.body }}>{ch.emoji}</span>
            <div className="menu-selected-text">
              <div className="menu-selected-name">{ch.name} <span>{ch.nameZh}</span></div>
              <div className="menu-selected-tag">{ch.tagline}</div>
            </div>
          </div>
        </div>
        <nav className="menu-actions" aria-label="主菜单">
          <button type="button" id="btn-play" className="soft-btn bg-sakura menu-btn-play cta-play" onClick={() => go('play')}>
            <span className="cta-play-icon">▶</span>
            <span className="cta-play-label">PLAY 开始</span>
          </button>
          <button type="button" id="btn-coop" className="soft-btn bg-mint menu-btn" onClick={() => go('coop')}>👥 联机</button>
          <button type="button" id="btn-chars" className="soft-btn bg-lemon menu-btn" onClick={() => go('characters')}>🎎 角色</button>
          <button type="button" className="soft-btn bg-sky menu-btn" onClick={() => go('controls')}>操作</button>
          <button type="button" id="btn-settings" className="soft-btn bg-lavender menu-btn" onClick={() => go('settings')}>设置</button>
        </nav>
      </div>
      {netMsg && <div id="net-msg" className="menu-net glass-card cursor-pointer" onClick={() => useUI.setState({ netMsg: '' } as any)}>⚠ {netMsg}（点击关闭）</div>}
      {(view === 'settings' || view === 'controls') && (
        <UiSheet title={view === 'settings' ? '设置' : '操作'} onClose={() => useUI.setState({ menuView: 'main' })}>
          {view === 'settings' ? <SettingsPanel /> : <ControlsList />}
        </UiSheet>
      )}
    </UiScreen>
  );
}

function PlayScreen() {
  const view = useUI((s) => s.menuView), prog = useUI((s) => s.save.progress);
  const back = <button id="btn-back" className="soft-btn bg-cream" onClick={() => useUI.setState({ menuView: view === 'adventure' ? 'play' : 'main' })}>← 返回</button>;
  if (view === 'adventure') return (
    <UiScreen id="world-map" className="menu-overlay play-screen">
      {WORLD_IDS.map((wid) => {
        const wd = WORLDS[wid], wOpen = worldUnlocked(wid, prog.cleared), stages = stagesOf(wid), block = wid === 'block';
        return (
          <div key={wid} id={`world-${wid}`} className={`flex flex-col items-center gap-2 ${wOpen ? '' : 'opacity-70'}`}>
            <div className="text-4xl font-black text-white outline-text">WORLD {wd.index} · {wd.nameEn} {wd.name}{!wOpen && ' 🔒'}</div>
            {!wOpen && <div className="font-black text-purple-900">通关 1-3 软糖国王后解锁 · Clear 1-3 to unlock</div>}
            <div className="upg-row flex items-center gap-4">
              {stages.map((st, i) => {
                const open = wOpen && stageUnlocked(st.id, prog.cleared), done = prog.cleared.includes(st.id);
                return (<div key={st.id} className="flex items-center gap-4">
                  {i > 0 && <div className="w-12 h-2 rounded-full" style={{ background: open ? (block ? '#1e6fe8' : '#ff9ec7') : '#d8cde0' }} />}
                  <button id={`stage-${st.id}`} disabled={!open} onClick={() => { useUI.setState({ mode: 'adventure', stage: st.id }); startGame('adventure', st.id); }}
                    className={`soft-card stage-card w-64 p-3 text-center transition-transform ${open ? 'hover:-translate-y-1' : 'locked cursor-not-allowed'}`} style={block && open ? { borderColor: '#1e6fe8' } : undefined}>
                    <div className="text-4xl">{st.kind === 'boss' ? (block ? '🤖' : '👑') : block ? (i === 0 ? '🧱' : '🚂') : i === 0 ? '🍭' : '🍫'}</div>
                    <div className="text-xs font-black opacity-60">STAGE {st.label}{st.kind === 'boss' ? ' · BOSS' : ''}</div>
                    <div className="text-xl font-black text-purple-900">{st.nameZh}</div>
                    <div className="text-xs font-bold">{st.name}</div>
                    <div className="text-xs font-bold opacity-70 mt-1">{st.desc}</div>
                    <div className="mt-1 font-black">{done ? '⭐ 已通关 CLEARED' : open ? '▶ 开始 START' : '🔒 通关上一关解锁'}</div>
                  </button></div>);
              })}
            </div>
          </div>);
      })}
      <div className="font-bold text-purple-900">冒险最佳 BEST: {prog.bestAdventure}</div>
      {back}
    </UiScreen>);
  return (
    <UiScreen className="menu-overlay play-screen" id="play-select">
      <header className="play-head">
        <div className="menu-title sheet-title">选择模式</div>
        {back}
      </header>
      <div className="play-modes">
        <div className="soft-card mode-card mode-survival glass-card">
          <div className="mode-card-top">
            <span className="mode-emoji">🧸</span>
            <div>
              <div className="mode-letter">A · 生存</div>
              <div className="mode-name">玩具生存</div>
              <div className="mode-desc">无尽波次 · 每 3 波强化</div>
            </div>
          </div>
          <div className="mode-maps">
            {WORLD_IDS.map((wid) => { const ok = worldUnlocked(wid, prog.cleared), on = (prog.survivalMap ?? 'candy') === wid;
              return <button key={wid} type="button" id={`map-${wid}`} disabled={!ok} className={`soft-btn mode-map-btn ${on ? 'on' : ''} ${ok ? '' : 'locked'}`}
                onClick={() => useUI.getState().persist((sv) => { sv.progress.survivalMap = wid as WorldId; })}>{wid === 'candy' ? '🍭' : '🧱'} {WORLDS[wid].name}{ok ? '' : ' 🔒'}</button>; })}
          </div>
          <div className="mode-best">{(prog.survivalMap ?? 'candy') === 'block' ? `最高 ${prog.bestSurvivalBlock} · 波 ${prog.bestWaveBlock}` : `最高 ${prog.bestSurvival} · 波 ${prog.bestWave}`}</div>
          <button type="button" id="mode-survival" className="soft-btn bg-sakura mode-start-btn cta-play" onClick={() => { useUI.setState({ mode: 'survival', stage: 1 }); startGame('survival', 1, worldUnlocked(prog.survivalMap ?? 'candy', prog.cleared) ? prog.survivalMap : 'candy'); }}>▶ 开始 START</button>
        </div>
        <button type="button" id="mode-adventure" className="soft-card mode-card mode-adventure glass-card" onClick={() => useUI.setState({ menuView: 'adventure' })}>
          <div className="mode-card-top">
            <span className="mode-emoji">🍬</span>
            <div>
              <div className="mode-letter">B · 冒险</div>
              <div className="mode-name">冒险闯关</div>
              <div className="mode-desc">2 世界 · 6 关 · Boss</div>
            </div>
          </div>
          <div className="mode-best">进度 {prog.cleared.length}/{STAGES.length} ⭐</div>
          <div className="mode-start-btn soft-btn bg-lemon mode-go">进入选关 →</div>
        </button>
      </div>
    </UiScreen>);
}

function CharacterScreen() {
  const charId = useUI((s) => s.character), prog = useUI((s) => s.save.progress);
  const ch = getCharacter(charId), st = CHAR_STATS[ch.id], sk = CHAR_SKILLS[ch.id];
  const pick = (id: typeof charId) => { if (!isUnlocked(id, prog)) return; useUI.setState({ character: id }); useUI.getState().persist(); };
  const bar = (label: string, v: number, max: number) => (
    <div className="char-stat"><span className="char-stat-lbl">{label}</span>
      <div className="char-stat-track"><div className="char-stat-fill" style={{ width: `${Math.min(1, v / max) * 100}%` }} /></div></div>);
  return (
    <UiScreen className="menu-overlay char-screen" id="char-select">
      <header className="char-head">
        <div className="menu-title sheet-title">角色</div>
        <button id="btn-back" type="button" className="soft-btn bg-sakura char-back" onClick={() => useUI.setState({ menuView: 'main' })}>✔ 返回</button>
      </header>
      <div className="char-body">
        <div id="char-detail" className="soft-card char-detail glass-card">
          <div className="char-detail-name">{ch.emoji} <span>{ch.name}</span> <span className="char-detail-zh">{ch.nameZh}</span></div>
          <div className="char-detail-tag">{ch.tagline}</div>
          <div className="char-stats">
            {bar('HP', st.maxHp, 170)}{bar('SPD', st.moveMult, 1.2)}{bar('ROF', st.fireRateMult, 1.2)}{bar('DMG', st.damageMult, 1.25)}
          </div>
          <div className="char-detail-meta">⚔ {WEAPONS[WEAPON_ORDER[st.startWeapon]].icon} {WEAPONS[WEAPON_ORDER[st.startWeapon]].nameZh}{st.rollCharges > 1 ? ` · 翻滚×${st.rollCharges}` : ''}</div>
          {st.weaponTweak && <div className="char-detail-meta">{st.weaponTweak.label}</div>}
          <div className="char-skill"><span className="char-skill-title">{sk.icon} {sk.nameZh}</span><span className="char-skill-cd">{sk.cooldown}s</span>
            <div className="char-skill-desc">{sk.desc}</div></div>
        </div>
        <div className="char-pick" role="list">
          {CHARACTERS.map((c) => {
            const open = isUnlocked(c.id, prog);
            const lock = open ? '' : unlockText(CHAR_UNLOCKS[c.id]);
            return (
              <button type="button" key={c.id} id={`char-${c.id}`} role="listitem"
                className={`soft-card char-card ${c.id === charId ? 'sel' : ''} ${open ? '' : 'locked'}`}
                disabled={!open}
                onClick={() => pick(c.id)}
                aria-label={open ? `${c.name} ${c.nameZh}` : `${c.name} locked`}>
                <span className="char-card-av" style={{ background: c.colors.body }}>{open ? c.emoji : '🔒'}</span>
                <span className="char-card-name">{c.name}</span>
                <span className="char-card-sub">{open ? `${CHAR_SKILLS[c.id].icon} ${CHAR_SKILLS[c.id].nameZh}` : lock}</span>
              </button>
            );
          })}
        </div>
      </div>
    </UiScreen>
  );
}
