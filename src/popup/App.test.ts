import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';

describe('extension popup', () => {
  const addListener = vi.fn();
  const removeListener = vi.fn();
  // Tracker requests; the Connection panel's requests are answered below.
  const sendMessage = vi.fn();
  const disconnected = {
    destination: null,
    status: { pending: 0, lastExportAt: null, lastError: null },
    signingIn: false,
    signInError: null,
  };

  beforeEach(() => {
    sendMessage.mockResolvedValue({
      ok: true,
      state: { paused: false, calls: [] },
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: (message: { type: string }) =>
          message.type.startsWith('connection:')
            ? Promise.resolve({ ok: true, connection: disconnected })
            : sendMessage(message),
        onMessage: { addListener, removeListener },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the popup heading', () => {
    render(App);

    expect(screen.getByRole('heading', { name: 'Tool calls' })).toBeTruthy();
  });

  it('lists calls returned by the in-memory tracker', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      state: {
        paused: false,
        calls: [
          {
            site: 'chatgpt',
            id: 'turn-1:1:microsoft_docs_search',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            appName: 'microsoft-learn',
            toolName: 'microsoft_docs_search',
            toolIndex: 1,
            detectedAt: '2026-09-11T12:00:00.000Z',
          },
        ],
      },
    });

    render(App);

    expect(await screen.findByText('microsoft_docs_search')).toBeTruthy();
    expect(screen.getByText('microsoft-learn')).toBeTruthy();
    expect(screen.getByText('ChatGPT · 1 call')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('groups calls under a link to their conversation', async () => {
    const record = {
      site: 'chatgpt',
      turnId: 'turn-1',
      appName: 'microsoft-learn',
      toolIndex: 1,
      detectedAt: '2026-09-11T12:00:00.000Z',
    };
    sendMessage.mockResolvedValue({
      ok: true,
      state: {
        paused: false,
        calls: [
          {
            ...record,
            id: 'result-1',
            conversationId: 'alpha-conversation',
            toolName: 'microsoft_docs_search',
          },
          {
            ...record,
            id: 'result-2',
            conversationId: 'bravo-conversation',
            toolName: 'microsoft_docs_fetch',
          },
          {
            ...record,
            id: 'result-3',
            conversationId: 'alpha-conversation',
            toolName: 'microsoft_code_sample_search',
          },
        ],
      },
    });

    render(App);

    const conversationA = await screen.findByRole('list', {
      name: 'Tool calls in Conversation alpha-co',
    });
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://chatgpt.com/c/alpha-conversation',
      'https://chatgpt.com/c/bravo-conversation',
    ]);
    expect(conversationA.textContent).toContain('microsoft_code_sample_search');
    expect(conversationA.textContent).toContain('microsoft_docs_search');
    expect(conversationA.textContent).not.toContain('microsoft_docs_fetch');
  });

  it('pauses listening', async () => {
    sendMessage
      .mockResolvedValueOnce({
        ok: true,
        state: { paused: false, calls: [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        state: { paused: true, calls: [] },
      });

    render(App);
    const pause = await screen.findByRole('button', {
      name: 'Pause listening',
    });
    await fireEvent.click(pause);

    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'tracker:setPaused',
      paused: true,
    });
    expect(await screen.findByText('Paused')).toBeTruthy();
  });

  it('closes the popup when Close is clicked', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    render(App);

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(close).toHaveBeenCalledOnce();
  });
});
