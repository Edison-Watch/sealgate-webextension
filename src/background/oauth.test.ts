import { describe, expect, it, vi } from 'vitest';
import {
  normalizeBaseUrl,
  pkceChallenge,
  refresh,
  signIn,
  type SealgateSession,
} from './oauth';

const baseUrl = 'https://sealgate.example.com';
const redirectUrl = 'https://abcdef.chromiumapp.org/';
const metadata = {
  issuer: baseUrl,
  authorization_endpoint: `${baseUrl}/oauth/authorize`,
  token_endpoint: `${baseUrl}/oauth/token`,
  registration_endpoint: `${baseUrl}/oauth/register`,
  revocation_endpoint: `${baseUrl}/oauth/revoke`,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function server(tokenBody: Record<string, unknown> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return json(metadata);
    }
    if (url === metadata.registration_endpoint) {
      return json({ client_id: 'sgc_1' }, 201);
    }
    if (url === metadata.token_endpoint) {
      expect(init?.method).toBe('POST');
      return json({
        access_token: 'sgo_at_1',
        refresh_token: 'sgo_rt_1',
        expires_in: 3600,
        ...tokenBody,
      });
    }
    return json({ error: 'not_found' }, 404);
  });
}

// Plays the browser: approves the request by redirecting with a code.
function approve(url: string): Promise<string> {
  const request = new URL(url).searchParams;
  return Promise.resolve(
    `${request.get('redirect_uri')}?code=code-1&state=${request.get('state')}`,
  );
}

describe('Sealgate sign-in', () => {
  it('registers, authorizes with PKCE and exchanges the code', async () => {
    const fetch = server();
    const launchAuthFlow = vi.fn(approve);

    const session = await signIn(`${baseUrl}/dashboard`, {
      fetch,
      launchAuthFlow,
      redirectUrl,
      now: () => 1_000,
    });

    expect(session).toEqual({
      baseUrl,
      clientId: 'sgc_1',
      accessToken: 'sgo_at_1',
      refreshToken: 'sgo_rt_1',
      expiresAt: 3_601_000,
      tokenEndpoint: metadata.token_endpoint,
      revocationEndpoint: metadata.revocation_endpoint,
    });

    const registration = JSON.parse(String(fetch.mock.calls[1][1]?.body));
    expect(registration.redirect_uris).toEqual([redirectUrl]);
    expect(registration.scope).toBe('telemetry offline_access');

    const authorize = new URL(launchAuthFlow.mock.calls[0][0]).searchParams;
    expect(authorize.get('client_id')).toBe('sgc_1');
    expect(authorize.get('code_challenge_method')).toBe('S256');
    expect(authorize.get('scope')).toBe('telemetry offline_access');

    const exchange = new URLSearchParams(String(fetch.mock.calls[2][1]?.body));
    expect(exchange.get('grant_type')).toBe('authorization_code');
    expect(exchange.get('code')).toBe('code-1');
    expect(await pkceChallenge(exchange.get('code_verifier') ?? '')).toBe(
      authorize.get('code_challenge'),
    );
  });

  it('rejects a response whose state does not match', async () => {
    await expect(
      signIn(baseUrl, {
        fetch: server(),
        launchAuthFlow: async () => `${redirectUrl}?code=x&state=forged`,
        redirectUrl,
      }),
    ).rejects.toThrow('did not match');
  });

  it('reports a denied consent', async () => {
    await expect(
      signIn(baseUrl, {
        fetch: server(),
        launchAuthFlow: async () =>
          `${redirectUrl}?error=access_denied&error_description=The+user+said+no`,
        redirectUrl,
      }),
    ).rejects.toThrow('The user said no');
  });

  it('explains an address that is not a Sealgate instance', async () => {
    const fetch = vi.fn(async () => json({}, 404));

    await expect(
      signIn(baseUrl, { fetch, launchAuthFlow: approve, redirectUrl }),
    ).rejects.toThrow('Reading the Sealgate login settings failed (404)');
  });

  it('refreshes and keeps the old refresh token when none is returned', async () => {
    const session: SealgateSession = {
      baseUrl,
      clientId: 'sgc_1',
      accessToken: 'old',
      refreshToken: 'sgo_rt_old',
      expiresAt: 0,
      tokenEndpoint: metadata.token_endpoint,
      revocationEndpoint: null,
    };

    const refreshed = await refresh(session, {
      fetch: server({ access_token: 'new', refresh_token: undefined }),
      now: () => 0,
    });

    expect(refreshed.accessToken).toBe('new');
    expect(refreshed.refreshToken).toBe('sgo_rt_old');
  });

  it('accepts only web addresses', () => {
    expect(normalizeBaseUrl(' http://localhost:3001/ ')).toBe(
      'http://localhost:3001',
    );
    expect(() => normalizeBaseUrl('ftp://example.com')).toThrow();
  });
});
