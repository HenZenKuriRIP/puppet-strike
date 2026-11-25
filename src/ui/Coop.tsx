/** M6 co-op UI: lobby screen (host / join / pick character), partner HUD, upgrade overlay, minimap. */
import { useEffect, useRef, useState } from 'react';
import { useUI } from '../app/store';
import { useNet } from '../net/netStore';
import { hostRoom, joinRoom, listRooms, pickChar, hostStart, leaveNet, lanUrlHint, wsUrl } from '../net/session';
import { normCode } from '../net/protocol';
import { initAudio } from '../audio/sfx';
import { CHARACTERS, getCharacter, isUnlocked, CharacterId } from '../game/characters/registry';
import { STAGES, stageUnlocked, worldUnlocked } from '../game/progression/adventure';
import { getUpgrade, RARITY, OFFER_SKIP, OFFER_REROLL } from '../game/progression/upgrades';
import { chooseUpgrade } from '../game/systems/runFlow';
import { world } from '../game/core/world';
import { H, PLAZA, FOREST, VILLAGE, HOUSES, BLOCKS } from '../game/levels/arenaLayout';
import { DOMES, RIVER, BRIDGES } from '../game/levels/terrain';
import { currentWorld } from '../game/levels/worlds';
import { MECH, carPose } from '../game/levels/mech';

const NAME_KEY = 'puppet-strike-name';
const loadName = () => { try { return localStorage.getItem(NAME_KEY) || 'Player'; } catch { return 'Player'; } };

