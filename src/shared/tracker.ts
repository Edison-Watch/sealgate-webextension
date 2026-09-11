export interface ToolCallRecord {
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
  requestId: string;
}

export function createInitialState(): TrackerState {
  return { paused: false, calls: [] };
}

export function addUniqueCalls(
  state: TrackerState,
  incomingCalls: ToolCallRecord[],
): TrackerState {
  if (state.paused || incomingCalls.length === 0) {
    return state;
  }

  const knownIds = new Set(state.calls.map((call) => call.id));
  const uniqueCalls = incomingCalls.filter((call) => {
    if (knownIds.has(call.id)) {
      return false;
    }

    knownIds.add(call.id);
    return true;
  });

  if (uniqueCalls.length === 0) {
    return state;
  }

  return { ...state, calls: [...state.calls, ...uniqueCalls] };
}
