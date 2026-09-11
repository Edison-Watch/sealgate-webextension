import { afterEach, describe, expect, it, vi } from 'vitest';
import { readToolCallsFromButton, updateSeenCalls } from './detector';
import type { ToolCallRecord } from '../shared/tracker';

function toolResult(id: string, requestId: string, toolName: string) {
  return {
    id,
    author: { role: 'tool', name: 'api_tool.call_tool' },
    metadata: {
      request_id: requestId,
      invoked_resource: {
        app_name: 'microsoft-learn',
        resource_uri: `/asdk_app_1/link_1/${toolName}`,
        description: 'private response text',
      },
    },
  };
}

function toolRequest(id: string, requestId: string) {
  return {
    id,
    recipient: 'api_tool.call_tool',
    metadata: {
      request_id: requestId,
      connector_tool_payload: '{private request}',
    },
  };
}

function renderToolButton(props: {
  messages: unknown[];
  allMessages?: unknown[];
}): HTMLButtonElement {
  document.body.innerHTML = `
    <section data-turn="assistant" data-turn-id="request-conversation-1-0">
      <span class="group/tool-message">
        <button aria-label="Open tool call list" data-state="closed"></button>
      </span>
    </section>
  `;
  const button = document.querySelector<HTMLButtonElement>('button');
  if (!button) {
    throw new Error('Expected the fixture button.');
  }

  const turnFiber = props.allMessages
    ? { memoizedProps: { allMessages: props.allMessages }, return: null }
    : null;
  Object.defineProperty(button, '__reactFiber$test', {
    configurable: true,
    value: {
      memoizedProps: {},
      return: {
        memoizedProps: { messages: props.messages },
        return: turnFiber,
      },
    },
  });
  return button;
}

const now = () => new Date('2026-09-11T12:00:00.000Z');

describe('ChatGPT tool call detector', () => {
  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('reads every tool call in the turn without clicking or reading payloads', () => {
    window.history.replaceState({}, '', '/c/conversation-1');
    const button = renderToolButton({
      messages: [
        toolRequest('call-2', 'live-1'),
        toolResult('result-2', 'live-1', 'microsoft_docs_fetch'),
      ],
      allMessages: [
        { id: 'user-1', metadata: { request_id: 'live-1' } },
        toolRequest('call-1', 'live-1'),
        toolResult('result-1', 'live-1', 'microsoft_docs_search'),
        toolRequest('call-2', 'live-1'),
        toolResult('result-2', 'live-1', 'microsoft_docs_fetch'),
      ],
    });
    const click = vi.spyOn(button, 'click');

    const calls = readToolCallsFromButton(button, new Set(['live-1']), now);

    expect(click).not.toHaveBeenCalled();
    expect(calls).toEqual([
      {
        id: 'result-1',
        conversationId: 'conversation-1',
        turnId: 'request-conversation-1-0',
        appName: 'microsoft-learn',
        toolName: 'microsoft_docs_search',
        toolIndex: 1,
        detectedAt: '2026-09-11T12:00:00.000Z',
      },
      {
        id: 'result-2',
        conversationId: 'conversation-1',
        turnId: 'request-conversation-1-0',
        appName: 'microsoft-learn',
        toolName: 'microsoft_docs_fetch',
        toolIndex: 2,
        detectedAt: '2026-09-11T12:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(calls)).not.toContain('private');
  });

  it('ignores tool calls produced by requests not observed live', () => {
    const button = renderToolButton({
      messages: [],
      allMessages: [
        toolResult('history-result', 'old-request', 'microsoft_docs_search'),
        toolResult('unstamped-result', '', 'microsoft_docs_search'),
        toolResult('live-result', 'live-1', 'microsoft_docs_fetch'),
      ],
    });

    expect(readToolCallsFromButton(button, new Set(), now)).toEqual([]);
    expect(
      readToolCallsFromButton(button, new Set(['live-1']), now).map(
        (call) => call.id,
      ),
    ).toEqual(['live-result']);
  });

  it('falls back to the nearest messages prop when allMessages is absent', () => {
    const button = renderToolButton({
      messages: [toolResult('result-1', 'live-1', 'microsoft_docs_search')],
    });

    expect(
      readToolCallsFromButton(button, new Set(['live-1']), now).map(
        (call) => call.toolName,
      ),
    ).toEqual(['microsoft_docs_search']);
  });

  it('uses existing calls as a baseline and emits only later calls', () => {
    const existingCall: ToolCallRecord = {
      id: 'result-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      appName: 'microsoft-learn',
      toolName: 'microsoft_docs_search',
      toolIndex: 1,
      detectedAt: '2026-09-11T12:00:00.000Z',
    };
    const newCall: ToolCallRecord = {
      ...existingCall,
      id: 'result-2',
      toolName: 'microsoft_docs_fetch',
      toolIndex: 2,
    };
    const seenCallIds = new Set<string>();

    expect(updateSeenCalls(seenCallIds, [existingCall], false)).toEqual([]);
    expect(updateSeenCalls(seenCallIds, [existingCall], true)).toEqual([]);
    expect(updateSeenCalls(seenCallIds, [existingCall, newCall], true)).toEqual(
      [newCall],
    );
  });
});
