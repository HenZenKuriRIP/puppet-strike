import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  // relative base so Capacitor Android can load hashed assets from the WebView
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('rapier')) return 'rapier';
          if (id.includes('postprocessing') || id.includes('n8ao') || id.includes('maath')) return 'post';
          if (id.includes('three-stdlib') || id.includes('@react-three/drei')) return 'drei';
          if (id.includes('/three/')) return 'three';
          if (id.includes('@react-three/fiber')) return 'r3f';
          if (/node_modules\/(react|react-dom|scheduler|zustand)\//.test(id)) return 'react';
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/tests/**/*.test.ts'] },
} as any);
