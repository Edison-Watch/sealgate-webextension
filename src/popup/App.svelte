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
      <Mark size={34} />
      <div class="brand-text">
        <span class="wordmark">SealGate</span>
        <h1>Tool calls</h1>
      </div>
    </div>
    <span class={`chip ${paused ? 'chip-paused' : 'chip-active'}`}>
      <span class="chip-dot"></span>
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
      <span class="chip-count">{calls.length}</span>
    </div>

    {#if loading}
      <p class="empty muted">Loading tracker…</p>
    {:else if calls.length === 0}
      <div class="empty">
        <div class="empty-art" aria-hidden="true">
          <AgentMark site="chatgpt" size={16} />
          <span class="empty-line"></span>
          <Mark size={22} />
          <span class="empty-line"></span>
          <AgentMark site="claude" size={16} />
        </div>
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
              <span class="chip">
                <AgentMark site={group.site} size={13} />
                {#if url}
                  <a
                    class="conversation-link"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    title={group.conversationId}>{conversationLabel(group)}</a
                  >
                {:else}
                  <span class="conversation-link"
                    >{conversationLabel(group)}</span
                  >
                {/if}
              </span>
              <span class="site-name muted">
                {siteNames[group.site] ?? group.site} · {group.calls.length}
                {group.calls.length === 1 ? 'call' : 'calls'}
              </span>
            </div>
            <ol
              class="calls"
              aria-label={`Tool calls in ${conversationLabel(group)}`}
            >
              {#each group.calls as call (callKey(call))}
                <li class="call">
                  <span class="call-dot" aria-hidden="true"></span>
                  <span class="call-text">
                    <strong>{call.toolName}</strong>
                    <span class="app-name muted">{call.appName}</span>
                  </span>
                  <time class="muted" datetime={call.detectedAt}
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
    color: var(--black);
    display: flex;
    gap: 10px;
  }

  .brand-text {
    display: grid;
  }

  .wordmark {
    color: var(--black);
    font-family: var(--font-serif);
    font-size: 15px;
    letter-spacing: 0.14em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  h1 {
    color: var(--graphene);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
  }

  .controls {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr auto;
  }

  .empty {
    display: grid;
    font-size: 12px;
    gap: 4px;
    justify-items: center;
    padding: 22px 24px 24px;
    text-align: center;
  }

  .empty-art {
    align-items: center;
    color: var(--black);
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }

  .empty-line {
    background: var(--cyan-deep);
    display: block;
    height: 2px;
    width: 26px;
  }

  .conversations {
    display: grid;
    gap: 4px;
    max-height: 340px;
    overflow-y: auto;
    padding: 14px 16px 6px;
  }

  .conversation {
    display: grid;
    gap: 4px;
  }

  .conversation-heading {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: space-between;
  }

  .conversation-link {
    color: var(--ink);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.conversation-link {
    color: var(--teal);
  }

  .site-name {
    font-size: 11px;
    white-space: nowrap;
  }

  .calls {
    border-left: 2px solid var(--grid-soft);
    display: grid;
    margin: 4px 0 8px 13px;
    padding-left: 18px;
  }

  .call {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 7px 0;
    position: relative;
  }

  .call-dot {
    background: var(--paper);
    border: 2px solid var(--teal);
    border-radius: 999px;
    height: 10px;
    left: -24px;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
  }

  .call-text {
    display: grid;
    min-width: 0;
  }

  strong {
    color: var(--black);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.005em;
    overflow-wrap: anywhere;
  }

  .app-name {
    font-size: 11px;
  }

  time {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  footer {
    display: flex;
    justify-content: flex-end;
  }

  .btn-close {
    font-size: 12px;
    padding: 5px 12px;
  }
</style>
