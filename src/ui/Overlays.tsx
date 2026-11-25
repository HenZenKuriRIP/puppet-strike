import { startGame, resumeGame, toMenu } from '../app/actions';
import { useUI } from '../app/store';
import { SettingsPanel } from './Settings';

export function PauseMenu() {
  const coop = useUI((s) => s.coop);
  return (
    <div className="ui-screen menu-overlay pause-overlay">
      <div className="ui-sheet-inline pause-panel panel">
        <div className="menu-title font-black text-white outline-text text-center">暂停</div>
        {coop && <div className="menu-sub font-black text-candy-berry text-center">联机中：不会为你暂停</div>}
        <div className="ui-sheet-body">
          <SettingsPanel />
        </div>
        <div className="flex gap-2 flex-wrap justify-center mt-2">
          <button className="candy-btn bg-candy-pink text-white" onClick={resumeGame}>继续</button>
          {!coop && <button className="candy-btn bg-candy-mint text-purple-900" onClick={startGame}>重开</button>}
          <button className="candy-btn bg-candy-grape text-white" onClick={toMenu}>菜单</button>
        </div>
      </div>
    </div>
  );
}

export function EndScreen({ won }: { won: boolean }) {
  const score = useUI((s) => s.score), wave = useUI((s) => s.wave);
  return (
    <div className={`ui-screen menu-overlay ${won ? 'bg-yellow-100/50' : 'bg-purple-900/40'} backdrop-blur-sm`}>
      <div className="ui-sheet-inline panel flex flex-col items-center gap-3">
        <div className="menu-title font-black text-white outline-text">{won ? '胜利！' : '被打败了…'}</div>
        <div className="menu-sub font-bold text-purple-800">{won ? '糖果乐园安全啦 🍭' : `坚持到第 ${wave} 波`}</div>
        <div className="text-2xl font-extrabold text-candy-berry">分数 {score}</div>
        <div className="flex gap-2 flex-wrap justify-center">
          <button id="btn-restart" className="candy-btn bg-candy-pink text-white" onClick={startGame}>再来一局</button>
          <button className="candy-btn bg-candy-grape text-white" onClick={toMenu}>主菜单</button>
        </div>
      </div>
    </div>
  );
}
