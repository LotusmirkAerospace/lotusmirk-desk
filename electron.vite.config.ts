import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { DESK_API_PORT, DEV_RENDERER_PORT } from './src/shared/app';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: DEV_RENDERER_PORT,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${DESK_API_PORT}`,
        },
      },
    },
  },
});
