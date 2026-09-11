# Claude Code guide

The working agreement, browser-testing rules, and command list live in `AGENTS.md`,
which is the single source of truth for every agent working in this repository.

@AGENTS.md

## Claude-specific notes

- The Chrome and Firefox DevTools MCP servers are registered in `.mcp.json` as
  `chrome_devtools` and `firefox_devtools`; their tools appear as
  `mcp__chrome_devtools__*` and `mcp__firefox_devtools__*`. Use only those tools for
  browser work.
- Project permissions live in `.claude/settings.json`. The npm scripts below and the
  project browser tools are pre-approved; `dist/` is write-denied because it is generated
  output.
- `npm run verify` is the completion gate. Do not report source, test, build-config, or
  manifest changes as done until it passes, and quote the failure if it does not.
- To resolve the unpacked-extension path, run `git rev-parse --show-toplevel` and append
  `/dist`. Never hard-code a machine-specific path.
