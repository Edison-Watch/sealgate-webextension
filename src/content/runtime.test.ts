import { describe, expect, it } from 'vitest';
import type { ToolCallRecord } from '../shared/tracker';
import { updateSeenCalls } from './runtime';

describe('content tracking runtime', () => {
  it('uses existing calls as a baseline and emits only later calls', () => {
    const existingCall: ToolCallRecord = {
      site: 'chatgpt',
      id: 'result-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      appName: 'microsoft-learn',
      toolName: 'microsoft_docs_search',
      toolIndex: 1,
      detectedAt: '2026-09-11T12:00:00.000Z',
    };
    const newCall: ToolCallRecord = {
      ...existingCall,
      id: 'result-2',
      toolName: 'microsoft_docs_fetch',
      toolIndex: 2,
    };
    const seenCallKeys = new Set<string>();

    expect(updateSeenCalls(seenCallKeys, [existingCall], false)).toEqual([]);
    expect(updateSeenCalls(seenCallKeys, [existingCall], true)).toEqual([]);
    expect(
      updateSeenCalls(seenCallKeys, [existingCall, newCall], true),
    ).toEqual([newCall]);
  });
});
