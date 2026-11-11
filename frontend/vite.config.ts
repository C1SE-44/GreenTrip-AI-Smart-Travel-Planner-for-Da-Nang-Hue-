import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

import fs from 'node:fs';

const parentEnvPath = fileURLToPath(new URL('../.env', import.meta.url));
const envDir = fs.existsSync(parentEnvPath) ? '../' : '.';
const frontendRoot = fileURLToPath(new URL('.', import.meta.url));
const phosphorIconsRoot = fs.realpathSync(
  fileURLToPath(new URL('./node_modules/@phosphor-icons/web', import.meta.url)),
);

// https://vitejs.dev/config/
export default defineConfig({
  envDir,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: {
      allow: [frontendRoot, phosphorIconsRoot],
    },
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

