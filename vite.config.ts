import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import type { BuildEnvironmentOptions } from 'vite';
import { defineConfig } from 'vitest/config';

const extensionBuild: BuildEnvironmentOptions = {
  emptyOutDir: true,
  rollupOptions: {
    input: {
      popup: 'popup.html',
      background: 'src/background/main.ts',
    },
    output: {
      entryFileNames: 'assets/[name].js',
    },
  },
};

// Content scripts load as classic scripts and cannot import shared chunks, so
// `--mode content` bundles the content script on its own as a single IIFE.
const contentBuild: BuildEnvironmentOptions = {
  emptyOutDir: false,
  rollupOptions: {
    input: { content: 'src/content/main.ts' },
    output: {
      entryFileNames: 'assets/[name].js',
      format: 'iife',
    },
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [svelte(), svelteTesting()],
  build: mode === 'content' ? contentBuild : extensionBuild,
  test: {
    environment: 'jsdom',
  },
}));
