# Sealgate Tool Tracker

A Chrome Manifest V3 extension built with TypeScript, Svelte, Vite, ESLint, Prettier, and Vitest, with isolated Chrome and Firefox test browsers.

The extension watches ChatGPT conversations for MCP and app tool calls. Its popup lists each detected app and tool, can pause or resume listening, and can clear the list. It records only calls made by answers that ChatGPT generates in the tab while the extension is running; calls already in a conversation's history are ignored.

To tell the two apart, the background script watches ChatGPT's answer stream (`POST /backend-api/f/conversation`) with a non-blocking `webRequest` listener and reads the `x-oai-request-id` response header. ChatGPT stamps that ID on every message the request produces, so the content script accepts a tool call only when its message carries an ID seen in that tab. The detector reads ChatGPT's rendered React metadata without clicking controls, expanding panels, or reading tool payloads, and the extension never blocks or changes a request. If the page is reloaded while an answer is still streaming, calls that finish after the reload are not recorded.

Records use `storage.session`, so they stay in browser memory only and are cleared when the browser or extension session ends.

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
