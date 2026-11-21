import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';

/**
 * A content security policy for the published site.
 *
 * GitHub Pages cannot send response headers, so it goes in a <meta> tag. It
 * allows exactly what the page uses — its own files and the data: images the
 * stylesheets draw with — and nothing else, so a
 * script that ever found its way into the page could neither load code from
 * elsewhere nor send data anywhere.
 *
 * Build only: the dev server injects inline scripts for hot reloading, which
 * this policy would rightly block.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicy() {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      );
    },
  };
}

/**
 * Tells the service worker which files make up this build, so it can store
 * them all when it installs rather than one at a time as they happen to be
 * requested. The second visit then opens from the device, with or without a
 * network. The names carry content hashes, so they are only known here.
 */
function precacheManifest() {
  let files = [];
  return {
    name: 'precache-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      files = Object.keys(bundle).filter((name) => /\.(js|css)$/.test(name));
    },
    writeBundle({ dir }) {
      const swPath = path.join(dir, 'sw.js');
      const fonts = fs.readdirSync(path.join(dir, 'fonts')).map((name) => `fonts/${name}`);
      const list = JSON.stringify(['./', ...files, ...fonts]);
      const source = fs.readFileSync(swPath, 'utf8');
      if (!source.includes('const PRECACHE = [];')) {
        throw new Error('sw.js has no "const PRECACHE = [];" line to fill in');
      }
      fs.writeFileSync(swPath, source.replace('const PRECACHE = [];', `const PRECACHE = ${list};`));
    },
  };
}

export default defineConfig({
  base: '/shopping-cart/',
  plugins: [react(), contentSecurityPolicy(), precacheManifest()],
  worker: { format: 'es' },
});
