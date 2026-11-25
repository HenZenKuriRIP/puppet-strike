import { getCharacter, CHAR_SKILLS } from '../game/characters/registry';
import { BossBar } from './Run';
import { CoopHud, CoopUpgrade, Minimap } from './Coop';
import { useEffect, useState } from 'react';
import { useUI } from '../app/store';
import { POOLS, WEAPONS, WEAPON_ORDER } from '../config/game';

const TIER_STYLE = [
  { color: '#ffffff', size: 'text-4xl', glow: '#e0457b' },
  { color: '#fff3a0', size: 'text-5xl', glow: '#e0457b' },
  { color: '#9ef0d0', size: 'text-6xl', glow: '#7b2ff7' },
  { color: '#ff9ec7', size: 'text-7xl', glow: '#7b2ff7' },
  { color: '#ffffff', size: 'text-8xl', glow: '#ff3366' },
];

function SkillIcon({ label, keyName, frac, color }: { label: string; keyName: string; frac: number; color: string }) {
  const ready = frac <= 0;
  return (
    <div className="flex flex-col items-center">
      <div className={`relative w-14 h-14 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-2xl ${ready ? 'scale-105' : ''}`}
        style={{ background: ready ? color : `conic-gradient(#ffffff99 ${frac * 360}deg, ${color} ${frac * 360}deg)` }}>
        <span>{label}</span>
        <span className="hud-keybadge absolute -bottom-2 bg-purple-900 text-white text-xs font-black rounded-full px-2">{keyName}</span>
      </div>
    </div>
  );
}

