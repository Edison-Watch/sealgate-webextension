import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        background: 'src/background/main.ts',
        content: 'src/content/main.ts',
      },
      output: {
        entryFileNames: 'assets/[name].js',
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
