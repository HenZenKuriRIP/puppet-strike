import { useEffect, useState } from 'react';
import { perfStats } from '../game/perf/perfStats';
import { useUI } from '../app/store';

/** Optional FPS / renderer overlay (Settings → 性能面板). Refreshes 4×/s. */
export function PerfOverlay() {
  const on = useUI((s) => s.settings.perfOverlay), q = useUI((s) => s.settings.quality);
  const [, force] = useState(0);
  useEffect(() => { if (!on) return; const id = setInterval(() => force((n) => n + 1), 250); return () => clearInterval(id); }, [on]);
  if (!on) return null;
  const s = perfStats;
  return (
    <div id="perf-overlay" className="pointer-events-none fixed top-2 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-black/70 text-[11px] leading-tight text-lime-200 font-mono px-3 py-1.5 whitespace-pre">
      {`FPS ${s.fps.toFixed(0).padStart(3)}  frame ${s.frameMs.toFixed(1)}ms  sim ${s.simMs.toFixed(2)}ms  [${q}]\n` +
       `draw calls ${s.calls}  tris ${(s.triangles / 1000).toFixed(1)}k  geo ${s.geometries}  tex ${s.textures}  prog ${s.programs}`}
    </div>
  );
}
