import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 開發時把 Socket.IO 與健康檢查轉發到後端，讓前端始終使用同源連線
      '/socket.io': { target: backend, ws: true, changeOrigin: true },
      '/health': { target: backend, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