export function CoopScreen() {
  const net = useNet(), prog = useUI((s) => s.save.progress), uiChar = useUI((s) => s.character), netMsg = useUI((s) => s.netMsg);
  const [sub, setSub] = useState<'choose' | 'host' | 'join'>(net.role === 'host' ? 'host' : net.role === 'client' ? 'join' : 'choose');
  const [name, setName] = useState(loadName);
  const [codeIn, setCodeIn] = useState('');
  const [stage, setStage] = useState(1);
  const [smap, setSmap] = useState<'candy' | 'block'>('candy');
  useEffect(() => { useNet.getState().set({ myChar: isUnlocked(uiChar, prog) ? uiChar : 'mochi', error: '' }); useUI.setState({ netMsg: '' } as any); }, []); // eslint-disable-line
  useEffect(() => { try { localStorage.setItem(NAME_KEY, name); } catch { /* */ } }, [name]);
  // poll the room list while joining (not yet in a room)
  useEffect(() => {
    if (sub !== 'join' || net.status === 'ready') return;
    listRooms(); const t = setInterval(listRooms, 2000); return () => clearInterval(t);
  }, [sub, net.status]);
  const inRoom = net.status === 'waiting' || net.status === 'ready';
  const back = () => { if (inRoom || net.status !== 'idle') leaveNet(); if (sub === 'choose') useUI.setState({ menuView: 'main' }); else setSub('choose'); };
  const lan = lanUrlHint();
  const isLocal = /^(localhost|127\.|\[?::1)/.test(location.hostname);
  const partnerCh = net.partnerChar as CharacterId | '';
  const charRow = (
    <div className="flex gap-2 flex-wrap justify-center" id="coop-chars">
      {CHARACTERS.map((c) => {
        const open = isUnlocked(c.id, prog), taken = partnerCh === c.id, sel = net.myChar === c.id;
        return (
          <button key={c.id} id={`coop-char-${c.id}`} disabled={!open || taken} onClick={() => pickChar(c.id)}
            className={`soft-card char-card px-3 py-2 text-center w-28 ${sel ? 'sel' : ''} ${!open || taken ? 'locked' : ''}`}>
            <div className="avatar mx-auto" style={{ background: c.colors.body }}>{open ? c.emoji : '🔒'}</div>
            <div className="font-black text-sm">{c.name}</div>
            {taken && <div className="text-[11px] font-black text-candy-berry">队友已选</div>}
          </button>);
      })}
    </div>);
  return (
    <div className="ui-screen menu-overlay coop-screen flex flex-col items-center gap-4" style={{ background: 'linear-gradient(180deg, rgba(255,236,247,.78), rgba(255,247,236,.6))' }}>
      <div className="text-5xl font-black text-white outline-text">CO-OP 局域网合作</div>
      <div className="font-bold text-purple-900">两台电脑同一 Wi-Fi / 网线 · 房主运行模拟 · 服务器 {wsUrl()}</div>
      {(netMsg || net.error) && <div id="coop-err" className="soft-card px-4 py-2 font-black text-candy-berry max-w-[720px] text-center">{net.error || netMsg}</div>}
      <div className="flex items-center gap-2 font-bold">昵称 NAME <input id="coop-name" value={name} maxLength={14} onChange={(e) => setName(e.target.value)} className="px-3 py-1 rounded-full border-4 border-white shadow font-black text-purple-900 w-40" /></div>
      {sub === 'choose' && (
        <div className="flex gap-8">
          <button id="coop-host-btn" className="soft-card w-72 p-6 text-center hover:-translate-y-1 transition-transform" onClick={() => { initAudio(); setSub('host'); hostRoom(name); }}>
            <div className="text-6xl">🏠</div><div className="text-3xl font-black text-purple-900">创建房间</div><div className="font-bold">HOST · 生成 4 位房间码</div></button>
          <button id="coop-join-btn" className="soft-card w-72 p-6 text-center hover:-translate-y-1 transition-transform" onClick={() => { initAudio(); setSub('join'); }}>
            <div className="text-6xl">🚪</div><div className="text-3xl font-black text-purple-900">加入房间</div><div className="font-bold">JOIN · 输入房间码或点选</div></button>
        </div>)}
      {sub === 'host' && (
        <div className="soft-card p-5 flex flex-col items-center gap-3 min-w-[620px]">
          <div className="text-sm font-black opacity-60">房间码 ROOM CODE</div>
          <div id="coop-code" className="text-7xl font-black tracking-[0.3em] text-candy-berry">{net.code || '····'}</div>
          <div id="coop-lan" className="font-bold text-purple-900 text-center">
            {isLocal ? <>队友请在浏览器打开 <b>http://&lt;你的局域网IP&gt;:{location.port || '5173'}</b>（查 IP 见 README）</> : <>队友请在浏览器打开 <b>{lan}</b></>}
          </div>
          <div id="coop-status" className="font-black">{net.status === 'ready' ? `✅ ${net.partnerName} 已加入` : net.status === 'connecting' ? '连接服务器…' : '⏳ 等待队友加入…'}</div>
          <div className="font-black text-sm">选择你的角色 · 队友角色会自动避开重复</div>
          {charRow}
          <div className="flex gap-3 items-center">
            <button id="coop-start-survival" disabled={net.status !== 'ready'} className="soft-btn bg-sakura" onClick={() => hostStart('survival', 1, smap)}>🧸 玩具生存 START</button>
            <select id="coop-map" value={smap} onChange={(e) => setSmap(e.target.value as 'candy' | 'block')} className="rounded-full px-3 py-2 font-black border-4 border-white shadow">
              <option value="candy">🍭 糖果乐园</option><option value="block" disabled={!worldUnlocked('block', prog.cleared)}>🧱 积木都市</option>
            </select>
            <select id="coop-stage" value={stage} onChange={(e) => setStage(Number(e.target.value))} className="rounded-full px-3 py-2 font-black border-4 border-white shadow">
              {STAGES.map((s) => <option key={s.id} value={s.id} disabled={!stageUnlocked(s.id, prog.cleared)}>{s.label} {s.nameZh}</option>)}
            </select>
            <button id="coop-start-adventure" disabled={net.status !== 'ready'} className="soft-btn bg-lemon" onClick={() => hostStart('adventure', stage)}>🍬 冒险 START</button>
          </div>
        </div>)}
      {sub === 'join' && (
        <div className="soft-card p-5 flex flex-col items-center gap-3 min-w-[620px]">
          {net.status !== 'ready' ? (<>
            <div className="flex gap-2 items-center">
              <input id="coop-code-input" value={codeIn} maxLength={4} placeholder="ABCD" onChange={(e) => setCodeIn(normCode(e.target.value))} className="px-4 py-2 rounded-full border-4 border-white shadow text-4xl font-black tracking-[0.3em] w-56 text-center text-purple-900" />
              <button id="coop-join-go" disabled={codeIn.length !== 4} className="soft-btn bg-sakura" onClick={() => joinRoom(codeIn, name)}>加入 JOIN</button>
            </div>
            <div className="font-black text-sm">同一服务器上的房间（每 2 秒刷新）</div>
            <div id="coop-rooms" className="flex gap-2 flex-wrap justify-center min-h-[48px]">
              {net.rooms.length === 0 && <span className="font-bold opacity-60">暂无房间 · 请确认房主已创建房间</span>}
              {net.rooms.map((r) => <button key={r.code} id={`coop-room-${r.code}`} disabled={!r.open} className="soft-btn bg-mint !text-lg" onClick={() => joinRoom(r.code, name)}>{r.code} · {r.name} ({r.players}/2)</button>)}
            </div>
          </>) : (<>
            <div id="coop-status" className="font-black">✅ 已加入 {net.partnerName} 的房间 {net.code} · 等待房主开始…</div>
            <div className="font-black text-sm">选择你的角色</div>{charRow}
          </>)}
        </div>)}
      <button id="coop-back" className="soft-btn bg-cream" onClick={back}>← 返回 BACK</button>
    </div>
  );
}

/** partner HP, connection state, revive/downed prompts */
export function CoopHud() {
  const p = useUI((s) => s.partner), hint = useUI((s) => s.hint), downed = useUI((s) => s.downed), rv = useUI((s) => s.reviveFrac), lag = useNet((s) => s.lag), ok = useNet((s) => s.lagOk), role = useNet((s) => s.role);
  const phase = useUI((s) => s.phase);
  if (!p) return null;
  const ch = getCharacter(p.character), pct = Math.max(0, p.hp / p.maxHp);
  return (
    <>
      <div id="partner-hud" className="absolute left-5 top-5 soft-card px-4 py-2 w-64">
        <div className="flex justify-between items-center font-extrabold text-purple-900 text-sm">
          <span className="flex items-center gap-1"><span className="avatar !w-8 !h-8 !text-lg" style={{ background: ch.colors.body }}>{ch.emoji}</span>{p.name}</span>
          <span id="partner-hp">{p.dead ? '💤 倒下' : `${p.hp}/${p.maxHp}`}</span>
        </div>
        <div className="h-3 bg-pink-100 rounded-full overflow-hidden border-2 border-white mt-1"><div className={`h-full rounded-full ${p.dead ? 'bg-gray-400' : pct > 0.35 ? 'bg-candy-mint' : 'bg-candy-berry'}`} style={{ width: `${pct * 100}%` }} /></div>
        {p.dead && p.revive > 0 && <div className="h-1.5 mt-1 bg-white/70 rounded-full overflow-hidden"><div className="h-full bg-candy-pink" style={{ width: `${p.revive * 100}%` }} /></div>}
        {!p.connected && <div className="text-xs font-black text-candy-berry mt-1">⚠ 已断线 DISCONNECTED</div>}
      </div>
      <div id="net-status" className="absolute right-5 top-5 soft-card px-3 py-1 text-xs font-black" style={{ color: ok ? '#2a9d6f' : '#e0457b' }}>
        {ok ? '🟢' : '🔴'} {role === 'host' ? 'HOST' : 'CLIENT'} · {ok ? `${lag} ms` : '连接不稳 LAG'}
      </div>
      {hint && !downed && phase !== 'paused' && <div id="coop-hint" className="absolute left-1/2 bottom-44 -translate-x-1/2 soft-card px-5 py-2 font-black text-purple-900 text-xl">{hint}</div>}
      {downed && (
        <div id="downed" className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0) 30%, rgba(120,40,160,.45))' }}>
          <div className="text-6xl font-black text-white outline-text">倒下了 DOWN!</div>
          <div className="text-xl font-black text-white outline-text">等待队友救援（靠近并按住 E）· 波次清除时也会复活</div>
          <div className="w-72 h-3 bg-white/60 rounded-full overflow-hidden mt-3"><div className="h-full bg-candy-pink" style={{ width: `${rv * 100}%` }} /></div>
        </div>)}
      <div id="partner-tag" className="absolute left-0 top-0 font-black text-sm px-2 py-0.5 rounded-full bg-white/85 text-purple-900 border-2 border-candy-pink pointer-events-none" style={{ display: 'none', whiteSpace: 'nowrap' }}>{p.name}</div>
    </>
  );
}

