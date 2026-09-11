import { describe, expect, it } from 'vitest';
import {
  addUniqueCalls,
  createInitialState,
  type ToolCallRecord,
} from './tracker';

function call(id: string): ToolCallRecord {
  return {
    site: 'chatgpt',
    id,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    appName: 'microsoft-learn',
    toolName: 'microsoft_docs_search',
    toolIndex: 1,
    detectedAt: '2026-09-11T12:00:00.000Z',
  };
}

describe('tracker state', () => {
  it('adds each call id only once', () => {
    const first = call('call-1');
    const second = call('call-2');
    const state = addUniqueCalls(createInitialState(), [first, first, second]);

    expect(state.calls).toEqual([first, second]);
    expect(addUniqueCalls(state, [first])).toBe(state);
  });

  it('keeps calls from different sites that share an id', () => {
    const chatgpt = call('call-1');
    const other = {
      ...chatgpt,
      site: 'other',
    } as unknown as ToolCallRecord;

    expect(
      addUniqueCalls(createInitialState(), [chatgpt, other]).calls,
    ).toEqual([chatgpt, other]);
  });

  it('does not record calls while paused', () => {
    const state = { ...createInitialState(), paused: true };

    expect(addUniqueCalls(state, [call('call-1')])).toBe(state);
  });
});
