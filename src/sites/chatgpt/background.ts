import type { BackgroundSite } from '../types';

const origin = 'https://chatgpt.com';
const generationPath = '/backend-api/f/conversation';
const requestIdHeader = 'x-oai-request-id';

// Only the POST that streams a new answer counts; /prepare and other sibling
// endpoints share the URL prefix but never produce assistant messages. The
// response's request ID is what ChatGPT stamps on every message it produces.
function liveIdFromResponse(
  details: chrome.webRequest.OnHeadersReceivedDetails,
): string | null {
  if (
    details.method !== 'POST' ||
    details.statusCode < 200 ||
    details.statusCode >= 300
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(details.url);
  } catch {
    return null;
  }

  if (url.origin !== origin || url.pathname !== generationPath) {
    return null;
  }

  return (
    details.responseHeaders
      ?.find((header) => header.name.toLowerCase() === requestIdHeader)
      ?.value?.trim() || null
  );
}

export const chatgptBackground: BackgroundSite = {
  id: 'chatgpt',
  origin,
  requestFilter: { urls: [`${origin}${generationPath}*`] },
  liveIdFromResponse,
};
