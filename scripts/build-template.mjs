/**
 * Build template app.js — transpiles JSX → plain JS
 * Run: node scripts/build-template.mjs
 * Output: src/public/template/app.js (plain JS, no JSX, no build step needed)
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const babel = require('@babel/core');

const src = readFileSync('./src/public/template/app.js', 'utf8');

const result = babel.transformSync(src, {
  presets: [
    ['@babel/preset-react', { runtime: 'classic' }]
  ],
  filename: 'app.js',
});

if (!result) {
  console.error('Babel transform returned null');
  process.exit(1);
}

writeFileSync('./src/public/template/app.js', result.code);
console.log('✅ Built app.js —', result.code.length, 'bytes (JSX → plain JS)');
console.log('   No Babel standalone needed — runs directly in browser');