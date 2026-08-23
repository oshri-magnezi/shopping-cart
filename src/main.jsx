import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

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
