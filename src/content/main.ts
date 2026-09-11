import {
  findToolListButtons,
  readToolCallsFromButton,
  updateSeenCalls,
} from './detector';
import type {
  ToolCallRecord,
  TrackerLiveRequestMessage,
  TrackerResponse,
  TrackerStateChangedMessage,
} from '../shared/tracker';

const assistantTurnSelector = 'section[data-turn="assistant"][data-turn-id]';
const liveRequestIds = new Set<string>();
const seenCallIds = new Set<string>();
const dirtyTurns = new Set<HTMLElement>();
let paused = true;
let initialized = false;
let scanTimer: number | undefined;

function assistantTurns(root: ParentNode = document): HTMLElement[] {
  const turns = [...root.querySelectorAll<HTMLElement>(assistantTurnSelector)];
  if (root instanceof HTMLElement && root.matches(assistantTurnSelector)) {
    turns.unshift(root);
  }
  return turns;
}

async function recordCalls(calls: ToolCallRecord[]): Promise<void> {
  if (calls.length === 0 || paused) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: 'tracker:recordCalls',
    calls,
  });
}

function readTurns(turns: Iterable<HTMLElement>): ToolCallRecord[] {
  const detected = new Map<string, ToolCallRecord>();

  for (const turn of turns) {
    if (!turn.isConnected) {
      continue;
    }

    for (const button of findToolListButtons(turn)) {
      for (const call of readToolCallsFromButton(button, liveRequestIds)) {
        detected.set(call.id, call);
      }
    }
  }

  return [...detected.values()];
}

function isActive(): boolean {
  return initialized && !paused && liveRequestIds.size > 0;
}

function scanDirtyTurns(): void {
  window.clearTimeout(scanTimer);
  scanTimer = undefined;
  const turns = [...dirtyTurns];
  dirtyTurns.clear();

  if (!isActive()) {
    return;
  }

  const newCalls = updateSeenCalls(seenCallIds, readTurns(turns), true);
  void recordCalls(newCalls);
}

function scheduleScan(delayMs = 750): void {
  if (!isActive()) {
    return;
  }

  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scanDirtyTurns, delayMs);
}

// Calls from live requests that finished while tracking was paused stay
// unrecorded when tracking resumes.
function markVisibleCallsSeen(): void {
  dirtyTurns.clear();
  updateSeenCalls(seenCallIds, readTurns(assistantTurns()), false);
}

function noteMutations(mutations: MutationRecord[]): void {
  if (!isActive()) {
    return;
  }

  for (const mutation of mutations) {
    const targetTurn =
      mutation.target instanceof Element
        ? mutation.target.closest<HTMLElement>(assistantTurnSelector)
        : null;
    if (targetTurn) {
      dirtyTurns.add(targetTurn);
    }

    for (const node of mutation.addedNodes) {
      if (node instanceof Element) {
        for (const turn of assistantTurns(node)) {
          dirtyTurns.add(turn);
        }
      }
    }
  }

  if (dirtyTurns.size > 0) {
    scheduleScan();
  }
}

function isMessageOfType<T extends { type: string }>(
  message: unknown,
  type: T['type'],
): message is T {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === type
  );
}

const observer = new MutationObserver(noteMutations);
observer.observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    isMessageOfType<TrackerLiveRequestMessage>(message, 'tracker:liveRequest')
  ) {
    liveRequestIds.add(message.requestId);
    for (const turn of assistantTurns()) {
      dirtyTurns.add(turn);
    }
    scheduleScan();
    return;
  }

  if (
    !isMessageOfType<TrackerStateChangedMessage>(
      message,
      'tracker:stateChanged',
    )
  ) {
    return;
  }

  const wasPaused = paused;
  paused = message.state.paused;

  if (!wasPaused && paused) {
    window.clearTimeout(scanTimer);
    scanTimer = undefined;
    dirtyTurns.clear();
  } else if (wasPaused && !paused && initialized) {
    markVisibleCallsSeen();
  }
});

void chrome.runtime
  .sendMessage({ type: 'tracker:getState' })
  .then((response: TrackerResponse) => {
    paused = response.state?.paused ?? false;
  })
  .catch(() => {
    paused = false;
  })
  .finally(() => {
    initialized = true;
  });
