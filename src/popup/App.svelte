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
      <Mark size={30} />
      <span class="wordmark">SealGate</span>
    </div>
    <span class={`pill ${paused ? 'pill-paused' : 'pill-live'}`}>
      <span class="pill-dot"></span>
      {paused ? 'Paused' : 'Listening'}
    </span>
  </header>

  <div class="hero">
    <h1>Tool calls</h1>
    <p class="muted">
      Every MCP and app tool ChatGPT or Claude calls in this browser, as it
      happens.
    </p>
  </div>

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
      class="btn btn-outline"
      type="button"
      disabled={loading || busy || calls.length === 0}
      on:click={() => sendRequest({ type: 'tracker:clearCalls' })}>Clear</button
    >
  </div>

  {#if error}
    <p class="notice" role="alert">{error}</p>
  {/if}

  <section class="panel" aria-labelledby="calls-heading">
    <h2 id="calls-heading" class="label">
      Detected calls
      <span class="count">{calls.length}</span>
    </h2>

    {#if loading}
      <p class="empty mono muted">Loading tracker…</p>
    {:else if calls.length === 0}
      <div class="empty">
        <div class="slots" aria-hidden="true">
          {#each [1, 2, 3, 4] as slot (slot)}
            <div class="slot"><span></span>?</div>
          {/each}
        </div>
        <p class="mono muted">Listening for tool calls…</p>
        <p class="muted small">
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
              <span class="live-dot" aria-hidden="true"></span>
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
              <span class="site-name mono muted">
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
                  <span class="check" aria-hidden="true">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M2.5 6.5l2.3 2.3L9.5 3.8" />
                    </svg>
                  </span>
                  <span class="agent"
                    ><AgentMark site={call.site} size={13} /></span
                  >
                  <span class="chevron" aria-hidden="true">›</span>
                  <span class="call-text">
                    <strong class="mono">{call.toolName}</strong>
                    <span class="app-name mono">{call.appName}</span>
                  </span>
                  <time class="mono" datetime={call.detectedAt}
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
    justify-content: space-between;
  }

  .brand {
    align-items: center;
    color: var(--cyan);
    display: flex;
    gap: 10px;
  }

  .wordmark {
    color: var(--white);
    font-family: var(--font-serif);
    font-size: 17px;
    letter-spacing: 0.12em;
    line-height: 1;
    text-transform: uppercase;
  }

  .hero {
    display: grid;
    gap: 4px;
    padding: 2px 0 2px;
  }

  h1 {
    color: var(--cyan);
    font-size: 30px;
    font-weight: 300;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .hero p {
    font-size: 13px;
    max-width: 34ch;
  }

  .controls {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr auto;
  }

  section.panel {
    display: grid;
    gap: 12px;
    padding-bottom: 12px;
  }

  .empty {
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 12px 8px 8px;
    text-align: center;
  }

  .empty p {
    font-size: 12px;
  }

  .empty .small {
    font-size: 12px;
    max-width: 36ch;
  }

  .slots {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(4, 60px);
    margin-bottom: 6px;
  }

  .slot {
    align-items: center;
    border: 1px dashed var(--line-strong);
    border-radius: 8px;
    color: var(--grey-dim);
    display: flex;
    font-family: var(--font-mono);
    font-size: 12px;
    gap: 8px;
    height: 34px;
    justify-content: center;
  }

  .slot span {
    background: var(--row);
    border-radius: 3px;
    display: block;
    height: 12px;
    width: 12px;
  }

  .conversations {
    display: grid;
    gap: 12px;
    margin-right: -6px;
    max-height: 330px;
    overflow-y: auto;
    padding-right: 6px;
  }

  .conversation {
    display: grid;
    gap: 6px;
  }

  .conversation-heading {
    align-items: center;
    display: flex;
    font-size: 13px;
    font-weight: 600;
    gap: 8px;
    letter-spacing: 0.01em;
    padding: 2px 2px;
  }

  .live-dot {
    background: var(--grey-dim);
    border-radius: 999px;
    height: 8px;
    width: 8px;
  }

  .conversation-link {
    color: var(--white);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.conversation-link:hover {
    color: var(--cyan);
  }

  .site-name {
    font-size: 11px;
    white-space: nowrap;
  }

  .calls {
    display: grid;
    gap: 6px;
  }

  .call {
    align-items: center;
    background: var(--row);
    border: 1px solid var(--line);
    border-radius: 8px;
    display: flex;
    font-size: 12px;
    gap: 8px;
    min-width: 0;
    padding: 7px 12px 7px 10px;
    transition: border-color 0.15s ease;
  }

  .call:hover {
    border-color: var(--line-strong);
  }

  .check {
    align-items: center;
    border: 1.5px solid var(--cyan);
    border-radius: 999px;
    color: var(--cyan);
    display: inline-flex;
    flex: none;
    height: 18px;
    justify-content: center;
    width: 18px;
  }

  .agent {
    align-items: center;
    background: var(--black);
    border: 1px solid var(--line);
    border-radius: 5px;
    color: var(--white);
    display: inline-flex;
    flex: none;
    height: 22px;
    justify-content: center;
    width: 22px;
  }

  .chevron {
    color: var(--grey-dim);
    flex: none;
  }

  .call-text {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }

  .app-name {
    color: var(--grey);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--white);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    color: var(--cyan-deep);
    flex: none;
    font-size: 11px;
    font-weight: 500;
  }

  footer {
    display: flex;
    justify-content: flex-end;
  }

  .btn-close {
    font-size: 12px;
    padding: 4px 8px;
  }
</style>
