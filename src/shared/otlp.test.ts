import { describe, expect, it } from 'vitest';
import { sessionKey, toolCallSpan, traceRequest, tracesUrl } from './otlp';
import type { ToolCallRecord } from './tracker';

const call: ToolCallRecord = {
  site: 'claude',
  id: 'toolu_1',
  conversationId: 'conversation-1',
  turnId: 'message-1',
  appName: 'Linear',
  toolName: 'list_issues',
  toolIndex: 2,
  detectedAt: '2026-09-11T12:00:00.000Z',
};

function attribute(
  span: Awaited<ReturnType<typeof toolCallSpan>>,
  key: string,
): unknown {
  return span.attributes.find((entry) => entry.key === key)?.value;
}

describe('OTLP encoding', () => {
  it('encodes a call as a GenAI execute_tool span', async () => {
    const span = await toolCallSpan(call);

    expect(span.name).toBe('execute_tool list_issues');
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.startTimeUnixNano).toBe('1789128000000000000');
    expect(attribute(span, 'gen_ai.tool.name')).toEqual({
      stringValue: 'list_issues',
    });
    expect(attribute(span, 'gen_ai.conversation.id')).toEqual({
      stringValue: 'conversation-1',
    });
    expect(attribute(span, 'sealgate.web_agent.site')).toEqual({
      stringValue: 'claude',
    });
    expect(attribute(span, 'sealgate.web_agent.app')).toEqual({
      stringValue: 'Linear',
    });
    expect(attribute(span, 'sealgate.web_agent.tool_index')).toEqual({
      intValue: '2',
    });
  });

  it('puts every call of a conversation in one trace, with stable IDs', async () => {
    const first = await toolCallSpan(call);
    const again = await toolCallSpan({ ...call });
    const sibling = await toolCallSpan({ ...call, id: 'toolu_2' });
    const elsewhere = await toolCallSpan({
      ...call,
      conversationId: 'conversation-2',
    });

    expect(again).toEqual(first);
    expect(sibling.traceId).toBe(first.traceId);
    expect(sibling.spanId).not.toBe(first.spanId);
    expect(elsewhere.traceId).not.toBe(first.traceId);
  });

  it('keys a call without a conversation by its turn', async () => {
    const unsaved = { ...call, conversationId: null };

    expect(sessionKey(unsaved)).toBe('claude:turn:message-1');
    expect(
      attribute(await toolCallSpan(unsaved), 'gen_ai.conversation.id'),
    ).toBeUndefined();
  });

  it('wraps spans in one resource', async () => {
    const request = await traceRequest([call], '1.2.3');
    const [resourceSpans] = request.resourceSpans;

    expect(resourceSpans.resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'sealgate-web-extension' },
    });
    expect(resourceSpans.scopeSpans[0].scope.version).toBe('1.2.3');
    expect(resourceSpans.scopeSpans[0].spans).toHaveLength(1);
  });

  it.each([
    [
      'https://collector.example.com:4318',
      'https://collector.example.com:4318/v1/traces',
    ],
    ['https://example.com/otlp/', 'https://example.com/otlp/v1/traces'],
    [
      'https://example.com/otlp/v1/traces',
      'https://example.com/otlp/v1/traces',
    ],
  ])('resolves the traces URL of %s', (endpoint, expected) => {
    expect(tracesUrl(endpoint)).toBe(expected);
  });
});
