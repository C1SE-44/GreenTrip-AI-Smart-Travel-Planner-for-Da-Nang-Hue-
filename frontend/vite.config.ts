import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

import fs from 'node:fs';

const parentEnvPath = fileURLToPath(new URL('../.env', import.meta.url));
const envDir = fs.existsSync(parentEnvPath) ? '../' : '.';

// https://vitejs.dev/config/
export default defineConfig({
  envDir,
  cacheDir: 'node_modules/.vite-greentrip',
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react-leaflet', '@react-leaflet/core', 'leaflet'],
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});

