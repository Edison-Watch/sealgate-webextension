import { describe, expect, it } from 'vitest';
import { claudeBackground } from './background';

const completionUrl =
  'https://claude.ai/api/organizations/org-1/chat_conversations/conversation-1/completion';

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function details(
  overrides: Partial<chrome.webRequest.OnBeforeRequestDetails> = {},
  body: unknown = {
    prompt: 'private prompt',
    turn_message_uuids: {
      human_message_uuid: 'human-1',
      assistant_message_uuid: 'assistant-1',
    },
  },
): chrome.webRequest.OnBeforeRequestDetails {
  return {
    requestId: '639',
    url: completionUrl,
    method: 'POST',
    frameId: 0,
    parentFrameId: -1,
    tabId: 7,
    type: 'xmlhttprequest',
    timeStamp: 0,
    requestBody: { raw: [{ bytes: bytes(JSON.stringify(body)) }] },
    ...overrides,
  } as chrome.webRequest.OnBeforeRequestDetails;
}

const liveIdFromRequest = (
  ...args: Parameters<typeof details>
): string | null | undefined =>
  claudeBackground.liveIdFromRequest?.(details(...args));

describe('Claude generation request observer', () => {
  it('reads the answer message UUID from a completion request', () => {
    expect(liveIdFromRequest()).toBe('assistant-1');
  });

  it('reads a retried completion and a body split across chunks', () => {
    const text = JSON.stringify({
      turn_message_uuids: { assistant_message_uuid: 'assistant-2' },
    });

    expect(
      liveIdFromRequest({
        url: completionUrl.replace('/completion', '/retry_completion'),
        requestBody: {
          raw: [
            { bytes: bytes(text.slice(0, 9)) },
            { bytes: bytes(text.slice(9)) },
          ],
        },
      }),
    ).toBe('assistant-2');
  });

  it.each([
    [
      'another endpoint',
      {
        url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conversation-1/title',
      },
    ],
    ['a non-POST request', { method: 'GET' }],
    [
      'another origin',
      { url: completionUrl.replace('claude.ai', 'example.com') },
    ],
    ['a request without a body', { requestBody: undefined }],
    [
      'a body that is not JSON',
      { requestBody: { raw: [{ bytes: bytes('{') }] } },
    ],
  ])('ignores %s', (_label, overrides) => {
    expect(liveIdFromRequest(overrides)).toBeNull();
  });

  it('ignores a request without an answer message UUID', () => {
    expect(liveIdFromRequest({}, { prompt: 'hello' })).toBeNull();
  });
});
