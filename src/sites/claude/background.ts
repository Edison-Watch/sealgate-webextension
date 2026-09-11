import { property, stringProperty } from '../react';
import type { BackgroundSite } from '../types';

const origin = 'https://claude.ai';
const generationPath =
  /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(?:completion|retry_completion)$/;

function requestJson(
  body: chrome.webRequest.OnBeforeRequestDetails['requestBody'],
): unknown {
  const chunks = body?.raw?.flatMap((part) => (part.bytes ? [part.bytes] : []));
  if (!chunks || chunks.length === 0) {
    return null;
  }

  const decoder = new TextDecoder();
  const text =
    chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') +
    decoder.decode();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

// The client picks the answer's message UUID before sending the request, and
// the rendered answer keeps it as `uuid`. Only that field is read from the
// body; the prompt and every other field are ignored.
function liveIdFromRequest(
  details: chrome.webRequest.OnBeforeRequestDetails,
): string | null {
  if (details.method !== 'POST') {
    return null;
  }

  let url: URL;
  try {
    url = new URL(details.url);
  } catch {
    return null;
  }

  if (url.origin !== origin || !generationPath.test(url.pathname)) {
    return null;
  }

  const uuids = property(
    requestJson(details.requestBody),
    'turn_message_uuids',
  );
  return stringProperty(uuids, 'assistant_message_uuid');
}

export const claudeBackground: BackgroundSite = {
  id: 'claude',
  origin,
  requestFilter: {
    urls: [
      `${origin}/api/organizations/*/completion`,
      `${origin}/api/organizations/*/retry_completion`,
    ],
  },
  liveIdFromRequest,
};
