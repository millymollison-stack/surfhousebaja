import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    https: {
      key: path.resolve(__dirname, 'certs/key.pem'),
      cert: path.resolve(__dirname, 'certs/cert.pem'),
    },
    port: 5174,
    host: true,
  },
});
