import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { loadBrandColor } from './lib/brandColor';
import './index.css';
import './components/sidebar.css';
import './components/Editmode.css';

// ── Hybrid mode: only mount React if #root exists ──────────────────────
// In the static HTML template, #root does NOT exist, so React stays dormant.
// It is loaded on demand via window.__LOAD_REACT__() triggered by ?book=true or ?admin=true.
const rootEl = document.getElementById('root');
if (!rootEl) {
  console.log('[main] No #root — React staying dormant (hybrid static mode)');
} else {
  loadBrandColor();
  createRoot(rootEl).render(<App />);
}
