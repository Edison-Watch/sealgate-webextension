# Sealgate Tool Tracker

A Chrome Manifest V3 extension built with TypeScript, Svelte, Vite, ESLint, Prettier, and Vitest, with isolated Chrome and Firefox test browsers.

The extension watches ChatGPT and Claude conversations for MCP and app tool calls. Its popup lists each detected app, tool, and site, can pause or resume listening, and can clear the list. It records only calls made by answers generated in the tab while the extension is running; calls already in a conversation's history are ignored.

To tell the two apart, the background script watches each site's answer requests with non-blocking `webRequest` listeners, and the content script accepts a tool call only when its message carries an ID seen in that tab:

- ChatGPT: the `x-oai-request-id` response header of `POST /backend-api/f/conversation`, which ChatGPT stamps on every message the request produces.
- Claude: `turn_message_uuids.assistant_message_uuid` in the body of `POST …/chat_conversations/<id>/completion` or `…/retry_completion`, which becomes the answer's message UUID. No other field of the body is read.

The detectors read each site's rendered React data without clicking controls, expanding panels, or reading tool payloads, and the extension never blocks or changes a request. On Claude, only `tool_use` blocks with an MCP server URL and a matching result are recorded, so built-in tools such as web search are skipped. If the page is reloaded while an answer is still streaming, calls that finish after the reload are not recorded.

Records use `storage.session`, so they stay in browser memory only and are cleared when the browser or extension session ends (calls waiting to be exported are the exception; see Reporting). Each recording also logs one `[Sealgate] Recorded …; N calls stored.` line to the tab's console, so tracking can be checked without opening the popup.

## Reporting

The extension can report every call it records, as OpenTelemetry spans over OTLP/HTTP JSON. On install it opens its page in a tab so the user can pick a destination; the popup offers the same choices:

- **Log in to Sealgate** signs in to the official instance (`VITE_SEALGATE_URL` at build time, `https://dashboard.sealgate.ai` by default). **Use a self-hosted Sealgate** does the same for any other instance. Both run OAuth 2.1 with PKCE through `identity.launchWebAuthFlow`: the extension registers itself with the instance (dynamic client registration, using the browser's extension redirect URL) and asks for the `telemetry` scope, which lets it report calls but not use the MCP gateway. Calls go to `<instance>/otlp/v1/traces` and appear in the dashboard's Web Agents tab.
- **Use an OpenTelemetry endpoint** sends to any OTLP/HTTP receiver, with optional headers. The extension then asks for access to that host, so the export does not depend on the collector's CORS settings.

Each call is one span named `execute_tool <tool>` with the GenAI attributes `gen_ai.tool.name` and `gen_ai.conversation.id`, plus `sealgate.web_agent.*` for the site, app, call and turn. All calls of a conversation share a trace, and IDs are derived from the call, so a retried export can be deduplicated. Calls already recorded when a destination is chosen are sent too. Calls that fail to send stay queued in `storage.local` (up to 1,000) and are retried every minute. Tokens and headers are stored in `storage.local` and never shown to the popup.

## Site adapters

Each supported site lives under `src/sites/<site>/` as two adapters, defined in `src/sites/types.ts`:

- `background.ts` recognises the request that generates a new answer and returns the live ID its messages will carry, from the request (`liveIdFromRequest`) or the response (`liveIdFromResponse`).
- `content.ts` names the element that holds one rendered turn and reads the turn's tool calls, keeping only those whose live ID was observed in the tab.

`src/background/live.ts` and `src/content/runtime.ts` supply everything else: passive request observation, messaging, change tracking, deduplication, and pause handling. To add a site, write both adapters, register them in `src/sites/background.ts` and `src/sites/content.ts`, and add the site's origin to `host_permissions` and the content-script `matches` in `public/manifest.json`. A test fails if the manifest entries are missing.

Content scripts cannot import shared chunks, so `npm run build` bundles the content script in a second pass as a single self-contained file.

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
