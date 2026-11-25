/**
 * P0-1 Capacitor native bridge (Android packaging only).
 * No gameplay/combat/network changes — wires OS back button + background save flush.
 * Safe no-op on plain web.
 */
import { Capacitor } from '@capacitor/core';

let started = false;

export function isNativeAndroid(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
}

/** Call once at boot (main.tsx). Idempotent. */
export async function initNativeBridge(): Promise<void> {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  try {
    const { App } = await import('@capacitor/app');
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // Hide splash once the JS shell is up (launchAutoHide also covers cold start).
    try { await SplashScreen.hide(); } catch { /* splash plugin optional at runtime */ }

    await App.addListener('backButton', ({ canGoBack }) => {
      // Dynamic import keeps web bundles free of circular store init during SSR/tests.
      void handleBack(canGoBack);
    });

    await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) flushSave('background');
      // Resume: WebView + localStorage should still be intact; we do NOT wipe or reset the run.
      // If the WebView was killed by the OS, Capacitor cold-starts the app (expected black frame → splash → menu).
    });

    // Best-effort flush before process death
    await App.addListener('pause', () => flushSave('pause'));
  } catch (e) {
    console.warn('[native] bridge init skipped', e);
  }
}

async function handleBack(_canGoBack: boolean) {
  const { useUI } = await import('../app/store');
  const { pauseGame, toMenu } = await import('../app/actions');
  const { App } = await import('@capacitor/app');
  const ph = useUI.getState().phase;
  if (ph === 'playing') {
    pauseGame();
    return;
  }
  if (ph === 'menu') {
    try { await App.exitApp(); } catch { /* web */ }
    return;
  }
  // paused / results / upgrade / won / lost: return to main menu (do not exit yet)
  if (ph === 'paused' || ph === 'results' || ph === 'upgrade' || ph === 'won' || ph === 'lost') {
    toMenu();
  }
}

function flushSave(reason: string) {
  // Persist settings/progress already kept in zustand → localStorage; force a write on background.
  // Never clear or migrate-destructive here — background must not wipe saves.
  void import('../app/store').then(({ useUI }) => {
    try {
      useUI.getState().persist();
      console.debug('[native] save flushed on', reason);
    } catch { /* quota / private mode */ }
  });
}
