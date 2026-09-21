import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  // Astro otherwise inlines small standalone scripts, which the production
  // Caddy policy deliberately forbids. Keep all executable assets external.
  vite: { build: { assetsInlineLimit: 0 } },
});
