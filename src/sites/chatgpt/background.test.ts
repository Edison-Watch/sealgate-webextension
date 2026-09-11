import { describe, expect, it } from 'vitest';
import { chatgptBackground } from './background';

function details(
  overrides: Partial<chrome.webRequest.OnHeadersReceivedDetails> = {},
): chrome.webRequest.OnHeadersReceivedDetails {
  return {
    requestId: '1132',
    url: 'https://chatgpt.com/backend-api/f/conversation',
    method: 'POST',
    frameId: 0,
    parentFrameId: -1,
    tabId: 7,
    type: 'xmlhttprequest',
    timeStamp: 0,
    statusCode: 200,
    statusLine: 'HTTP/1.1 200 OK',
    responseHeaders: [
      { name: 'content-type', value: 'text/event-stream; charset=utf-8' },
      { name: 'X-OAI-Request-Id', value: '368d2b3b-59d8-47b9' },
    ],
    ...overrides,
  } as chrome.webRequest.OnHeadersReceivedDetails;
}

const liveIdFromResponse = (
  overrides?: Partial<chrome.webRequest.OnHeadersReceivedDetails>,
) => chatgptBackground.liveIdFromResponse?.(details(overrides));

describe('ChatGPT generation request observer', () => {
  it('reads the request ID from a live generation response', () => {
    expect(liveIdFromResponse()).toBe('368d2b3b-59d8-47b9');
  });

  it.each([
    [
      'the prepare endpoint',
      { url: 'https://chatgpt.com/backend-api/f/conversation/prepare' },
    ],
    [
      'conversation init',
      { url: 'https://chatgpt.com/backend-api/conversation/init' },
    ],
    ['a non-POST request', { method: 'GET' }],
    ['a failed request', { statusCode: 429 }],
    [
      'another origin',
      { url: 'https://example.com/backend-api/f/conversation' },
    ],
    ['a response without a request ID', { responseHeaders: [] }],
  ])('ignores %s', (_label, overrides) => {
    expect(liveIdFromResponse(overrides)).toBeNull();
  });
});
