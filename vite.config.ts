import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    {
      name: 'post-build-php',
      closeBundle() {
        // After build, copy index.html to index.php so LiteSpeed serves it via PHP
        const distDir = join(__dirname, 'dist');
        const indexHtml = join(distDir, 'index.html');
        const indexPhp = join(distDir, 'index.php');
        // index.php just needs to be identical to index.html — LiteSpeed will serve it as PHP
        copyFileSync(indexHtml, indexPhp);
      }
    }
  ],
  optimizeDeps: {
    exclude: [],
  },
  build: {
    rollupOptions: {
      output: {},
    },
  },
});
