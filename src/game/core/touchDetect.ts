/** Prefer on-screen touch controls (Capacitor Android / coarse pointer). Desktop e2e stays mouse/keyboard. */
export function preferTouchControls(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const Cap = (window as any).Capacitor;
    if (Cap?.isNativePlatform?.()) return true;
  } catch { /* */ }
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  } catch { /* */ }
  return false;
}

export function isCoarsePointer(): boolean {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
}
