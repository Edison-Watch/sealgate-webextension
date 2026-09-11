import type { SiteId, ToolCallRecord } from './tracker';

// OTLP/HTTP JSON encoding of recorded tool calls. Each call becomes one span;
// the calls of one conversation share a trace, so a trace is a session.
// IDs are derived from the call itself, so re-sending a call after a failed
// export produces the same span and receivers can deduplicate it.

export const instrumentationName = 'sealgate-web-extension';

const providerNames: Record<SiteId, string> = {
  chatgpt: 'openai',
  claude: 'anthropic',
};

type AnyValue =
  { stringValue: string } | { intValue: string } | { boolValue: boolean };

export interface KeyValue {
  key: string;
  value: AnyValue;
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: KeyValue[];
  status: { code: number };
}

export interface OtlpTraceRequest {
  resourceSpans: {
    resource: { attributes: KeyValue[] };
    scopeSpans: {
      scope: { name: string; version: string };
      spans: OtlpSpan[];
    }[];
  }[];
}

const spanKindInternal = 1;
const statusCodeOk = 1;

function stringAttribute(key: string, value: string): KeyValue {
  return { key, value: { stringValue: value } };
}

async function hexDigest(input: string, length: number): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

// A call with no conversation ID yet (a ChatGPT chat before the server saved
// it) is its own trace, keyed by its turn.
export function sessionKey(call: ToolCallRecord): string {
  return `${call.site}:${call.conversationId ?? `turn:${call.turnId}`}`;
}

function unixNano(timestamp: string): string {
  return `${Date.parse(timestamp)}000000`;
}

export async function toolCallSpan(call: ToolCallRecord): Promise<OtlpSpan> {
  const attributes: KeyValue[] = [
    stringAttribute('gen_ai.operation.name', 'execute_tool'),
    stringAttribute('gen_ai.tool.name', call.toolName),
    stringAttribute('gen_ai.provider.name', providerNames[call.site]),
    stringAttribute('sealgate.web_agent.site', call.site),
    stringAttribute('sealgate.web_agent.app', call.appName),
    stringAttribute('sealgate.web_agent.call_id', call.id),
    stringAttribute('sealgate.web_agent.turn_id', call.turnId),
    {
      key: 'sealgate.web_agent.tool_index',
      value: { intValue: String(call.toolIndex) },
    },
  ];
  if (call.conversationId !== null) {
    attributes.push(
      stringAttribute('gen_ai.conversation.id', call.conversationId),
    );
  }

  const time = unixNano(call.detectedAt);
  return {
    traceId: await hexDigest(sessionKey(call), 32),
    spanId: await hexDigest(`${call.site}:${call.id}`, 16),
    name: `execute_tool ${call.toolName}`,
    kind: spanKindInternal,
    startTimeUnixNano: time,
    endTimeUnixNano: time,
    attributes,
    status: { code: statusCodeOk },
  };
}

export async function traceRequest(
  calls: readonly ToolCallRecord[],
  version: string,
): Promise<OtlpTraceRequest> {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            stringAttribute('service.name', instrumentationName),
            stringAttribute('service.version', version),
          ],
        },
        scopeSpans: [
          {
            scope: { name: instrumentationName, version },
            spans: await Promise.all(calls.map(toolCallSpan)),
          },
        ],
      },
    ],
  };
}

// OTLP/HTTP exporters append the signal path to a base endpoint unless the
// endpoint already names it.
export function tracesUrl(endpoint: string): string {
  const url = new URL(endpoint);
  if (!url.pathname.endsWith('/v1/traces')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1/traces`;
  }
  return url.toString();
}
