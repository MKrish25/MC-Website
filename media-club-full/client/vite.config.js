import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the Express API runs on :3000 (npm start in the repo root).
// Build: `npm run build` emits dist/, served by Express in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
