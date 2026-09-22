<script lang="ts">
  import { onMount } from 'svelte';
  import {
    callKey,
    type SiteId,
    type ToolCallRecord,
    type TrackerRequest,
    type TrackerResponse,
    type TrackerState,
    type TrackerStateChangedMessage,
  } from '../shared/tracker';
  import AgentMark from './AgentMark.svelte';
  import Connection from './Connection.svelte';
  import Mark from './Mark.svelte';
  import {
    conversationUrl,
    groupCallsByConversation,
    type ConversationGroup,
  } from './conversations';

  const siteNames: Record<SiteId, string> = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
  };

  let calls: ToolCallRecord[] = [];
  let groups: ConversationGroup[] = [];
  let paused = false;
  let loading = true;
  let busy = false;
  let error = '';

  function applyState(state: TrackerState): void {
    calls = state.calls;
    groups = groupCallsByConversation(state.calls);
    paused = state.paused;
  }

  function conversationLabel(group: ConversationGroup): string {
    return group.conversationId === null
      ? 'Unsaved conversation'
      : `Conversation ${group.conversationId.slice(0, 8)}`;
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
    <div class="brand">
      <Mark size={26} />
      <div class="brand-text">
        <span class="wordmark">SealGate</span>
        <h1>Tool calls</h1>
      </div>
    </div>
    <span class={`badge ${paused ? 'badge-warning' : 'badge-success'}`}>
      <span class="badge-dot"></span>
      {paused ? 'Paused' : 'Listening'}
    </span>
  </header>

  <Connection />

  <div class="controls">
    <button
      class="btn btn-primary"
      type="button"
      disabled={loading || busy}
      on:click={() =>
        sendRequest({ type: 'tracker:setPaused', paused: !paused })}
    >
      {paused ? 'Resume listening' : 'Pause listening'}
    </button>
    <button
      class="btn btn-secondary"
      type="button"
      disabled={loading || busy || calls.length === 0}
      on:click={() => sendRequest({ type: 'tracker:clearCalls' })}>Clear</button
    >
  </div>

  {#if error}
    <p class="notice" role="alert">{error}</p>
  {/if}

  <section class="card" aria-labelledby="calls-heading">
    <div class="card-header">
      <h2 id="calls-heading">Detected calls</h2>
      <span class="badge">{calls.length}</span>
    </div>

    {#if loading}
      <p class="empty muted">Loading tracker…</p>
    {:else if calls.length === 0}
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
            <path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10" />
          </svg>
        </div>
        <p class="empty-title">No tool calls yet</p>
        <p class="muted">
          No tool calls detected yet. Use a tool in an open ChatGPT or Claude
          conversation.
        </p>
      </div>
    {:else}
      <ol class="conversations scroll" aria-label="Conversations">
        {#each groups as group (group.key)}
          {@const url = conversationUrl(group)}
          <li class="conversation">
            <div class="conversation-heading">
              <AgentMark site={group.site} size={14} />
              {#if url}
                <a
                  class="conversation-link"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={group.conversationId}>{conversationLabel(group)}</a
                >
              {:else}
                <span class="conversation-link">{conversationLabel(group)}</span
                >
              {/if}
              <span class="site-name muted">
                {siteNames[group.site]} · {group.calls.length}
                {group.calls.length === 1 ? 'call' : 'calls'}
              </span>
            </div>
            <ol
              class="calls"
              aria-label={`Tool calls in ${conversationLabel(group)}`}
            >
              {#each group.calls as call (callKey(call))}
                <li class="call">
                  <div class="call-main">
                    <strong class="mono">{call.toolName}</strong>
                    <span class="app-name muted">{call.appName}</span>
                  </div>
                  <time class="mono muted" datetime={call.detectedAt}
                    >{formatTime(call.detectedAt)}</time
                  >
                </li>
              {/each}
            </ol>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <footer>
    <button class="btn btn-ghost btn-close" type="button" on:click={closePopup}
      >Close</button
    >
  </footer>
</main>

<style>
  main {
    display: grid;
    gap: 14px;
    margin-inline: auto;
    max-width: 520px;
    padding: 16px 18px 12px;
  }

  header {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
  }

  .brand {
    align-items: center;
    color: var(--text-primary);
    display: flex;
    gap: 10px;
  }

  .brand-text {
    display: grid;
    gap: 1px;
  }

  .wordmark {
    color: var(--text-primary);
    font-family: var(--font-serif);
    font-size: 15px;
    font-weight: 400;
    letter-spacing: 0.14em;
    line-height: 1;
    text-transform: uppercase;
  }

  h1 {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    line-height: 1.2;
  }

  .controls {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr auto;
  }

  .empty {
    display: grid;
    font-size: 12px;
    gap: 6px;
    justify-items: center;
    padding: 26px 24px;
    text-align: center;
  }

  .empty-icon {
    align-items: center;
    background: var(--accent-muted);
    border-radius: 999px;
    color: var(--accent);
    display: flex;
    height: 38px;
    justify-content: center;
    margin-bottom: 4px;
    width: 38px;
  }

  .empty-title {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
  }

  .conversations {
    max-height: 340px;
    overflow-y: auto;
  }

  .conversation {
    border-bottom: 1px solid var(--border);
  }

  .conversation:last-child {
    border-bottom: 0;
  }

  .conversation-heading {
    align-items: center;
    background: color-mix(in srgb, var(--bg-base) 50%, transparent);
    color: var(--text-primary);
    display: flex;
    font-size: 12px;
    font-weight: 500;
    gap: 8px;
    padding: 8px 14px;
  }

  .conversation-link {
    color: var(--accent);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span.conversation-link {
    color: var(--text-primary);
  }

  .site-name {
    font-size: 11px;
    white-space: nowrap;
  }

  .call {
    align-items: center;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 9px 14px 9px 36px;
    position: relative;
  }

  .call::before {
    background: var(--accent);
    border-radius: 999px;
    content: '';
    height: 5px;
    left: 22px;
    opacity: 0.7;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 5px;
  }

  .call-main {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  strong {
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .app-name {
    font-size: 11px;
  }

  time {
    font-size: 11px;
    white-space: nowrap;
  }

  footer {
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
  }

  .btn-close {
    font-size: 12px;
    padding: 5px 10px;
  }
</style>
