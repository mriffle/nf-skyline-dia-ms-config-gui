import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The deploy workflow sets APP_VERSION to the release tag name (e.g. "v1.2.3");
// strip the leading 'v' since the UI footer already prepends one. Local builds
// and dev runs fall back to a sentinel so it's obvious the bundle isn't from a
// real release.
const rawVersion = process.env.APP_VERSION ?? '0.0.1-dev';
const appVersion = rawVersion.replace(/^v/, '');

export default defineConfig({
  plugins: [react()],
  base: '/nf-skyline-dia-ms-config-gui/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
