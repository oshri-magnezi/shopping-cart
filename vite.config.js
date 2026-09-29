import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * A content security policy for the published site.
 *
 * GitHub Pages cannot send response headers, so it goes in a <meta> tag. It
 * allows exactly what the page uses — its own files, Google Fonts, and the
 * data: images the stylesheets draw chevrons with — and nothing else, so a
 * script that ever found its way into the page could neither load code from
 * elsewhere nor send data anywhere.
 *
 * Build only: the dev server injects inline scripts for hot reloading, which
 * this policy would rightly block.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
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

export default defineConfig({
  base: '/shopping-cart/',
  plugins: [react(), contentSecurityPolicy()],
});
