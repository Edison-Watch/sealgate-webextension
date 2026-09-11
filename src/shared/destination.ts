// Where recorded tool calls are exported, and the popup-facing view of it.

export const officialSealgateUrl: string =
  import.meta.env.VITE_SEALGATE_URL ?? 'https://dashboard.sealgate.ai';

export interface SealgateDestination {
  kind: 'sealgate';
  baseUrl: string;
  clientId: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export interface OtlpDestination {
  kind: 'otlp';
  endpoint: string;
  headers: Record<string, string>;
}

export type Destination = SealgateDestination | OtlpDestination;

export interface ExportStatus {
  pending: number;
  lastExportAt: string | null;
  lastError: string | null;
}

// What the popup sees: never the tokens or custom headers.
export type DestinationSummary =
  | { kind: 'sealgate'; baseUrl: string; official: boolean }
  | { kind: 'otlp'; endpoint: string };

export interface ConnectionState {
  destination: DestinationSummary | null;
  status: ExportStatus;
  // A sign-in runs in the background, so it outlives the popup that started
  // it; a reopened popup reads its progress and outcome from here.
  signingIn: boolean;
  signInError: string | null;
}

export type ConnectionRequest =
  | { type: 'connection:get' }
  | { type: 'connection:signIn'; baseUrl: string }
  | {
      type: 'connection:useOtlp';
      endpoint: string;
      headers: Record<string, string>;
    }
  | { type: 'connection:disconnect' }
  | { type: 'connection:retry' };

export interface ConnectionResponse {
  ok: boolean;
  connection?: ConnectionState;
  error?: string;
}

export interface ConnectionChangedMessage {
  type: 'connection:changed';
  connection: ConnectionState;
}

export const connectionRequestTypes: ReadonlySet<string> = new Set([
  'connection:get',
  'connection:signIn',
  'connection:useOtlp',
  'connection:disconnect',
  'connection:retry',
]);

export function summarize(
  destination: Destination | null,
): DestinationSummary | null {
  if (!destination) {
    return null;
  }
  return destination.kind === 'sealgate'
    ? {
        kind: 'sealgate',
        baseUrl: destination.baseUrl,
        official: destination.baseUrl === new URL(officialSealgateUrl).origin,
      }
    : { kind: 'otlp', endpoint: destination.endpoint };
}

// Sealgate instances receive traces at the same OTLP path any collector uses.
export function sealgateOtlpEndpoint(baseUrl: string): string {
  return `${baseUrl}/otlp`;
}

// Parses `Name: value` lines, one header per line.
export function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf(':');
    if (separator <= 0) {
      throw new Error(`Header "${trimmed}" must look like "Name: value".`);
    }
    headers[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim();
  }
  return headers;
}

// Host-permission pattern for the host of a URL the user entered. Match
// patterns cannot name a port, and one without a port matches every port.
export function originPattern(url: string): string {
  const { protocol, hostname } = new URL(url);
  return `${protocol}//${hostname}/*`;
}
