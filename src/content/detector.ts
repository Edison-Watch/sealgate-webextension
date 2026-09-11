import type { ToolCallRecord } from '../shared/tracker';

const toolListButtonSelector = 'button[aria-label="Open tool call list"]';
const reactFiberPrefix = '__reactFiber$';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function property(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function stringProperty(value: unknown, key: string): string | null {
  const result = property(value, key);
  return typeof result === 'string' && result.length > 0 ? result : null;
}

function pageObject(element: Element): UnknownRecord {
  try {
    const wrapped = (element as Element & { wrappedJSObject?: unknown })
      .wrappedJSObject;
    return isRecord(wrapped) ? wrapped : (element as unknown as UnknownRecord);
  } catch {
    return element as unknown as UnknownRecord;
  }
}

// The nearest `messages` prop only holds the last call/result pair of a turn;
// `allMessages`, further up the tree, holds every message in the turn.
function reactMessages(button: HTMLButtonElement): unknown[] {
  let nearestMessages: unknown[] = [];

  try {
    const pageButton = pageObject(button);
    const fiberKey = Object.getOwnPropertyNames(pageButton).find((key) =>
      key.startsWith(reactFiberPrefix),
    );
    let fiber = fiberKey ? property(pageButton, fiberKey) : undefined;

    for (let depth = 0; fiber && depth < 100; depth += 1) {
      const props = property(fiber, 'memoizedProps');
      const allMessages = property(props, 'allMessages');
      if (Array.isArray(allMessages)) {
        return [...allMessages];
      }

      const messages = property(props, 'messages');
      if (Array.isArray(messages) && nearestMessages.length === 0) {
        nearestMessages = [...messages];
      }

      fiber = property(fiber, 'return');
    }
  } catch {
    return nearestMessages;
  }

  return nearestMessages;
}

function conversationIdFromUrl(url: URL): string | null {
  const match = url.pathname.match(/^\/c\/([^/]+)/);
  return match?.[1] ?? null;
}

function toolNameFromResourceUri(resourceUri: string): string | null {
  const match = resourceUri.match(/\/([^/?#]+)(?:[?#].*)?$/);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

// Only messages produced by a generation request observed in this tab are
// returned, so history loaded into the page is never reported as new calls.
export function readToolCallsFromButton(
  button: HTMLButtonElement,
  liveRequestIds: ReadonlySet<string>,
  now: () => Date = () => new Date(),
): ToolCallRecord[] {
  const turn = button.closest<HTMLElement>(
    'section[data-turn="assistant"][data-turn-id]',
  );
  const turnId = turn?.dataset.turnId;
  if (!turnId || !button.isConnected) {
    return [];
  }

  const conversationId = conversationIdFromUrl(new URL(window.location.href));
  const detectedAt = now().toISOString();
  const calls: ToolCallRecord[] = [];

  for (const message of reactMessages(button)) {
    const metadata = property(message, 'metadata');
    const requestId = stringProperty(metadata, 'request_id');
    if (!requestId || !liveRequestIds.has(requestId)) {
      continue;
    }

    const resource = property(metadata, 'invoked_resource');
    const appName = stringProperty(resource, 'app_name');
    const resourceUri = stringProperty(resource, 'resource_uri');
    const messageId = stringProperty(message, 'id');
    const toolName = resourceUri ? toolNameFromResourceUri(resourceUri) : null;

    if (!appName || !resourceUri || !messageId || !toolName) {
      continue;
    }

    // Live turns carry a placeholder turn ID that changes on reload; the
    // message ID is stable across the stream, the page, and history.
    calls.push({
      id: messageId,
      conversationId,
      turnId,
      appName,
      toolName,
      toolIndex: calls.length + 1,
      detectedAt,
    });
  }

  return calls;
}

export function findToolListButtons(
  root: ParentNode = document,
): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>(toolListButtonSelector)];
}

export function updateSeenCalls(
  seenCallIds: Set<string>,
  calls: ToolCallRecord[],
  emitNew: boolean,
): ToolCallRecord[] {
  const newCalls: ToolCallRecord[] = [];

  for (const call of calls) {
    if (seenCallIds.has(call.id)) {
      continue;
    }

    seenCallIds.add(call.id);
    if (emitNew) {
      newCalls.push(call);
    }
  }

  return newCalls;
}
