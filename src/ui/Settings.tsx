import { Fragment, useState, type ReactNode } from 'react';
import { resetSave } from '../game/progression/save';
import { DEFAULT_SETTINGS } from '../app/store';
import { useUI } from '../app/store';
import { QUALITY, QUALITY_ORDER } from '../config/quality';

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-sec glass-inset">
      <div className="settings-sec-title">{title}</div>
      <div className="settings-sec-body">{children}</div>
    </section>
  );
}

function ToggleRow({ id, label, checked, onChange }: {
  id?: string; label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="settings-row settings-toggle-row">
      <span>{label}</span>
      <span className={`settings-switch ${checked ? 'on' : ''}`}>
        <input id={id} type="checkbox" className="settings-check" checked={checked}
          onChange={(e) => onChange(e.target.checked)} />
        <span className="settings-switch-track" aria-hidden><span className="settings-switch-thumb" /></span>
      </span>
    </label>
  );
}

export function SettingsPanel() {
  const s = useUI((x) => x.settings), set = useUI((x) => x.setSettings);
  return (
    <div className="settings-panel">
      <Sec title="操作 Controls">
        <label className="settings-row settings-range-row">
          <span>音量 Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} className="accent-pink-400 settings-range" onChange={(e) => set({ volume: +e.target.value })} />
        </label>
        <ToggleRow id="music-toggle" label="音乐 Music" checked={s.music !== false} onChange={(v) => set({ music: v })} />
        <label className="settings-row settings-range-row">
          <span>灵敏度 Sens</span>
          <input type="range" min={0.3} max={2.5} step={0.05} value={s.sensitivity} className="accent-pink-400 settings-range" onChange={(e) => set({ sensitivity: +e.target.value })} />
        </label>
        <ToggleRow id="aim-assist-toggle" label="触摸辅助瞄准" checked={!!s.aimAssist} onChange={(v) => set({ aimAssist: v })} />
        <div className="settings-hint">默认关闭 — 开启后仍会在滑动瞄准时自动减弱</div>
      </Sec>
      <Sec title="画面 Display">
        <div className="settings-row settings-q-row">
          <span>画质 Quality</span>
          <div className="settings-qbtns" role="group" aria-label="画质">
            {QUALITY_ORDER.map((q) => (
              <button key={q} type="button" id={`q-${q}`} className={`settings-qbtn ${s.quality === q ? 'on' : ''}`} onClick={() => set({ quality: q })}>{QUALITY[q].label}</button>
            ))}
          </div>
        </div>
        <div className="settings-toggles">
          <label className="settings-tog"><input type="checkbox" className="settings-check" checked={s.shake} onChange={(e) => set({ shake: e.target.checked })} /><span>屏幕震动</span></label>
          <label className="settings-tog"><input type="checkbox" className="settings-check" checked={s.flash} onChange={(e) => set({ flash: e.target.checked })} /><span>闪光效果</span></label>
          <label className="settings-tog"><input type="checkbox" className="settings-check" checked={s.postFX} onChange={(e) => set({ postFX: e.target.checked })} /><span>后处理</span></label>
          <label className="settings-tog"><input type="checkbox" className="settings-check" checked={s.hitStop} onChange={(e) => set({ hitStop: e.target.checked })} /><span>命中停顿</span></label>
          <label className="settings-tog"><input id="funny-fx-toggle" type="checkbox" className="settings-check" checked={s.funnyFx} onChange={(e) => set({ funnyFx: e.target.checked })} /><span>搞笑特效</span></label>
          <label className="settings-tog"><input id="perf-toggle" type="checkbox" className="settings-check" checked={s.perfOverlay} onChange={(e) => set({ perfOverlay: e.target.checked })} /><span>性能面板</span></label>
        </div>
      </Sec>
      <Sec title="存档 Save">
        <ResetSave />
      </Sec>
    </div>
  );
}

function ResetSave() {
  const [ask, setAsk] = useState(false), [done, setDone] = useState(false);
  if (done) return <div className="settings-note ok">✔ 存档已重置</div>;
  return ask ? (
    <div className="settings-reset-ask">
      <span>确定清除进度？</span>
      <button type="button" id="btn-reset-confirm" className="soft-btn bg-sakura settings-mini-btn" onClick={() => { const d = resetSave(); useUI.setState({ save: d, settings: { ...DEFAULT_SETTINGS }, character: 'mochi' }); setDone(true); }}>确定</button>
      <button type="button" className="soft-btn bg-cream settings-mini-btn" onClick={() => setAsk(false)}>取消</button>
    </div>
  ) : <button type="button" id="btn-reset-save" className="soft-btn bg-cream settings-mini-btn" onClick={() => setAsk(true)}>🗑 重置存档</button>;
}

export function ControlsList() {
  const rows = [['左摇杆', '移动'], ['右侧滑动', '视角'], ['射击', '开火'], ['◎', '瞄准'], ['🌀', '闪避'], ['技能', '角色技'], ['↺', '换弹'], ['⇄', '切枪'], ['系统返回', '暂停'], ['按住✚', '救援']];
  return (
    <div className="controls-list glass-inset">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <span className="controls-k">{k}</span>
          <span className="controls-v">{v}</span>
        </Fragment>
      ))}
    </div>
  );
}
