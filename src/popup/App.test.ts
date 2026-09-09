import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';

describe('extension popup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the success message', () => {
    render(App);

    expect(screen.getByText('Hooray, the extension works!')).toBeTruthy();
  });

  it('closes the popup when Close is clicked', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    render(App);

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(close).toHaveBeenCalledOnce();
  });
});
