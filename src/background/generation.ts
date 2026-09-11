export const generationRequestFilter: chrome.webRequest.RequestFilter = {
  urls: ['https://chatgpt.com/backend-api/f/conversation*'],
};

const generationPath = '/backend-api/f/conversation';
const requestIdHeader = 'x-oai-request-id';

export interface GenerationResponse {
  tabId: number;
  frameId: number;
  requestId: string;
}

// Only the POST that streams a new answer counts; /prepare and other sibling
// endpoints share the URL prefix but never produce assistant messages.
export function generationResponseFrom(
  details: chrome.webRequest.OnHeadersReceivedDetails,
): GenerationResponse | null {
  if (
    details.tabId < 0 ||
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

  if (url.origin !== 'https://chatgpt.com' || url.pathname !== generationPath) {
    return null;
  }

  const requestId = details.responseHeaders
    ?.find((header) => header.name.toLowerCase() === requestIdHeader)
    ?.value?.trim();

  return requestId
    ? { tabId: details.tabId, frameId: details.frameId, requestId }
    : null;
}
