# Sealgate Extension MVP agent guide

## Working agreement

- Keep this as a Chrome Manifest V3 extension built with TypeScript and Svelte.
- Make the smallest change that satisfies the task. Do not add extension permissions unless the feature requires them.
- Run `npm run verify` after changing source, tests, build configuration, or the manifest.
- Treat `dist/` as generated output. Build it with `npm run build`; do not edit it directly.
- Keep formatting compatible with Prettier and static analysis compatible with ESLint and `svelte-check`.

## Browser testing

- Use the project-scoped `firefox_devtools` MCP server as the primary extension-testing environment. Use `chrome_devtools` only for Chrome compatibility checks or when Firefox cannot exercise the required behavior. Never attach to or manipulate the user's normal browser sessions or profiles.
- The Firefox launcher prefers a Puppeteer-managed Firefox binary and falls back to Firefox Developer Edition under `.firefox-for-testing/`. It launches Firefox with remote control enabled against the persistent test-only `.firefox-profile/` copy; the project profile is disposable and ignored by Git.
- The Chrome launcher prefers the Chrome-for-Testing binary installed under `.chrome-for-testing/`. Its persistent test-only profile is `.chrome-profile/`; both directories are disposable and ignored by Git.
- Before installing or reloading the extension, run `npm run build`.
- Install the unpacked extension from the repository's generated `dist/` directory. Resolve the repository root at runtime, append `/dist`, and pass that absolute path to the relevant browser MCP; never hard-code a machine-specific path.
- Installing, reloading, triggering, and uninstalling this WIP extension in the dedicated test browsers are authorized parts of the development workflow.
- After UI changes, test in Firefox first: trigger the extension action, inspect the popup, exercise its controls, and check the popup page for console errors. Repeat in Chrome only when the change is browser-specific, compatibility-sensitive, or explicitly requested.
- For this baseline popup, verify the text `Hooray, the extension works!` and verify that clicking `Close` closes the popup.
- Firefox's remote protocol cannot open `moz-extension://` pages, so the popup cannot be inspected through `firefox_devtools`. To confirm that tool calls are recorded, trigger one on the site and read the tab's console for the `[Sealgate] Recorded …; N calls stored.` line and for errors. Ask the user to open the popup only when its rendering itself needs checking.

## Useful commands

- `npm run dev` — start Vite for ordinary UI development.
- `npm run build` — generate the unpacked extension in `dist/`.
- `npm test` — run Vitest once.
- `npm run verify` — formatting, lint, Svelte/TypeScript checks, tests, and build.
- `npm run browser:install` — install a repo-local Chrome-for-Testing build.
- `npm run browser:install:chrome` — install only Chrome for Testing.
- `npm run browser:install:firefox` — install only Firefox Developer Edition.
