import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Destination, SealgateDestination } from '../shared/destination';
import type { ToolCallRecord } from '../shared/tracker';
import { Exporter, maxQueuedCalls, type ExportStore } from './exporter';

function record(id: string): ToolCallRecord {
  return {
    site: 'chatgpt',
    id,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    appName: 'github',
    toolName: 'search',
    toolIndex: 1,
    detectedAt: '2026-09-11T12:00:00.000Z',
  };
}

function memoryStore(): ExportStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => {
      data.set(key, value);
    },
  };
}

const otlp: Destination = {
  kind: 'otlp',
  endpoint: 'https://collector.example.com:4318',
  headers: { 'x-api-key': 'secret' },
};

const sealgate: SealgateDestination = {
  kind: 'sealgate',
  baseUrl: 'https://sealgate.example.com',
  clientId: 'sgc_1',
  tokenEndpoint: 'https://sealgate.example.com/oauth/token',
  revocationEndpoint: null,
  accessToken: 'expired-token',
  refreshToken: 'sgo_rt_1',
  expiresAt: null,
};

function spanCount(init: RequestInit | undefined): number {
  const body = JSON.parse(String(init?.body));
  return body.resourceSpans[0].scopeSpans[0].spans.length;
}

describe('Exporter', () => {
  let store: ReturnType<typeof memoryStore>;

  beforeEach(() => {
    store = memoryStore();
  });

  it('does not queue calls before a destination is chosen', async () => {
    const fetch = vi.fn();
    const exporter = new Exporter({ store, fetch, version: '1' });

    await exporter.enqueue([record('a')]);

    expect(fetch).not.toHaveBeenCalled();
    expect((await exporter.status()).pending).toBe(0);
  });

  it('sends the recorded calls when connected, then new calls', async () => {
    const fetch = vi.fn(async () => new Response('{}'));
    const exporter = new Exporter({
      store,
      fetch,
      version: '1',
      now: () => Date.parse('2026-09-11T13:00:00Z'),
    });

    await exporter.connect(otlp, [record('a'), record('b')]);
    await exporter.enqueue([record('c')]);

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://collector.example.com:4318/v1/traces');
    expect(init.headers).toMatchObject({
      'x-api-key': 'secret',
      'Content-Type': 'application/json',
    });
    expect(spanCount(init)).toBe(2);
    expect(await exporter.status()).toEqual({
      pending: 0,
      lastExportAt: '2026-09-11T13:00:00.000Z',
      lastError: null,
    });
  });

  it('keeps calls queued when the export fails, and sends them later', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(new Response('{}'));
    const exporter = new Exporter({ store, fetch, version: '1' });

    await exporter.connect(otlp, [record('a')]);
    expect(await exporter.status()).toMatchObject({
      pending: 1,
      lastError: 'Could not reach https://collector.example.com:4318.',
    });

    await exporter.flush();
    expect(await exporter.status()).toMatchObject({
      pending: 0,
      lastError: null,
    });
  });

  it('does not queue a call twice', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const exporter = new Exporter({ store, fetch, version: '1' });

    await exporter.connect(otlp);
    await exporter.enqueue([record('a')]);
    await exporter.enqueue([record('a'), record('b')]);

    expect((await exporter.status()).pending).toBe(2);
  });

  it('caps the queue', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const exporter = new Exporter({ store, fetch, version: '1' });
    const many = Array.from({ length: maxQueuedCalls + 5 }, (_, index) =>
      record(`call-${index}`),
    );

    await exporter.connect(otlp, many);

    expect((await exporter.status()).pending).toBe(maxQueuedCalls);
  });

  it('refreshes a rejected Sealgate token once and retries', async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === sealgate.tokenEndpoint) {
          return new Response(
            JSON.stringify({ access_token: 'fresh-token', expires_in: 3600 }),
          );
        }
        const auth = (init?.headers as Record<string, string>).Authorization;
        return new Response('{}', {
          status: auth === 'Bearer fresh-token' ? 200 : 401,
        });
      },
    );
    const exporter = new Exporter({ store, fetch, version: '1' });

    await exporter.connect(sealgate, [record('a')]);

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://sealgate.example.com/otlp/v1/traces',
      sealgate.tokenEndpoint,
      'https://sealgate.example.com/otlp/v1/traces',
    ]);
    expect(await exporter.destination()).toMatchObject({
      kind: 'sealgate',
      accessToken: 'fresh-token',
      refreshToken: 'sgo_rt_1',
    });
    expect((await exporter.status()).pending).toBe(0);
  });

  it('drops the queue on disconnect', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const exporter = new Exporter({ store, fetch, version: '1' });

    await exporter.connect(otlp, [record('a')]);
    await exporter.connect(null);

    expect(await exporter.destination()).toBeNull();
    expect((await exporter.status()).pending).toBe(0);
  });
});
