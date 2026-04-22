import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { loadBrandColor } from '../lib/brandColor';
import './index.css';
import '../components/Editmode.css';

loadBrandColor();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
