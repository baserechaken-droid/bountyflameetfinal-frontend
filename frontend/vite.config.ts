import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, host: true, open: true,
    proxy: { '/socket.io': { target: 'http://localhost:3001', changeOrigin: true, ws: true } },
  },
  preview: { port: 4173, host: true },
  build: {
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) return 'firebase';
          if (id.includes('node_modules/socket.io-client/') || id.includes('node_modules/engine.io-client/')) return 'socket';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') || id.includes('node_modules/scheduler/')) return 'react-core';
          if (id.includes('node_modules/lucide-react/')) return 'icons';
          if (id.includes('node_modules/@vercel/analytics/')) return 'analytics';
          if (id.includes('node_modules/')) return 'vendor';
        },
      },
    },
  },
});
