import { defineConfig } from 'vite';

export default defineConfig(({mode}) => ({
  define: { __DEMO__: JSON.stringify(mode !== 'production') },
  // Keep repeated builds working when Windows prevents directory removal.
  build: { emptyOutDir: false, rollupOptions: {input: ['index.html','account.html']} },
}));
