<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    ToolCallRecord,
    TrackerRequest,
    TrackerResponse,
    TrackerState,
    TrackerStateChangedMessage,
  } from '../shared/tracker';

  let calls: ToolCallRecord[] = [];
  let paused = false;
  let loading = true;
  let busy = false;
  let error = '';

  function applyState(state: TrackerState): void {
    calls = [...state.calls].reverse();
    paused = state.paused;
  }

  async function sendRequest(request: TrackerRequest): Promise<void> {
    busy = true;
    error = '';

    try {
      const response = (await chrome.runtime.sendMessage(
        request,
      )) as TrackerResponse;
      if (!response.ok || !response.state) {
        throw new Error(
          response.error ?? 'The tracker did not return its state.',
        );
      }
      applyState(response.state);
    } catch (requestError) {
      error =
        requestError instanceof Error
          ? requestError.message
          : 'The tracker could not be reached.';
    } finally {
      busy = false;
      loading = false;
    }
  }

  function formatTime(timestamp: string): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(timestamp));
  }

  onMount(() => {
    const runtime = chrome.runtime;
    const stateListener = (message: unknown): void => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'tracker:stateChanged'
      ) {
        applyState((message as TrackerStateChangedMessage).state);
      }
    };

    runtime.onMessage.addListener(stateListener);
    void sendRequest({ type: 'tracker:getState' });

    return () => runtime.onMessage.removeListener(stateListener);
  });

  function closePopup(): void {
    window.close();
  }
</script>

<main>
  <header>
    <div>
      <p class="eyebrow">Sealgate</p>
      <h1>ChatGPT tool calls</h1>
    </div>
    <span class:paused class="status">{paused ? 'Paused' : 'Listening'}</span>
  </header>

  <div class="controls">
    <button
      class="primary"
      type="button"
      disabled={loading || busy}
      on:click={() =>
        sendRequest({ type: 'tracker:setPaused', paused: !paused })}
    >
      {paused ? 'Resume listening' : 'Pause listening'}
    </button>
    <button
      class="secondary"
      type="button"
      disabled={loading || busy || calls.length === 0}
      on:click={() => sendRequest({ type: 'tracker:clearCalls' })}>Clear</button
    >
  </div>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <section aria-labelledby="calls-heading">
    <div class="section-heading">
      <h2 id="calls-heading">Detected calls</h2>
      <span class="count">{calls.length}</span>
    </div>

    {#if loading}
      <p class="empty">Loading tracker…</p>
    {:else if calls.length === 0}
      <p class="empty">
        No tool calls detected yet. Use a tool in an open ChatGPT conversation.
      </p>
    {:else}
      <ol aria-label="Detected tool calls">
        {#each calls as call (call.id)}
          <li>
            <div class="call-heading">
              <strong>{call.toolName}</strong>
              <time datetime={call.detectedAt}
                >{formatTime(call.detectedAt)}</time
              >
            </div>
            <span class="app-name">{call.appName}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <footer>
    <button class="close" type="button" on:click={closePopup}>Close</button>
  </footer>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    min-width: 390px;
    background: #f5f7fb;
    color: #172033;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  main {
    display: grid;
    gap: 16px;
    padding: 18px;
  }

  header,
  .section-heading,
  .call-heading,
  footer {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: 19px;
    line-height: 1.25;
  }

  h2 {
    font-size: 14px;
  }

  .eyebrow {
    color: #657089;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.08em;
    margin-bottom: 2px;
    text-transform: uppercase;
  }

  .status,
  .count {
    background: #dcfce7;
    border-radius: 999px;
    color: #166534;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 9px;
  }

  .status.paused {
    background: #fef3c7;
    color: #92400e;
  }

  .count {
    background: #e7ebf5;
    color: #3f4c66;
    min-width: 24px;
    text-align: center;
  }

  .controls {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr auto;
  }

  button {
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font: inherit;
    font-weight: 700;
    padding: 9px 13px;
  }

  button.primary {
    background: #3157d5;
    color: #ffffff;
  }

  button.primary:hover:not(:disabled) {
    background: #2848b3;
  }

  button.secondary {
    background: #e7ebf5;
    color: #28344d;
  }

  button.secondary:hover:not(:disabled) {
    background: #d8deeb;
  }

  button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  button:focus-visible {
    outline: 3px solid #93a8f5;
    outline-offset: 2px;
  }

  section {
    background: #ffffff;
    border: 1px solid #e2e6ef;
    border-radius: 12px;
    overflow: hidden;
  }

  .section-heading {
    border-bottom: 1px solid #e8ebf2;
    padding: 12px 14px;
  }

  .empty {
    color: #657089;
    font-size: 13px;
    line-height: 1.45;
    padding: 24px 20px;
    text-align: center;
  }

  ol {
    list-style: none;
    margin: 0;
    max-height: 340px;
    overflow-y: auto;
    padding: 0;
  }

  li {
    border-bottom: 1px solid #edf0f5;
    display: grid;
    gap: 4px;
    padding: 11px 14px;
  }

  li:last-child {
    border-bottom: 0;
  }

  .call-heading {
    gap: 12px;
  }

  strong {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  time,
  .app-name,
  footer {
    color: #657089;
    font-size: 11px;
  }

  .app-name {
    font-size: 12px;
  }

  .error {
    background: #fee2e2;
    border-radius: 8px;
    color: #991b1b;
    font-size: 12px;
    padding: 9px 11px;
  }

  footer {
    border-top: 1px solid #e2e6ef;
    justify-content: flex-end;
    padding-top: 12px;
  }

  button.close {
    background: transparent;
    color: #4e5b74;
    font-size: 12px;
    padding: 4px 6px;
  }

  button.close:hover {
    color: #172033;
  }
</style>
