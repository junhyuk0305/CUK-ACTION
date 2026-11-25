import { defineConfig } from 'vite';

export default defineConfig(({mode}) => ({
  // Test accounts exist only in the browser-check modes; `npm run dev` and production use real accounts.
  define: { __DEMO__: JSON.stringify(mode === 'validation' || mode === 'check') },
  // Keep repeated builds working when Windows prevents directory removal.
  build: { emptyOutDir: false, rollupOptions: {input: ['index.html','account.html']} },
}));
