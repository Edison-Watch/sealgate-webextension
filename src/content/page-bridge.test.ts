import { afterEach, describe, expect, it } from 'vitest';
import type { ToolCallRecord } from '../shared/tracker';
import type { ContentSite } from '../sites/types';
import { mainWorldContentSite, startMainWorldScanning } from './page-bridge';

const call: ToolCallRecord = {
  site: 'claude',
  id: 'toolu_1',
  conversationId: 'conversation-1',
  turnId: 'assistant-1',
  appName: 'microsoft-learn',
  toolName: 'microsoft_docs_search',
  toolIndex: 1,
  detectedAt: '2026-09-21T12:00:00.000Z',
};

function fixtureSite(): ContentSite {
  return {
    id: 'claude',
    origin: 'https://claude.ai',
    turnSelector: '[data-testid="transcript-row"]',
    readToolCalls(_turn, liveIds) {
      return liveIds.has('assistant-1') ? [call] : [];
    },
  };
}

describe('main-world content bridge', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('returns sanitized calls from the page-world detector', async () => {
    document.body.innerHTML = '<div data-testid="transcript-row"></div>';
    const turn = document.querySelector<HTMLElement>(
      '[data-testid="transcript-row"]',
    );
    if (!turn) {
      throw new Error('Expected the fixture turn.');
    }

    const stop = startMainWorldScanning(fixtureSite());
    const calls = await mainWorldContentSite(fixtureSite()).readToolCalls(
      turn,
      new Set(['assistant-1']),
    );
    stop();

    expect(calls).toEqual([call]);
  });

  it('does not return calls for a non-live message', async () => {
    document.body.innerHTML = '<div data-testid="transcript-row"></div>';
    const turn = document.querySelector<HTMLElement>(
      '[data-testid="transcript-row"]',
    );
    if (!turn) {
      throw new Error('Expected the fixture turn.');
    }

    const stop = startMainWorldScanning(fixtureSite());
    const calls = await mainWorldContentSite(fixtureSite()).readToolCalls(
      turn,
      new Set(),
    );
    stop();

    expect(calls).toEqual([]);
  });
});
