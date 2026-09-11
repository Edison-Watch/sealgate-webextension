export type SiteId = 'chatgpt' | 'claude';

export interface ToolCallRecord {
  site: SiteId;
  id: string;
  conversationId: string | null;
  turnId: string;
  appName: string;
  toolName: string;
  toolIndex: number;
  detectedAt: string;
}

export interface TrackerState {
  paused: boolean;
  calls: ToolCallRecord[];
}

export type TrackerRequest =
  | { type: 'tracker:getState' }
  | { type: 'tracker:setPaused'; paused: boolean }
  | { type: 'tracker:recordCalls'; calls: ToolCallRecord[] }
  | { type: 'tracker:clearCalls' };

export interface TrackerResponse {
  ok: boolean;
  state?: TrackerState;
  error?: string;
}

export interface TrackerStateChangedMessage {
  type: 'tracker:stateChanged';
  state: TrackerState;
}

export interface TrackerLiveRequestMessage {
  type: 'tracker:liveRequest';
  liveId: string;
}

export function createInitialState(): TrackerState {
  return { paused: false, calls: [] };
}

// Call IDs are only unique within the site that issued them.
export function callKey(call: ToolCallRecord): string {
  return `${call.site}:${call.id}`;
}

export function addUniqueCalls(
  state: TrackerState,
  incomingCalls: ToolCallRecord[],
): TrackerState {
  if (state.paused || incomingCalls.length === 0) {
    return state;
  }

  const knownKeys = new Set(state.calls.map(callKey));
  const uniqueCalls = incomingCalls.filter((call) => {
    const key = callKey(call);
    if (knownKeys.has(key)) {
      return false;
    }

    knownKeys.add(key);
    return true;
  });

  if (uniqueCalls.length === 0) {
    return state;
  }

  return { ...state, calls: [...state.calls, ...uniqueCalls] };
}
