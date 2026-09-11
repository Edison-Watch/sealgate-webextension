// OAuth 2.1 authorization-code flow with PKCE against a Sealgate instance.
// The client registers itself dynamically (RFC 7591) with the browser's
// extension redirect URL, and the browser runs the login in its own window.

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  // Epoch milliseconds, or null when the server gave no lifetime.
  expiresAt: number | null;
}

export interface SealgateSession extends TokenSet {
  baseUrl: string;
  clientId: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
}

export const sealgateScope = 'telemetry offline_access';
const clientName = 'Sealgate Tool Tracker';

export type LaunchAuthFlow = (url: string) => Promise<string | undefined>;

export interface OAuthDeps {
  fetch: typeof fetch;
  launchAuthFlow: LaunchAuthFlow;
  redirectUrl: string;
  now?: () => number;
}

export function normalizeBaseUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The Sealgate URL must start with https://.');
  }
  return url.origin;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as Record<string, unknown>;
      detail = String(
        body.error_description ?? body.error ?? body.detail ?? '',
      );
    } catch {
      // The status alone is reported below.
    }
    throw new Error(
      `${what} failed (${response.status})${detail ? `: ${detail}` : ''}.`,
    );
  }
  return response.json();
}

export async function discover(
  baseUrl: string,
  deps: Pick<OAuthDeps, 'fetch'>,
): Promise<AuthServerMetadata> {
  let response: Response;
  try {
    response = await deps.fetch(
      `${baseUrl}/.well-known/oauth-authorization-server`,
    );
  } catch {
    throw new Error(`Could not reach ${baseUrl}.`);
  }
  const metadata = (await readJson(
    response,
    'Reading the Sealgate login settings',
  )) as Partial<AuthServerMetadata>;
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error(`${baseUrl} does not look like a Sealgate instance.`);
  }
  return metadata as AuthServerMetadata;
}

async function register(
  metadata: AuthServerMetadata,
  deps: OAuthDeps,
): Promise<string> {
  if (!metadata.registration_endpoint) {
    throw new Error('This Sealgate instance does not accept new clients.');
  }
  const response = await deps.fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [deps.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: sealgateScope,
    }),
  });
  const body = (await readJson(response, 'Registering the extension')) as {
    client_id?: string;
  };
  if (!body.client_id) {
    throw new Error('Sealgate did not return a client ID.');
  }
  return body.client_id;
}

function tokenSet(body: Record<string, unknown>, now: number): TokenSet {
  if (typeof body.access_token !== 'string') {
    throw new Error('Sealgate did not return an access token.');
  }
  return {
    accessToken: body.access_token,
    refreshToken:
      typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresAt:
      typeof body.expires_in === 'number' ? now + body.expires_in * 1000 : null,
  };
}

async function requestToken(
  tokenEndpoint: string,
  params: Record<string, string>,
  deps: Pick<OAuthDeps, 'fetch' | 'now'>,
): Promise<TokenSet> {
  const response = await deps.fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await readJson(response, 'Signing in')) as Record<
    string,
    unknown
  >;
  return tokenSet(body, (deps.now ?? Date.now)());
}

export async function signIn(
  input: string,
  deps: OAuthDeps,
): Promise<SealgateSession> {
  const baseUrl = normalizeBaseUrl(input);
  const metadata = await discover(baseUrl, deps);
  const clientId = await register(metadata, deps);
  const verifier = randomToken();
  const state = randomToken(16);

  const authorizeUrl = new URL(metadata.authorization_endpoint);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: deps.redirectUrl,
    scope: sealgateScope,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    resource: baseUrl,
  }).toString();

  const responseUrl = await deps.launchAuthFlow(authorizeUrl.toString());
  if (!responseUrl) {
    throw new Error('Sign-in was cancelled.');
  }
  const params = new URL(responseUrl).searchParams;
  if (params.get('error')) {
    throw new Error(
      params.get('error_description') ??
        `Sign-in failed: ${params.get('error')}.`,
    );
  }
  if (params.get('state') !== state) {
    throw new Error('Sign-in failed: the response did not match the request.');
  }
  const code = params.get('code');
  if (!code) {
    throw new Error('Sign-in failed: no authorization code was returned.');
  }

  const tokens = await requestToken(
    metadata.token_endpoint,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: deps.redirectUrl,
      client_id: clientId,
      code_verifier: verifier,
      resource: baseUrl,
    },
    deps,
  );

  return {
    ...tokens,
    baseUrl,
    clientId,
    tokenEndpoint: metadata.token_endpoint,
    revocationEndpoint: metadata.revocation_endpoint ?? null,
  };
}

export async function refresh(
  session: SealgateSession,
  deps: Pick<OAuthDeps, 'fetch' | 'now'>,
): Promise<SealgateSession> {
  if (!session.refreshToken) {
    throw new Error('The Sealgate session has expired. Sign in again.');
  }
  const tokens = await requestToken(
    session.tokenEndpoint,
    {
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: session.clientId,
      resource: session.baseUrl,
    },
    deps,
  );
  return {
    ...session,
    ...tokens,
    refreshToken: tokens.refreshToken ?? session.refreshToken,
  };
}

export async function revoke(
  session: SealgateSession,
  deps: Pick<OAuthDeps, 'fetch'>,
): Promise<void> {
  if (!session.revocationEndpoint) {
    return;
  }
  const token = session.refreshToken ?? session.accessToken;
  await deps
    .fetch(session.revocationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        client_id: session.clientId,
      }).toString(),
    })
    .catch(() => undefined);
}
