import type { SiteId, ToolCallRecord } from '../shared/tracker';

// Background half of a site: recognises the request that generates a new
// answer and extracts the live ID that the answer's messages will carry.
// Implement whichever hook exposes that ID; both are observed passively.
export interface BackgroundSite {
  id: SiteId;
  origin: string;
  requestFilter: chrome.webRequest.RequestFilter;
  liveIdFromRequest?(
    details: chrome.webRequest.OnBeforeRequestDetails,
  ): string | null;
  liveIdFromResponse?(
    details: chrome.webRequest.OnHeadersReceivedDetails,
  ): string | null;
}

// Content half of a site: finds rendered turns and reads their tool calls.
export interface ContentSite {
  id: SiteId;
  origin: string;
  // Each matching element is rescanned as a unit when anything inside changes.
  turnSelector: string;
  // Must return only calls whose message carries an ID in `liveIds`, so
  // history loaded into the page is never reported as new calls.
  readToolCalls(
    turn: HTMLElement,
    liveIds: ReadonlySet<string>,
    now?: () => Date,
  ): ToolCallRecord[];
}
