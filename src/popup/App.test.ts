import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';

describe('extension popup', () => {
  const addListener = vi.fn();
  const removeListener = vi.fn();
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockResolvedValue({
      ok: true,
      state: { paused: false, calls: [] },
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        onMessage: { addListener, removeListener },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the success message', () => {
    render(App);

    expect(screen.getByText('Hooray, the extension works!')).toBeTruthy();
  });

  it('lists calls returned by the in-memory tracker', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      state: {
        paused: false,
        calls: [
          {
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
    expect(screen.getByText('1')).toBeTruthy();
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
