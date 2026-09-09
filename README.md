# Sealgate Extension MVP

A minimal Chrome Manifest V3 extension built with TypeScript, Svelte, Vite, ESLint, Prettier, and Vitest.

Clicking the toolbar action opens a small popup that says “Hooray, the extension works!” and provides a Close button.

## Setup

Requirements: Node.js 22.12+, 24+, or 26+ and npm 11 or newer.

```sh
npm install
npm run browser:install
npm run verify
```

`browser:install` downloads Chrome for Testing into `.chrome-for-testing/`. The project-scoped Chrome DevTools MCP launcher uses that binary with the dedicated `.chrome-profile/` profile. Neither directory is committed.

After cloning to a different absolute path, update the launcher path in `.codex/config.toml`. The launcher itself resolves the repository root automatically for the browser profile and MCP filesystem root.

## Development commands

```sh
npm run dev
npm run build
npm test
npm run test:watch
npm run lint
npm run check
npm run format
npm run verify
```

The unpacked extension is emitted to `dist/`.

## Agent-driven Chrome testing

The repository includes:

- `.codex/config.toml`, which registers the project-local Chrome DevTools MCP server.
- `scripts/chrome-devtools-mcp.sh`, which selects Chrome for Testing and isolates its profile from normal Chrome.
- `AGENTS.md`, which records the build and browser-testing workflow for future Codex tasks.

Trust the repository and reload Codex's local tools after dependencies and Chrome for Testing are installed. Codex can then build `dist/`, install or reload it as an unpacked extension, trigger the toolbar action, inspect and operate the popup, and work with test pages in the dedicated browser.
