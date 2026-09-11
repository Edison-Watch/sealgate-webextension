# Sealgate Extension MVP

A Chrome Manifest V3 extension built with TypeScript, Svelte, Vite, ESLint, Prettier, and Vitest, with isolated Chrome and Firefox test browsers.

Clicking the toolbar action opens a small popup that says “Hooray, the extension works!” and provides a Close button.

## Setup

Requirements: Node.js 22.12+, 24+, or 26+ and npm 11 or newer.

```sh
npm install
npm run browser:install
npm run verify
```

`browser:install` downloads Chrome for Testing into `.chrome-for-testing/`. If a Puppeteer-managed Firefox is already installed, the Firefox launcher reuses that binary; otherwise, `browser:install:firefox` downloads Firefox Developer Edition into `.firefox-for-testing/`. The project-scoped DevTools MCP launchers use dedicated `.chrome-profile/` and `.firefox-profile/` profiles. None of these directories is committed.

The launcher resolves the repository root automatically, so the checkout works at any absolute path without editing agent configuration.

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

## Agent-driven browser testing

The repository is set up for both Codex and Claude Code. Shared pieces:

- `AGENTS.md`, the single source of truth for the build and browser-testing workflow.
- `scripts/chrome-devtools-mcp.sh` and `scripts/firefox-devtools-mcp.sh`, which select the repository-local test browsers and isolate their profiles from normal browser sessions.

Codex-specific:

- `.codex/config.toml`, which registers the project-local Chrome and Firefox DevTools MCP servers.

Claude Code-specific:

- `CLAUDE.md`, which imports `AGENTS.md` and adds the Claude-only details.
- `.mcp.json`, which registers the same MCP servers as `chrome_devtools` and `firefox_devtools`.
- `.claude/settings.json`, which pre-approves the project's npm scripts and browser
  tools and denies writes to the generated `dist/` directory. Per-developer overrides
  belong in the untracked `.claude/settings.local.json`.

Install dependencies and the test browsers, then trust the repository and reload the
agent's local tools. The agent can then build `dist/`, install or reload it as an
unpacked extension, inspect and operate its UI, and work with test pages in either
dedicated browser.
