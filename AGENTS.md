# Sealgate Extension MVP agent guide

## Working agreement

- Keep this as a Chrome Manifest V3 extension built with TypeScript and Svelte.
- Make the smallest change that satisfies the task. Do not add extension permissions unless the feature requires them.
- Run `npm run verify` after changing source, tests, build configuration, or the manifest.
- Treat `dist/` as generated output. Build it with `npm run build`; do not edit it directly.
- Keep formatting compatible with Prettier and static analysis compatible with ESLint and `svelte-check`.

## Browser testing

- Use only the project-scoped `chrome_devtools` MCP server for extension testing. Never attach to or manipulate the user's normal Chrome session or profile.
- The launcher prefers the Chrome-for-Testing binary installed under `.chrome-for-testing/`. Its persistent test-only profile is `.chrome-profile/`; both directories are disposable and ignored by Git.
- Before installing or reloading the extension, run `npm run build`.
- Install the unpacked extension from the absolute path `/Users/iliamanolov/Development/git/sealgate_extension_mvp/dist`.
- Installing, reloading, triggering, and uninstalling this WIP extension in the dedicated test browser are authorized parts of the development workflow.
- After UI changes, trigger the extension action, inspect the popup, exercise its controls, and check the popup page for console errors.
- For this baseline popup, verify the text `Hooray, the extension works!` and verify that clicking `Close` closes the popup.

## Useful commands

- `npm run dev` — start Vite for ordinary UI development.
- `npm run build` — generate the unpacked extension in `dist/`.
- `npm test` — run Vitest once.
- `npm run verify` — formatting, lint, Svelte/TypeScript checks, tests, and build.
- `npm run browser:install` — install a repo-local Chrome-for-Testing build.
