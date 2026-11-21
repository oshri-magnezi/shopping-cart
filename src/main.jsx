import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

// A phone with little memory pays for every blurred surface on every frame.
// Those get the same glass without the blur (glass.css reads data-perf) — the
// look holds, the scrolling stays smooth. Only where the browser reports its
// memory, which is Android; an iPhone composites blur natively and keeps it.
if (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 2) {
  document.documentElement.dataset.perf = 'lite';
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Production only. In development the worker would serve cached assets over
// Vite's, and every edit would appear not to take.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      // Registration failing costs nothing but offline support, so it must
      // never surface as an error to someone doing their shopping.
      .catch(() => {});
  });
}