export function HUD() {
  const s = useUI();
  const ch = getCharacter(s.character);
  const [hit, setHit] = useState(false);
  useEffect(() => { if (!s.hitMarker) return; setHit(true); const t = setTimeout(() => setHit(false), 90); return () => clearTimeout(t); }, [s.hitMarker]);
  const pct = Math.max(0, s.hp / s.maxHp);
  const cfg = WEAPONS[WEAPON_ORDER[s.weaponIndex]];
  const tier = TIER_STYLE[Math.min(4, Math.max(0, Math.round(s.callout?.tier ?? 0)))];
  return (
    <div className="hud-root absolute inset-0 pointer-events-none">
      {Array.from({ length: POOLS.damageNumbers }, (_, i) => <div key={i} id={'dmg-' + i} className="dmg" />)}
      <div className="hud-top absolute top-4 left-1/2 -translate-x-1/2 panel px-6 py-2 flex gap-6 items-center text-xl font-extrabold text-purple-900">
        <span className="hud-wave">波 <span className="text-candy-berry">{s.boss ? "BOSS" : s.totalWaves ? `${s.wave}/${s.totalWaves}` : s.wave}</span>{s.mode === "adventure" && <span className="ml-1 text-sm">S{s.stage}</span>}</span>
        <span className="hud-enemies">敌 <span className="text-candy-berry">{s.enemiesLeft}</span></span>
        {s.waveHint && <div className="text-sm font-black text-white outline-text mt-1">{s.waveHint}</div>}
        <span className="hud-score text-base text-purple-600">{s.score}</span>
      </div>
      {s.banner && <div className="absolute top-1/4 w-full text-center text-5xl font-black text-white outline-text">{s.banner}</div>}
      {/* combo meter + callout */}
      {s.combo >= 2 && (
        <div className="hud-combo absolute right-8 top-28 text-right">
          <div className="hud-combo-num text-5xl font-black text-white combo-wobble" style={{ textShadow: '0 4px 0 #e0457b' }}>{s.combo}<span className="hud-combo-lbl text-2xl"> 连击</span></div>
          <div className="hud-combo-mul text-2xl font-black text-candy-berry">x{s.multiplier}</div>
          <div className="w-40 h-2 bg-white/60 rounded-full ml-auto mt-1 overflow-hidden"><div className="h-full bg-candy-pink" style={{ width: `${s.comboFrac * 100}%` }} /></div>
        </div>
      )}
      {s.callout && (
        <div key={s.callout.key} className={`callout absolute top-[30%] w-full text-center font-black ${tier.size}`}
          style={{ color: tier.color, textShadow: `0 5px 0 ${tier.glow}, 0 0 ${10 + 8 * s.callout.tier}px ${tier.glow}` }}>{s.callout.text}</div>
      )}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`w-2 h-2 rounded-full ${hit ? 'bg-candy-berry scale-150' : 'bg-white'} shadow-[0_0_0_2px_#e0457b]`} />
        {[0, 90, 180, 270].map((r) => (
          <div key={r} className="absolute left-1/2 top-1/2" style={{ transform: `rotate(${r}deg) translateY(${(hit ? -16 : -13) - (cfg.pellets > 1 ? 10 : 0)}px)` }}>
            <div className={`w-[3px] h-2 -ml-[1.5px] rounded ${hit ? 'bg-candy-berry' : 'bg-white'} shadow-[0_0_0_1px_#e0457b]`} />
          </div>
        ))}
      </div>
      {/* HP + skills bottom-left */}
      <div className="hud-hp absolute bottom-5 left-5 flex items-end gap-4">
        <div className="soft-card px-5 py-3 w-80">
          <div className="text-lg font-extrabold text-purple-900 flex justify-between items-center"><span className="flex items-center gap-2"><span className="avatar !w-11 !h-11 !text-2xl" style={{ background: ch.colors.body }}>{ch.emoji}</span>{ch.name}</span><span>{s.hp}/{s.maxHp}</span></div>
          <div className="h-5 bg-pink-100 rounded-full overflow-hidden border-2 border-white mt-1">
            <div className={`h-full rounded-full transition-all ${pct > 0.35 ? 'bg-gradient-to-r from-candy-mint to-emerald-300' : 'bg-gradient-to-r from-candy-berry to-pink-400'}`} style={{ width: `${pct * 100}%` }} />
          </div>
        </div>
        <div className="hud-skill-icons flex gap-2 items-end">
          <div className="flex flex-col items-center"><SkillIcon label={CHAR_SKILLS[s.character].icon} keyName="F" frac={s.dashCd} color={s.skillActive ? '#fff3a0' : '#ff9ec7'} />
          <div id="skill-name" className="hud-skill-name text-[11px] font-black text-white outline-text mt-2">{CHAR_SKILLS[s.character].nameZh}</div></div>
        <div className="flex flex-col items-center"><SkillIcon label="🌀" keyName="C" frac={s.rollCd} color="#9ef0d0" />
          {s.rollMax > 1 && <div className="flex gap-1 mt-2">{Array.from({ length: s.rollMax }, (_, i) => <span key={i} className={`w-3 h-3 rounded-full border-2 border-white ${i < s.rollCharges ? 'bg-candy-mint' : 'bg-purple-900/40'}`} />)}</div>}</div>
        </div>
        {s.shield > 0 && <div className="soft-card px-3 py-1 font-black text-amber-600">🍯 {s.shield}</div>}
      </div>
      {/* weapons + ammo bottom-right */}
      <div className="hud-ammo absolute bottom-5 right-5 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {WEAPON_ORDER.map((id, i) => (
            <div key={id} className={`panel px-2 py-1 text-center transition-all ${i === s.weaponIndex ? 'scale-110 -translate-y-1' : 'opacity-60'}`} style={{ borderColor: i === s.weaponIndex ? WEAPONS[id].color : 'white' }}>
              <div className="text-xl">{WEAPONS[id].icon}</div>
              <div className="text-[10px] font-black text-purple-900">{i + 1} · {s.ammoList[i]}</div>
            </div>
          ))}
        </div>
        <div className="panel px-5 py-3 text-right min-w-[220px]">
          <div className="hud-wpn-name text-sm font-bold" style={{ color: cfg.color }}>{cfg.nameZh}</div>
          <div className="ammo-big text-4xl font-black text-purple-900">{s.reloading ? <span className="text-candy-berry text-2xl">换弹中…</span> : <>{s.ammo}<span className="text-xl text-purple-500"> / {s.mag}</span></>}</div>
          {s.reloading && <div className="h-2 bg-pink-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-candy-berry" style={{ width: `${s.reloadFrac * 100}%` }} /></div>}
          {!s.reloading && s.ammo === 0 && <div className="hud-tip text-candy-berry font-bold">换弹</div>}
          <div className="hud-tip-desk text-[11px] text-purple-500 font-bold">Q / 1-4 / 滚轮</div>
        </div>
      </div>
      {pct < 0.35 && <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(224,69,123,0.55)]" />}
      <BossBar />
      <Minimap />
      {s.coop && <CoopHud />}
      {s.coop && s.coopOffer && <CoopUpgrade />}
    </div>
  );
}
