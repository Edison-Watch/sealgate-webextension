import type { BackgroundSite } from '../sites/types';

export type WebRequestEvents = Pick<
  typeof chrome.webRequest,
  'onBeforeRequest' | 'onHeadersReceived'
>;

export type NotifyLive = (
  tabId: number,
  frameId: number,
  liveId: string,
) => void;

// Passive observation only: no "blocking" option, so no request is ever
// delayed or altered.
export function observeLiveGenerations(
  sites: readonly BackgroundSite[],
  webRequest: WebRequestEvents,
  notify: NotifyLive,
): void {
  const report = (
    details: { tabId: number; frameId: number },
    liveId: string | null,
  ): void => {
    if (details.tabId >= 0 && liveId) {
      notify(details.tabId, details.frameId, liveId);
    }
  };

  for (const site of sites) {
    const { liveIdFromRequest, liveIdFromResponse, requestFilter } = site;

    if (liveIdFromRequest) {
      webRequest.onBeforeRequest.addListener(
        (details) => {
          report(details, liveIdFromRequest(details));
          return undefined;
        },
        requestFilter,
        ['requestBody'],
      );
    }

    if (liveIdFromResponse) {
      webRequest.onHeadersReceived.addListener(
        (details) => {
          report(details, liveIdFromResponse(details));
          return undefined;
        },
        requestFilter,
        ['responseHeaders'],
      );
    }
  }
}
