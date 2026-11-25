import type { CapacitorConfig } from '@capacitor/cli';

/**
 * P0-1 Android packaging config.
 * webDir must match Vite outDir (`dist`). Do not put secrets here.
 * Deep-link / navigation allowlist: keep empty until a real HTTPS origin is chosen;
 * never commit production domains casually — see docs/P0_1_STATUS.md.
 */
const config: CapacitorConfig = {
  appId: 'com.puppetstrike.toybox',
  appName: 'Puppet Strike',
  webDir: 'dist',
  server: {
    // Capacitor Android serves the bundled web assets; androidScheme https avoids cleartext quirks.
    androidScheme: 'https',
    // allowNavigation: []  // add only trusted https origins if you later load remote pages
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#ffb3d1',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    App: {
      // back button handled in src/native/androidBridge.ts
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#ffb3d1',
  },
};

export default config;
