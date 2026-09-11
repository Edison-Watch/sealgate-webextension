import { describe, expect, it } from 'vitest';
import type { SiteId, ToolCallRecord } from '../shared/tracker';
import { conversationUrl, groupCallsByConversation } from './conversations';

function call(
  id: string,
  conversationId: string | null,
  site: SiteId = 'chatgpt',
): ToolCallRecord {
  return {
    site,
    id,
    conversationId,
    turnId: 'turn-1',
    appName: 'microsoft-learn',
    toolName: 'microsoft_docs_search',
    toolIndex: 1,
    detectedAt: '2026-09-11T12:00:00.000Z',
  };
}

describe('conversation grouping', () => {
  it('groups calls by conversation, latest activity first', () => {
    const groups = groupCallsByConversation([
      call('a1', 'conversation-a'),
      call('b1', 'conversation-b'),
      call('a2', 'conversation-a'),
    ]);

    expect(
      groups.map((group) => [
        group.conversationId,
        group.calls.map((grouped) => grouped.id),
      ]),
    ).toEqual([
      ['conversation-a', ['a2', 'a1']],
      ['conversation-b', ['b1']],
    ]);
  });

  it('keeps sites and unknown conversations apart', () => {
    const groups = groupCallsByConversation([
      call('a1', 'shared-id', 'chatgpt'),
      call('a2', 'shared-id', 'claude'),
      call('a3', null),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      'chatgpt:',
      'claude:shared-id',
      'chatgpt:shared-id',
    ]);
  });

  it('links to the conversation on its site', () => {
    const [chatgpt, claude, unknown] = groupCallsByConversation([
      call('c1', null),
      call('b1', 'conversation-b', 'claude'),
      call('a1', 'conversation-a'),
    ]);

    expect(conversationUrl(chatgpt)).toBe(
      'https://chatgpt.com/c/conversation-a',
    );
    expect(conversationUrl(claude)).toBe(
      'https://claude.ai/chat/conversation-b',
    );
    expect(conversationUrl(unknown)).toBeNull();
  });
});
