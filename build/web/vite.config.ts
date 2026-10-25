import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { finalizeShell } from './vite/finalize.ts';

// #skeleton: the static pre-fetch markup a script-throw or JS-disabled
// visitor still sees. #panels: the Preact mount root (sibling of #skeleton,
// never nested).
export default defineConfig({
  root: import.meta.dirname,
  build: {
    target: 'es2022',
    outDir: resolve(import.meta.dirname, '../../modules/status/dist'),
    emptyOutDir: false, // only status.html is written; leave other files in dist alone
    modulePreload: false,
    rollupOptions: { input: resolve(import.meta.dirname, 'status.html') },
  },
  plugins: [viteSingleFile(), finalizeShell({ requiredMarkers: ['id="skeleton"', 'id="panels"'] })],
});
