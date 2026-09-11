import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Build templates with DOM calls instead of `innerHTML`, which the
    // Firefox add-on linter flags as unsafe.
    fragments: 'tree',
  },
};
