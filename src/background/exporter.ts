import {
  sealgateOtlpEndpoint,
  type Destination,
  type ExportStatus,
  type SealgateDestination,
} from '../shared/destination';
import { traceRequest, tracesUrl } from '../shared/otlp';
import { callKey, type ToolCallRecord } from '../shared/tracker';
import { refresh } from './oauth';

// Persists the destination and the calls still waiting to be exported, and
// sends them as OTLP traces. Calls stay queued until the receiver accepts
// them, so a call recorded while offline is sent on a later flush.

export const maxQueuedCalls = 1000;
const batchSize = 100;
const refreshSkewMs = 60_000;

export interface ExportStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface ExporterDeps {
  store: ExportStore;
  fetch: typeof fetch;
  version: string;
  now?: () => number;
  onChange?: () => void;
}

const destinationKey = 'destination';
const queueKey = 'exportQueue';
const statusKey = 'exportStatus';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Exporter {
  private queue = Promise.resolve();

  constructor(private readonly deps: ExporterDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  // Store writes and flushes run one at a time, in order.
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async destination(): Promise<Destination | null> {
    return ((await this.deps.store.get(destinationKey)) as Destination) ?? null;
  }

  async status(): Promise<ExportStatus> {
    const queued = await this.queued();
    const stored = (await this.deps.store.get(statusKey)) as
      Omit<ExportStatus, 'pending'> | undefined;
    return {
      pending: queued.length,
      lastExportAt: stored?.lastExportAt ?? null,
      lastError: stored?.lastError ?? null,
    };
  }

  private async queued(): Promise<ToolCallRecord[]> {
    return ((await this.deps.store.get(queueKey)) as ToolCallRecord[]) ?? [];
  }

  private async setStatus(
    update: Partial<Omit<ExportStatus, 'pending'>>,
  ): Promise<void> {
    const current = await this.status();
    await this.deps.store.set(statusKey, {
      lastExportAt: current.lastExportAt,
      lastError: current.lastError,
      ...update,
    });
  }

  // Replaces the destination. Calls queued for the previous one are dropped
  // and `backfill` (the calls already recorded) is queued for the new one.
  connect(
    destination: Destination | null,
    backfill: readonly ToolCallRecord[] = [],
  ): Promise<void> {
    return this.serial(async () => {
      await this.deps.store.set(destinationKey, destination);
      await this.deps.store.set(
        queueKey,
        destination ? backfill.slice(-maxQueuedCalls) : [],
      );
      await this.deps.store.set(statusKey, {
        lastExportAt: null,
        lastError: null,
      });
      this.deps.onChange?.();
    }).then(() => this.flush());
  }

  enqueue(calls: readonly ToolCallRecord[]): Promise<void> {
    if (calls.length === 0) {
      return Promise.resolve();
    }
    return this.serial(async () => {
      if (!(await this.destination())) {
        return;
      }
      const queued = await this.queued();
      const known = new Set(queued.map(callKey));
      const next = [
        ...queued,
        ...calls.filter((call) => !known.has(callKey(call))),
      ];
      await this.deps.store.set(queueKey, next.slice(-maxQueuedCalls));
      this.deps.onChange?.();
    }).then(() => this.flush());
  }

  flush(): Promise<void> {
    return this.serial(async () => {
      const destination = await this.destination();
      let queued = await this.queued();
      if (!destination || queued.length === 0) {
        return;
      }

      try {
        while (queued.length > 0) {
          const batch = queued.slice(0, batchSize);
          await this.send(destination, batch);
          queued = queued.slice(batch.length);
          await this.deps.store.set(queueKey, queued);
        }
        await this.setStatus({
          lastExportAt: new Date(this.now()).toISOString(),
          lastError: null,
        });
      } catch (error) {
        await this.setStatus({
          lastError:
            error instanceof Error ? error.message : 'The export failed.',
        });
      }
      this.deps.onChange?.();
    });
  }

  private async send(
    destination: Destination,
    calls: ToolCallRecord[],
  ): Promise<void> {
    const body = JSON.stringify(await traceRequest(calls, this.deps.version));

    if (destination.kind === 'otlp') {
      await this.post(destination.endpoint, destination.headers, body);
      return;
    }

    let session = await this.freshSession(destination, false);
    try {
      await this.postToSealgate(session, body);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) {
        throw error;
      }
      session = await this.freshSession(session, true);
      await this.postToSealgate(session, body);
    }
  }

  private postToSealgate(
    session: SealgateDestination,
    body: string,
  ): Promise<void> {
    return this.post(
      sealgateOtlpEndpoint(session.baseUrl),
      { Authorization: `Bearer ${session.accessToken}` },
      body,
    );
  }

  private async freshSession(
    session: SealgateDestination,
    force: boolean,
  ): Promise<SealgateDestination> {
    const expiring =
      session.expiresAt !== null &&
      session.expiresAt - refreshSkewMs <= this.now();
    if (!force && !expiring) {
      return session;
    }
    const refreshed = {
      ...(await refresh(session, this.deps)),
      kind: 'sealgate' as const,
    };
    await this.deps.store.set(destinationKey, refreshed);
    return refreshed;
  }

  private async post(
    endpoint: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.deps.fetch(tracesUrl(endpoint), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      throw new Error(`Could not reach ${new URL(endpoint).origin}.`);
    }
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `The endpoint rejected the export (${response.status}).`,
      );
    }
  }
}
