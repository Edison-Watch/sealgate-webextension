import {
  addUniqueCalls,
  createInitialState,
  type TrackerLiveRequestMessage,
  type TrackerRequest,
  type TrackerResponse,
  type TrackerState,
  type TrackerStateChangedMessage,
  type ToolCallRecord,
} from '../shared/tracker';
import {
  connectionRequestTypes,
  type ConnectionChangedMessage,
  type ConnectionRequest,
  type ConnectionResponse,
} from '../shared/destination';
import { backgroundSites } from '../sites/background';
import {
  connectionState,
  handleConnectionRequest,
  type ConnectionDeps,
  type SignInProgress,
} from './connection';
import { Exporter } from './exporter';
import { observeLiveGenerations } from './live';

const stateKey = 'trackerState';
const signInKey = 'signInProgress';
const flushAlarm = 'sealgate:flushExports';
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
  await broadcast(message);
}

async function broadcast(message: unknown): Promise<void> {
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

// Only the popup listens for connection changes.
function publishConnection(): void {
  void connectionState(connectionDeps).then((connection) => {
    const message: ConnectionChangedMessage = {
      type: 'connection:changed',
      connection,
    };
    return chrome.runtime.sendMessage(message).catch(() => undefined);
  });
}

const exporter = new Exporter({
  store: {
    get: async (key) => (await chrome.storage.local.get(key))[key],
    set: (key, value) => chrome.storage.local.set({ [key]: value }),
  },
  fetch: (input, init) => fetch(input, init),
  version: chrome.runtime.getManifest().version,
  onChange: publishConnection,
});

const signInProgress: SignInProgress = {
  get: async () => {
    const stored = (await chrome.storage.session.get(signInKey))[signInKey];
    return (
      (stored as Awaited<ReturnType<SignInProgress['get']>> | undefined) ?? {
        signingIn: false,
        signInError: null,
      }
    );
  },
  set: (progress) => chrome.storage.session.set({ [signInKey]: progress }),
};

const connectionDeps: ConnectionDeps = {
  exporter,
  progress: signInProgress,
  oauth: {
    fetch: (input, init) => fetch(input, init),
    launchAuthFlow: (url) =>
      chrome.identity.launchWebAuthFlow({ url, interactive: true }),
    redirectUrl: chrome.identity.getRedirectURL(),
  },
  recordedCalls: async () => (await readState()).calls,
  onChange: publishConnection,
};

async function handleRequest(
  request: TrackerRequest,
): Promise<TrackerResponse> {
  if (request.type === 'tracker:getState') {
    return { ok: true, state: await readState() };
  }

  let recorded: ToolCallRecord[] = [];
  const update = await updateState((currentState) => {
    switch (request.type) {
      case 'tracker:setPaused':
        return currentState.paused === request.paused
          ? currentState
          : { ...currentState, paused: request.paused };
      case 'tracker:recordCalls': {
        const nextState = addUniqueCalls(currentState, request.calls);
        recorded = nextState.calls.slice(currentState.calls.length);
        return nextState;
      }
      case 'tracker:clearCalls':
        return currentState.calls.length === 0
          ? currentState
          : { ...currentState, calls: [] };
    }
  });

  if (update.changed) {
    await publishState(update.state);
  }
  if (recorded.length > 0) {
    void exporter.enqueue(recorded);
  }
  return { ok: true, state: update.state };
}

function isConnectionRequest(message: unknown): message is ConnectionRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof message.type === 'string' &&
    connectionRequestTypes.has(message.type)
  );
}

function errorResponse(error: unknown): ConnectionResponse {
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Unexpected error.',
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Connection changes come from the extension's own pages (the popup, or
  // the same page opened in a tab on install), never a site's content script.
  if (
    isConnectionRequest(message) &&
    sender.url?.startsWith(chrome.runtime.getURL(''))
  ) {
    void handleConnectionRequest(message, connectionDeps)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse(errorResponse(error)));
    return true;
  }

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

observeLiveGenerations(
  backgroundSites,
  chrome.webRequest,
  (tabId, frameId, liveId) => {
    const message: TrackerLiveRequestMessage = {
      type: 'tracker:liveRequest',
      liveId,
    };
    void chrome.tabs
      .sendMessage(tabId, message, { frameId })
      .catch(() => undefined);
  },
);

// A sign-in cannot survive the worker that ran it.
void signInProgress
  .get()
  .then((progress) =>
    progress.signingIn
      ? signInProgress.set({ signingIn: false, signInError: null })
      : undefined,
  );

// Exports that failed (offline, expired session) are retried periodically.
void chrome.alarms.create(flushAlarm, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === flushAlarm) {
    void exporter.flush();
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});
