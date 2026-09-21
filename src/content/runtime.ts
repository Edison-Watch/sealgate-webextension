import {
  callKey,
  type ToolCallRecord,
  type TrackerLiveRequestMessage,
  type TrackerResponse,
  type TrackerStateChangedMessage,
} from '../shared/tracker';
import type { ContentSite } from '../sites/types';

export interface TrackableContentSite extends Omit<
  ContentSite,
  'readToolCalls'
> {
  readToolCalls(
    turn: HTMLElement,
    liveIds: ReadonlySet<string>,
    now?: () => Date,
  ): ToolCallRecord[] | Promise<ToolCallRecord[]>;
}

export function updateSeenCalls(
  seenCallKeys: Set<string>,
  calls: ToolCallRecord[],
  emitNew: boolean,
): ToolCallRecord[] {
  const newCalls: ToolCallRecord[] = [];

  for (const call of calls) {
    const key = callKey(call);
    if (seenCallKeys.has(key)) {
      continue;
    }

    seenCallKeys.add(key);
    if (emitNew) {
      newCalls.push(call);
    }
  }

  return newCalls;
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

export function startTracking(site: TrackableContentSite): void {
  const liveIds = new Set<string>();
  const seenCallKeys = new Set<string>();
  const dirtyTurns = new Set<HTMLElement>();
  let paused = true;
  let initialized = false;
  let scanTimer: number | undefined;
  let trackingGeneration = 0;

  function assistantTurns(root: ParentNode = document): HTMLElement[] {
    const turns = [...root.querySelectorAll<HTMLElement>(site.turnSelector)];
    if (root instanceof HTMLElement && root.matches(site.turnSelector)) {
      turns.unshift(root);
    }
    return turns;
  }

  async function recordCalls(calls: ToolCallRecord[]): Promise<void> {
    if (calls.length === 0 || paused) {
      return;
    }

    const response = (await chrome.runtime.sendMessage({
      type: 'tracker:recordCalls',
      calls,
    })) as TrackerResponse | undefined;

    // One line per recording, so the tracker can be checked from the tab's
    // console without opening the popup. Page scripts cannot read it.
    console.info(
      `[Sealgate] Recorded ${calls
        .map((call) => `${call.appName}/${call.toolName}`)
        .join(', ')}; ${response?.state?.calls.length ?? '?'} calls stored.`,
    );
  }

  async function readTurns(
    turns: Iterable<HTMLElement>,
  ): Promise<ToolCallRecord[]> {
    const detected = new Map<string, ToolCallRecord>();

    for (const turn of turns) {
      if (!turn.isConnected) {
        continue;
      }

      for (const call of await site.readToolCalls(turn, liveIds)) {
        detected.set(callKey(call), call);
      }
    }

    return [...detected.values()];
  }

  function isActive(): boolean {
    return initialized && !paused && liveIds.size > 0;
  }

  async function scanDirtyTurns(): Promise<void> {
    window.clearTimeout(scanTimer);
    scanTimer = undefined;
    const turns = [...dirtyTurns];
    dirtyTurns.clear();

    if (!isActive()) {
      return;
    }

    const generation = trackingGeneration;
    const calls = await readTurns(turns);
    if (!isActive() || generation !== trackingGeneration) {
      return;
    }

    const newCalls = updateSeenCalls(seenCallKeys, calls, true);
    await recordCalls(newCalls);
  }

  function scheduleScan(delayMs = 750): void {
    if (!isActive()) {
      return;
    }

    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => void scanDirtyTurns(), delayMs);
  }

  // Calls from live requests that finished while tracking was paused stay
  // unrecorded when tracking resumes.
  async function markVisibleCallsSeen(generation: number): Promise<void> {
    dirtyTurns.clear();
    const calls = await readTurns(assistantTurns());
    if (paused || generation !== trackingGeneration) {
      return;
    }

    updateSeenCalls(seenCallKeys, calls, false);
  }

  function noteMutations(mutations: MutationRecord[]): void {
    if (!isActive()) {
      return;
    }

    for (const mutation of mutations) {
      const targetTurn =
        mutation.target instanceof Element
          ? mutation.target.closest<HTMLElement>(site.turnSelector)
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

  const observer = new MutationObserver(noteMutations);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      isMessageOfType<TrackerLiveRequestMessage>(message, 'tracker:liveRequest')
    ) {
      liveIds.add(message.liveId);
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

    if (wasPaused !== paused) {
      trackingGeneration += 1;
    }

    if (!wasPaused && paused) {
      window.clearTimeout(scanTimer);
      scanTimer = undefined;
      dirtyTurns.clear();
    } else if (wasPaused && !paused && initialized) {
      void markVisibleCallsSeen(trackingGeneration);
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
}
