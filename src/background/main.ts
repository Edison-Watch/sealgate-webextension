import {
  addUniqueCalls,
  createInitialState,
  type TrackerLiveRequestMessage,
  type TrackerRequest,
  type TrackerResponse,
  type TrackerState,
  type TrackerStateChangedMessage,
} from '../shared/tracker';
import { generationRequestFilter, generationResponseFrom } from './generation';

const stateKey = 'trackerState';
let writeQueue = Promise.resolve();

interface StateUpdate {
  state: TrackerState;
  changed: boolean;
}

async function readState(): Promise<TrackerState> {
  const stored = await chrome.storage.session.get(stateKey);
  const state = stored[stateKey] as TrackerState | undefined;

  return state ?? createInitialState();
}

async function writeState(state: TrackerState): Promise<TrackerState> {
  await chrome.storage.session.set({ [stateKey]: state });
  return state;
}

function updateState(
  update: (state: TrackerState) => TrackerState | Promise<TrackerState>,
): Promise<StateUpdate> {
  const operation = writeQueue.then(async () => {
    const currentState = await readState();
    const nextState = await update(currentState);

    if (nextState === currentState) {
      return { state: currentState, changed: false };
    }

    return { state: await writeState(nextState), changed: true };
  });

  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );

  return operation;
}

function isTrackerRequest(message: unknown): message is TrackerRequest {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false;
  }

  return (
    typeof message.type === 'string' &&
    [
      'tracker:getState',
      'tracker:setPaused',
      'tracker:recordCalls',
      'tracker:clearCalls',
    ].includes(message.type)
  );
}

async function publishState(state: TrackerState): Promise<void> {
  const message: TrackerStateChangedMessage = {
    type: 'tracker:stateChanged',
    state,
  };

  const tabs = await chrome.tabs.query({});
  await Promise.all([
    chrome.runtime.sendMessage(message).catch(() => undefined),
    ...tabs.map((tab) =>
      tab.id === undefined
        ? Promise.resolve()
        : chrome.tabs.sendMessage(tab.id, message).catch(() => undefined),
    ),
  ]);
}

async function handleRequest(
  request: TrackerRequest,
): Promise<TrackerResponse> {
  if (request.type === 'tracker:getState') {
    return { ok: true, state: await readState() };
  }

  const update = await updateState((currentState) => {
    switch (request.type) {
      case 'tracker:setPaused':
        return currentState.paused === request.paused
          ? currentState
          : { ...currentState, paused: request.paused };
      case 'tracker:recordCalls':
        return addUniqueCalls(currentState, request.calls);
      case 'tracker:clearCalls':
        return currentState.calls.length === 0
          ? currentState
          : { ...currentState, calls: [] };
    }
  });

  if (update.changed) {
    await publishState(update.state);
  }
  return { ok: true, state: update.state };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isTrackerRequest(message)) {
    return false;
  }

  void handleRequest(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const response: TrackerResponse = {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unexpected tracker error.',
      };
      sendResponse(response);
    });

  return true;
});

// Passive observation only: no "blocking" option, so the request is never
// delayed or altered. The response's request ID is what ChatGPT stamps on
// every message that request produces.
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const generation = generationResponseFrom(details);
    if (!generation) {
      return;
    }

    const message: TrackerLiveRequestMessage = {
      type: 'tracker:liveRequest',
      requestId: generation.requestId,
    };
    void chrome.tabs
      .sendMessage(generation.tabId, message, { frameId: generation.frameId })
      .catch(() => undefined);
  },
  generationRequestFilter,
  ['responseHeaders'],
);
