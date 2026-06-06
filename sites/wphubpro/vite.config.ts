import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  /**
   * Expose client env: `VITE_*`, canonical `APPWRITE_*` (endpoint, project, database, optional legacy `ADMIN_TEAM_ID`),
   * `STRIPE_*` for publishable key, and `_` for legacy Stripe keys. Avoid reading `APPWRITE_API_KEY` from `src/`.
   */
  envPrefix: ['VITE_', 'APPWRITE_', 'STRIPE_', '_'],
  server: {
    allowedHosts: [
      'app.wphub.pro',
      'localhost',
      'jhb.wphub.pro',
      'code045.wphub.pro',
      'dev.wphub.pro',
    ],
    host: true,
    port: 5173,
    strictPort: false,
    open: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  },
  plugins: [tailwindcss(), react()],
  build: {
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@stripe')) return 'vendor-stripe';
          if (id.includes('appwrite')) return 'vendor-appwrite';
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'vendor-charts';
          if (id.includes('grapesjs')) return 'vendor-grapesjs';
          if (id.includes('quill') || id.includes('react-quill')) return 'vendor-quill';
          if (id.includes('@tanstack')) return 'vendor-tanstack';
          if (id.includes('@dnd-kit')) return 'vendor-dnd';
          if (id.includes('react-select')) return 'vendor-react-select';
          if (id.includes('react-icons')) return 'vendor-icons';
          if (id.includes('react-dom') || id.includes('/scheduler/')) return 'vendor-react';
          if (id.includes('react-router')) return 'vendor-react';
          if (id.includes('node_modules/react/')) return 'vendor-react';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
