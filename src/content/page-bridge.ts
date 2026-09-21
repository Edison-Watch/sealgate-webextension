import type { ToolCallRecord } from '../shared/tracker';
import { isRecord } from '../sites/react';
import type { ContentSite } from '../sites/types';
import type { TrackableContentSite } from './runtime';

export const scanRequestEvent = 'sealgate:tool-scan-request:v1';
export const scanResponseEvent = 'sealgate:tool-scan-response:v1';

interface ScanRequest {
  requestId: string;
  liveIds: string[];
}

interface ScanResponse {
  requestId: string;
  calls: ToolCallRecord[];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseRequest(value: unknown): ScanRequest | null {
  const parsed = parseJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.requestId !== 'string' ||
    parsed.requestId.length === 0 ||
    parsed.requestId.length > 128 ||
    !Array.isArray(parsed.liveIds) ||
    parsed.liveIds.length > 1_000 ||
    !parsed.liveIds.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 256,
    )
  ) {
    return null;
  }

  return { requestId: parsed.requestId, liveIds: [...parsed.liveIds] };
}

function sanitizeToolCallRecord(value: unknown): ToolCallRecord | null {
  if (
    !isRecord(value) ||
    (value.site !== 'chatgpt' && value.site !== 'claude') ||
    typeof value.id !== 'string' ||
    (typeof value.conversationId !== 'string' &&
      value.conversationId !== null) ||
    typeof value.turnId !== 'string' ||
    typeof value.appName !== 'string' ||
    typeof value.toolName !== 'string' ||
    typeof value.toolIndex !== 'number' ||
    !Number.isInteger(value.toolIndex) ||
    typeof value.detectedAt !== 'string'
  ) {
    return null;
  }

  return {
    site: value.site,
    id: value.id,
    conversationId: value.conversationId,
    turnId: value.turnId,
    appName: value.appName,
    toolName: value.toolName,
    toolIndex: value.toolIndex,
    detectedAt: value.detectedAt,
  };
}

function parseResponse(value: unknown): ScanResponse | null {
  const parsed = parseJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.requestId !== 'string' ||
    !Array.isArray(parsed.calls)
  ) {
    return null;
  }

  const calls = parsed.calls.map(sanitizeToolCallRecord);
  if (calls.some((call) => call === null)) {
    return null;
  }

  return {
    requestId: parsed.requestId,
    calls: calls.filter((call): call is ToolCallRecord => call !== null),
  };
}

// Installs the page-world half of the bridge. It is deliberately synchronous:
// only sanitized tool metadata crosses back into the isolated extension world.
// The host page can observe or forge these events, just as it can alter the
// DOM and React state being inspected. The isolated side therefore treats the
// response as untrusted, correlates it to its request, and projects only the
// recognized ToolCallRecord fields; this bridge is not an authentication
// boundary.
export function startMainWorldScanning(site: ContentSite): () => void {
  const onRequest = (event: Event): void => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const turn = event.target;
    const request = parseRequest(event.detail);
    if (
      !(turn instanceof HTMLElement) ||
      !turn.matches(site.turnSelector) ||
      !request
    ) {
      return;
    }

    const response: ScanResponse = {
      requestId: request.requestId,
      calls: site.readToolCalls(turn, new Set(request.liveIds)),
    };
    turn.dispatchEvent(
      new CustomEvent(scanResponseEvent, {
        detail: JSON.stringify(response),
      }),
    );
  };

  document.addEventListener(scanRequestEvent, onRequest, true);
  return () => document.removeEventListener(scanRequestEvent, onRequest, true);
}

function readToolCallsInMainWorld(
  turn: HTMLElement,
  liveIds: ReadonlySet<string>,
): Promise<ToolCallRecord[]> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (calls: ToolCallRecord[]): void => {
      window.clearTimeout(timeoutId);
      turn.removeEventListener(scanResponseEvent, onResponse);
      resolve(calls);
    };
    const onResponse = (event: Event): void => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const response = parseResponse(event.detail);
      if (response?.requestId === requestId) {
        finish(response.calls);
      }
    };
    const timeoutId = window.setTimeout(() => finish([]), 1_000);

    turn.addEventListener(scanResponseEvent, onResponse);
    turn.dispatchEvent(
      new CustomEvent(scanRequestEvent, {
        bubbles: true,
        detail: JSON.stringify({ requestId, liveIds: [...liveIds] }),
      }),
    );
  });
}

export function mainWorldContentSite(site: ContentSite): TrackableContentSite {
  return {
    ...site,
    readToolCalls: readToolCallsInMainWorld,
  };
}
