import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, cpus } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
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
        copyFileSync(indexHtml, indexPhp);

        // Write asset manifest so deploy scripts can read actual bundle filenames
        const assetsDir = join(distDir, 'assets');
        const files = readdirSync(assetsDir);
        const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js')) || '';
        const cssFile = files.find(f => f.startsWith('index-') && f.endsWith('.css')) || '';
        const manifest = { js: jsFile, css: cssFile, builtAt: Date.now() };
        writeFileSync(join(distDir, 'assets-manifest.json'), JSON.stringify(manifest, null, 2));
        console.log('[post-build] Asset manifest:', manifest);

        console.log('[post-build] ✅ Manifest written to dist/assets-manifest.json');
        console.log('[post-build] ℹ️  Run `npm run upload-cdn` after build to upload assets to CDN,');
        console.log('[post-build]    or run `npm run build:prod` to build + upload in one step.');
      }
    }
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
