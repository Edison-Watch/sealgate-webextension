import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '../shared/destination';
import Connection from './Connection.svelte';

const disconnected: ConnectionState = {
  destination: null,
  status: { pending: 0, lastExportAt: null, lastError: null },
  signingIn: false,
  signInError: null,
};

describe('connection panel', () => {
  const sendMessage = vi.fn();
  const requestPermission = vi.fn();

  function answer(connection: ConnectionState): void {
    sendMessage.mockResolvedValue({ ok: true, connection });
  }

  beforeEach(() => {
    answer(disconnected);
    requestPermission.mockResolvedValue(true);
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      permissions: { request: requestPermission },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('signs in to the official instance from the big button', async () => {
    render(Connection);

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Log in to Sealgate' }),
    );

    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'connection:signIn',
      baseUrl: 'https://dashboard.sealgate.ai',
    });
  });

  it('signs in to a self-hosted instance', async () => {
    render(Connection);

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Use a self-hosted Sealgate' }),
    );
    await fireEvent.input(screen.getByLabelText('Sealgate address'), {
      target: { value: 'http://localhost:3001/dashboard' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'connection:signIn',
      baseUrl: 'http://localhost:3001',
    });
  });

  it('saves an OpenTelemetry endpoint and asks for access to its host', async () => {
    render(Connection);

    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Use an OpenTelemetry endpoint',
      }),
    );
    await fireEvent.input(screen.getByLabelText('OTLP/HTTP endpoint'), {
      target: { value: 'https://collector.example.com:4318' },
    });
    await fireEvent.input(screen.getByLabelText(/Headers/), {
      target: { value: 'x-api-key: secret' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'connection:useOtlp',
      endpoint: 'https://collector.example.com:4318/',
      headers: { 'x-api-key': 'secret' },
    });
    await vi.waitFor(() =>
      expect(requestPermission).toHaveBeenCalledWith({
        origins: ['https://collector.example.com/*'],
      }),
    );
  });

  it('shows where calls go and failed exports', async () => {
    answer({
      ...disconnected,
      destination: {
        kind: 'sealgate',
        baseUrl: 'http://localhost:3001',
        official: false,
      },
      status: { pending: 2, lastExportAt: null, lastError: 'Offline.' },
    });

    render(Connection);

    const link = await screen.findByRole('link', { name: 'localhost:3001' });
    expect(link.getAttribute('href')).toBe(
      'http://localhost:3001/dashboard/web-agents',
    );
    expect(
      screen.getByRole('alert').textContent?.replace(/\s+/g, ' '),
    ).toContain('2 calls not sent: Offline.');

    await fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'connection:disconnect',
    });
  });

  it('follows a sign-in running in the background', async () => {
    answer({ ...disconnected, signingIn: true });

    render(Connection);

    expect(
      (await screen.findByRole('status')).textContent?.includes(
        'Finish signing in',
      ),
    ).toBe(true);
  });
});
