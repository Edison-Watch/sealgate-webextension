import type { ToolCallRecord } from '../../shared/tracker';
import { arrayProperty, property, reactFiber, stringProperty } from '../react';
import type { ContentSite } from '../types';

const toolListButtonSelector = 'button[aria-label="Open tool call list"]';
const assistantTurnSelector = 'section[data-turn="assistant"][data-turn-id]';

// The nearest `messages` prop only holds the last call/result pair of a turn;
// `allMessages`, further up the tree, holds every message in the turn.
function reactMessages(button: HTMLButtonElement): unknown[] {
  let nearestMessages: unknown[] = [];

  try {
    let fiber = reactFiber(button);

    for (let depth = 0; fiber && depth < 100; depth += 1) {
      const props = property(fiber, 'memoizedProps');
      const allMessages = arrayProperty(props, 'allMessages');
      if (allMessages) {
        return allMessages;
      }

      const messages = arrayProperty(props, 'messages');
      if (messages && nearestMessages.length === 0) {
        nearestMessages = messages;
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
  const turn = button.closest<HTMLElement>(assistantTurnSelector);
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
      site: 'chatgpt',
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

export const chatgptContent: ContentSite = {
  id: 'chatgpt',
  origin: 'https://chatgpt.com',
  turnSelector: assistantTurnSelector,
  readToolCalls(turn, liveIds, now) {
    return [
      ...turn.querySelectorAll<HTMLButtonElement>(toolListButtonSelector),
    ].flatMap((button) => readToolCallsFromButton(button, liveIds, now));
  },
};
