import {
  summarize,
  type ConnectionRequest,
  type ConnectionResponse,
  type ConnectionState,
} from '../shared/destination';
import type { ToolCallRecord } from '../shared/tracker';
import type { Exporter } from './exporter';
import { revoke, signIn, type OAuthDeps } from './oauth';

// Handles the popup's connection requests: signing in to a Sealgate
// instance, choosing a custom OTLP endpoint, and disconnecting.

export interface SignInProgress {
  get(): Promise<{ signingIn: boolean; signInError: string | null }>;
  set(progress: {
    signingIn: boolean;
    signInError: string | null;
  }): Promise<void>;
}

export interface ConnectionDeps {
  exporter: Exporter;
  progress: SignInProgress;
  oauth: OAuthDeps;
  // The calls already recorded, sent once a destination is chosen.
  recordedCalls: () => Promise<ToolCallRecord[]>;
  onChange: () => void;
}

export async function connectionState(
  deps: Pick<ConnectionDeps, 'exporter' | 'progress'>,
): Promise<ConnectionState> {
  const [destination, status, progress] = await Promise.all([
    deps.exporter.destination(),
    deps.exporter.status(),
    deps.progress.get(),
  ]);
  return { destination: summarize(destination), status, ...progress };
}

async function runSignIn(baseUrl: string, deps: ConnectionDeps): Promise<void> {
  try {
    const session = await signIn(baseUrl, deps.oauth);
    await replaceDestination(deps);
    await deps.exporter.connect(
      { kind: 'sealgate', ...session },
      await deps.recordedCalls(),
    );
    await deps.progress.set({ signingIn: false, signInError: null });
  } catch (error) {
    await deps.progress.set({
      signingIn: false,
      signInError: error instanceof Error ? error.message : 'Sign-in failed.',
    });
  }
  deps.onChange();
}

// Signing out of a Sealgate instance revokes its grant.
async function replaceDestination(deps: ConnectionDeps): Promise<void> {
  const previous = await deps.exporter.destination();
  if (previous?.kind === 'sealgate') {
    await revoke(previous, deps.oauth);
  }
}

export async function handleConnectionRequest(
  request: ConnectionRequest,
  deps: ConnectionDeps,
): Promise<ConnectionResponse> {
  switch (request.type) {
    case 'connection:get':
      break;
    case 'connection:signIn':
      await deps.progress.set({ signingIn: true, signInError: null });
      // Not awaited: the login window can outlive the popup that asked for
      // it, and the popup follows progress through `connection:changed`.
      void runSignIn(request.baseUrl, deps);
      break;
    case 'connection:useOtlp': {
      const endpoint = new URL(request.endpoint.trim()).toString();
      await replaceDestination(deps);
      await deps.exporter.connect(
        { kind: 'otlp', endpoint, headers: request.headers },
        await deps.recordedCalls(),
      );
      await deps.progress.set({ signingIn: false, signInError: null });
      break;
    }
    case 'connection:disconnect':
      await replaceDestination(deps);
      await deps.exporter.connect(null);
      await deps.progress.set({ signingIn: false, signInError: null });
      break;
    case 'connection:retry':
      await deps.exporter.flush();
      break;
  }
  return { ok: true, connection: await connectionState(deps) };
}
