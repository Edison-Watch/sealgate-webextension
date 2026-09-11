import { describe, expect, it, vi } from 'vitest';
import type { BackgroundSite } from '../sites/types';
import { observeLiveGenerations, type WebRequestEvents } from './live';

type Listener = (details: unknown) => unknown;

function fakeWebRequest() {
  const onBeforeRequest = vi.fn<(...args: unknown[]) => void>();
  const onHeadersReceived = vi.fn<(...args: unknown[]) => void>();
  const webRequest = {
    onBeforeRequest: { addListener: onBeforeRequest },
    onHeadersReceived: { addListener: onHeadersReceived },
  } as unknown as WebRequestEvents;

  return { webRequest, onBeforeRequest, onHeadersReceived };
}

const requestFilter = { urls: ['https://example.com/generate*'] };

describe('live generation observer', () => {
  it('registers only the hooks a site implements, with the data they need', () => {
    const { webRequest, onBeforeRequest, onHeadersReceived } = fakeWebRequest();
    const requestSite: BackgroundSite = {
      id: 'chatgpt',
      origin: 'https://example.com',
      requestFilter,
      liveIdFromRequest: () => 'from-request',
    };

    observeLiveGenerations([requestSite], webRequest, vi.fn());

    expect(onHeadersReceived).not.toHaveBeenCalled();
    expect(onBeforeRequest).toHaveBeenCalledWith(
      expect.any(Function),
      requestFilter,
      ['requestBody'],
    );
  });

  it('forwards live IDs from requests made by a tab to that tab and frame', () => {
    const { webRequest, onHeadersReceived } = fakeWebRequest();
    const notify = vi.fn();
    const site: BackgroundSite = {
      id: 'chatgpt',
      origin: 'https://example.com',
      requestFilter,
      liveIdFromResponse: (details) =>
        details.statusCode === 200 ? 'live-1' : null,
    };

    observeLiveGenerations([site], webRequest, notify);
    expect(onHeadersReceived).toHaveBeenCalledWith(
      expect.any(Function),
      requestFilter,
      ['responseHeaders'],
    );
    const listener = onHeadersReceived.mock.calls[0][0] as Listener;

    listener({ tabId: 7, frameId: 2, statusCode: 200 });
    listener({ tabId: 7, frameId: 0, statusCode: 500 });
    listener({ tabId: -1, frameId: 0, statusCode: 200 });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(7, 2, 'live-1');
  });
});