/** co-op: each player picks their own upgrade (sim keeps running) */
export function CoopUpgrade() {
  const ids = useUI((s) => s.upgradeChoices), reason = useUI((s) => s.upgradeReason), rerolls = useUI((s) => s.upgradeRerolls);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && ids[i]) chooseUpgrade(ids[i]); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [ids]);
  return (
    <div id="coop-upgrade" className="absolute left-1/2 top-24 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
      <div className="text-2xl font-black text-white outline-text">选择你的强化 · 按 1 / 2 / 3（{reason === 'start' ? '开局自选' : reason === 'stage' ? '关卡奖励' : '波次奖励'}）</div>
      <div className="flex gap-3 mt-2">
        {ids.map((id, i) => { const u = getUpgrade(id), r = RARITY[u.rarity]; return (
          <button key={id} id={`upg-${i}`} onClick={() => chooseUpgrade(id)} className="w-44 rounded-2xl p-3 text-left hover:-translate-y-1 transition-transform"
            style={{ background: `linear-gradient(160deg,#fff,${r.color}55)`, border: `4px solid ${r.color}` }}>
            <div className="flex justify-between"><span className="font-black text-purple-900/60">{i + 1}</span><span className="text-3xl">{u.icon}</span></div>
            <div className="font-black text-purple-900">{u.nameZh}</div><div className="text-xs font-bold text-purple-800">{u.desc}</div>
          </button>); })}
      </div>
      <div className="flex gap-2 mt-2">
        <button id="upg-reroll" disabled={rerolls <= 0} onClick={() => chooseUpgrade(OFFER_REROLL)} className="candy-btn bg-candy-mint text-purple-900 text-sm disabled:opacity-40">{rerolls > 0 ? `重随（${rerolls}）` : '已重随'}</button>
        <button id="upg-skip" onClick={() => chooseUpgrade(OFFER_SKIP)} className="candy-btn bg-candy-grape text-white text-sm">跳过</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ minimap
const SIZE = 150, S = SIZE / (H * 2);
const mx = (x: number) => (x + H) * S, my = (z: number) => (z + H) * S;
let bg: HTMLCanvasElement | null = null, bgWorld = '';
function drawBlockBg(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = SIZE; const g = c.getContext('2d')!;
  g.fillStyle = '#7fd08a'; g.fillRect(0, 0, SIZE, SIZE);
  g.fillStyle = '#7b8494'; for (const x of [-12, 12]) g.fillRect(mx(x - 3), 0, 6 * S, SIZE); for (const z of [-24, 24]) g.fillRect(mx(-12), my(z - 3), 24 * S, 6 * S);
  g.fillStyle = '#8fd3ff'; g.fillRect(0, my(RIVER.z - RIVER.half), SIZE, RIVER.half * 2 * S);
  g.fillStyle = '#ffb347'; for (const b of BRIDGES) g.fillRect(mx(b.x - b.half), my(RIVER.z - RIVER.half - 0.3), b.half * 2 * S, (RIVER.half * 2 + 0.6) * S);
  g.fillStyle = '#e9e2cf'; g.beginPath(); g.arc(mx(PLAZA.x), my(PLAZA.z), PLAZA.r * S, 0, 7); g.fill();
  const q: [number, number, string][] = [[-1, -1, '#e53935'], [1, -1, '#1e6fe8'], [-1, 1, '#ffd21f'], [1, 1, '#2fb344']];
  for (const [sx, sz, col] of q) { g.fillStyle = col; g.fillRect(mx(sx * 4.4 - 3.8), my(sz * 4.4 - 3.8), 7.6 * S, 7.6 * S); }
  for (const b of BLOCKS) { if (b.kind === 'wall') continue; g.fillStyle = b.color; g.fillRect(mx(b.pos[0] - b.size[0] / 2), my(b.pos[2] - b.size[2] / 2), Math.max(1.5, b.size[0] * S), Math.max(1.5, b.size[2] * S)); }
  const tr = MECH.def.train; if (tr) { g.strokeStyle = '#444'; g.lineWidth = 1; g.beginPath(); tr.path.forEach((pt, i) => (i ? g.lineTo(mx(pt[0]), my(pt[1])) : g.moveTo(mx(pt[0]), my(pt[1])))); g.closePath(); g.stroke(); }
  for (const p of MECH.def.portals) for (const pt of [p.a, p.b]) { g.fillStyle = p.color; g.beginPath(); g.arc(mx(pt[0]), my(pt[1]), 3, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
  return c;
}
function drawBg(): HTMLCanvasElement {
  if (bg && bgWorld === currentWorld) return bg;
  bgWorld = currentWorld;
  if (currentWorld === 'block') { bg = drawBlockBg(); return bg; }
  const c = document.createElement('canvas'); c.width = c.height = SIZE; const g = c.getContext('2d')!;
  g.fillStyle = '#bff0c8'; g.fillRect(0, 0, SIZE, SIZE);
  g.fillStyle = '#9fdc9a'; g.fillRect(mx(FOREST.x0), my(FOREST.z0), (FOREST.x1 - FOREST.x0) * S, (FOREST.z1 - FOREST.z0) * S);
  g.fillStyle = '#f5d9b0'; g.fillRect(mx(VILLAGE.x0), my(VILLAGE.z0), (VILLAGE.x1 - VILLAGE.x0) * S, (VILLAGE.z1 - VILLAGE.z0) * S);
  g.fillStyle = '#ffd1ec'; for (const d of DOMES) { g.beginPath(); g.arc(mx(d.x), my(d.z), d.r * S, 0, 7); g.fill(); }
  g.fillStyle = '#8fd3ff'; g.fillRect(0, my(RIVER.z - RIVER.half), SIZE, RIVER.half * 2 * S);
  g.fillStyle = '#d9a066'; for (const b of BRIDGES) g.fillRect(mx(b.x - b.half), my(RIVER.z - RIVER.half - 0.3), b.half * 2 * S, (RIVER.half * 2 + 0.6) * S);
  g.fillStyle = '#fff3a0'; g.beginPath(); g.arc(mx(PLAZA.x), my(PLAZA.z), PLAZA.r * S, 0, 7); g.fill();
  g.strokeStyle = '#ff9ec7'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(120,70,60,.75)'; for (const h of HOUSES) g.fillRect(mx(h.x - h.w / 2), my(h.z - h.d / 2), h.w * S, h.d * S);
  g.fillStyle = 'rgba(160,110,150,.6)'; for (const b of BLOCKS) { if (b.kind === 'fountain' || b.kind === 'rail' || b.kind === 'wall') continue; g.fillRect(mx(b.pos[0] - b.size[0] / 2), my(b.pos[2] - b.size[2] / 2), Math.max(1, b.size[0] * S), Math.max(1, b.size[2] * S)); }
  bg = c; return c;
}
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const g = cv.getContext('2d')!; let id = 0, last = 0;
    const draw = (t: number) => {
      id = requestAnimationFrame(draw); if (t - last < 66) return; last = t;
      g.clearRect(0, 0, SIZE, SIZE); g.save(); g.beginPath(); g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, 7); g.clip();
      g.drawImage(drawBg(), 0, 0);
      for (const p of world.pickups.items) if (p.active) { const pu = 3.5 + Math.sin(t / 180 + p.pos.x) * 0.9; g.fillStyle = p.kind === 'hp' ? '#ff4d7a' : '#ffd84d'; g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.arc(mx(p.pos.x), my(p.pos.z), pu, 0, 7); g.fill(); g.stroke(); }
      const tr = MECH.train; if (tr && currentWorld === 'block') { g.fillStyle = '#c62828'; for (let i = 0; i < tr.def.cars; i++) { const pp = carPose(tr.def, tr, i, world.time); g.fillRect(mx(pp.x) - 2, my(pp.z) - 2, 4, 4); } }
      for (const e of world.enemies.items) if (e.active && !e.dead) { const boss = e.type === 'king' || e.type === 'mega' || e.type === 'colossus'; g.fillStyle = boss ? '#b3005a' : '#e0301e'; g.beginPath(); g.arc(mx(e.pos.x), my(e.pos.z), boss ? 4 : 2, 0, 7); g.fill(); }
      world.slots.forEach((sl, i) => {
        if (i !== world.local && sl.connected === false) return;
        const p = sl.player, me = i === world.local; g.save(); g.translate(mx(p.pos.x), my(p.pos.z));
        if (me) { const f = world.cam.fwd; g.rotate(Math.atan2(f.z, f.x)); } else g.rotate(Math.atan2(Math.cos(p.yaw) * -1, Math.sin(p.yaw) * -1));
        g.fillStyle = p.dead ? '#999' : me ? '#ffffff' : '#7a5cff'; g.strokeStyle = me ? '#e0457b' : '#fff'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, 4); g.lineTo(-2, 0); g.lineTo(-4, -4); g.closePath(); g.fill(); g.stroke(); g.restore();
      });
      g.restore();
    };
    id = requestAnimationFrame(draw); return () => cancelAnimationFrame(id);
  }, []);
  return <canvas id="minimap" ref={ref} width={SIZE} height={SIZE} className="absolute right-5 top-14 rounded-full border-4 border-white shadow-xl bg-white/50" />;
}
