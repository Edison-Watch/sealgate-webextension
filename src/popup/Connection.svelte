<script lang="ts">
  import { onMount } from 'svelte';
  import {
    officialSealgateUrl,
    originPattern,
    parseHeaders,
    type ConnectionChangedMessage,
    type ConnectionRequest,
    type ConnectionResponse,
    type ConnectionState,
  } from '../shared/destination';

  type Form = 'none' | 'selfHosted' | 'otlp';

  let connection: ConnectionState | null = null;
  let form: Form = 'none';
  let selfHostedUrl = '';
  let otlpEndpoint = '';
  let otlpHeaders = '';
  let busy = false;
  let error = '';

  const officialHost = new URL(officialSealgateUrl).host;

  async function send(request: ConnectionRequest): Promise<boolean> {
    busy = true;
    error = '';
    try {
      const response = (await chrome.runtime.sendMessage(
        request,
      )) as ConnectionResponse;
      if (!response.ok || !response.connection) {
        throw new Error(response.error ?? 'The extension did not respond.');
      }
      connection = response.connection;
      return true;
    } catch (requestError) {
      error =
        requestError instanceof Error
          ? requestError.message
          : 'The extension could not be reached.';
      return false;
    } finally {
      busy = false;
    }
  }

  function signIn(baseUrl: string): void {
    form = 'none';
    void send({ type: 'connection:signIn', baseUrl });
  }

  function signInSelfHosted(): void {
    try {
      signIn(new URL(selfHostedUrl.trim()).origin);
    } catch {
      error = 'Enter the address of your Sealgate instance.';
    }
  }

  async function useOtlp(): Promise<void> {
    let endpoint: string;
    let headers: Record<string, string>;
    try {
      endpoint = new URL(otlpEndpoint.trim()).toString();
      headers = parseHeaders(otlpHeaders);
    } catch (formError) {
      error =
        formError instanceof Error && formError.message.startsWith('Header')
          ? formError.message
          : 'Enter the endpoint URL, for example https://collector.example.com:4318.';
      return;
    }
    if (!(await send({ type: 'connection:useOtlp', endpoint, headers }))) {
      return;
    }
    form = 'none';
    // Host access lets the export skip the collector's CORS rules. It is
    // asked for after saving because some browsers close the popup while the
    // prompt is open; without it the export still works if CORS allows it.
    const granted = await chrome.permissions
      .request({ origins: [originPattern(endpoint)] })
      .catch(() => false);
    if (granted) {
      void send({ type: 'connection:retry' });
    }
  }

  function hostOf(url: string): string {
    return new URL(url).host;
  }

  function formatTime(timestamp: string): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  onMount(() => {
    const runtime = chrome.runtime;
    const listener = (message: unknown): void => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'connection:changed'
      ) {
        connection = (message as ConnectionChangedMessage).connection;
      }
    };
    runtime.onMessage.addListener(listener);
    void send({ type: 'connection:get' });
    return () => runtime.onMessage.removeListener(listener);
  });
</script>

<section class="connection" aria-labelledby="connection-heading">
  <h2 id="connection-heading">Reporting</h2>

  {#if connection === null}
    <p class="muted">Loading…</p>
  {:else if connection.signingIn}
    <p class="muted" role="status">
      Finish signing in in the window that opened. You can close this popup.
    </p>
  {:else if connection.destination}
    {@const destination = connection.destination}
    {@const status = connection.status}
    <div class="destination">
      {#if destination.kind === 'sealgate'}
        <span>
          Signed in to
          <a
            href={`${destination.baseUrl}/dashboard/web-agents`}
            target="_blank"
            rel="noreferrer">{hostOf(destination.baseUrl)}</a
          >
        </span>
      {:else}
        <span title={destination.endpoint}>
          Sending to <strong>{hostOf(destination.endpoint)}</strong>
        </span>
      {/if}
      <button
        class="link"
        type="button"
        disabled={busy}
        on:click={() => send({ type: 'connection:disconnect' })}
        >{destination.kind === 'sealgate' ? 'Sign out' : 'Disconnect'}</button
      >
    </div>
    {#if status.lastError}
      <p class="sync error" role="alert">
        {status.pending}
        {status.pending === 1 ? 'call' : 'calls'} not sent: {status.lastError}
        <button
          class="link"
          type="button"
          disabled={busy}
          on:click={() => send({ type: 'connection:retry' })}>Retry</button
        >
      </p>
    {:else if status.pending > 0}
      <p class="sync muted">Sending {status.pending}…</p>
    {:else if status.lastExportAt}
      <p class="sync muted">
        All calls sent · last at {formatTime(status.lastExportAt)}
      </p>
    {:else}
      <p class="sync muted">New tool calls will be sent as they happen.</p>
    {/if}
  {:else}
    <p class="muted">
      Sign in to see your tool calls in the Sealgate dashboard.
    </p>
    <button
      class="primary large"
      type="button"
      disabled={busy}
      on:click={() => signIn(officialSealgateUrl)}>Log in to Sealgate</button
    >
    <div class="alternatives">
      <button
        class="link small"
        type="button"
        aria-expanded={form === 'selfHosted'}
        on:click={() => (form = form === 'selfHosted' ? 'none' : 'selfHosted')}
        >Use a self-hosted Sealgate</button
      >
      <button
        class="link small"
        type="button"
        aria-expanded={form === 'otlp'}
        on:click={() => (form = form === 'otlp' ? 'none' : 'otlp')}
        >Use an OpenTelemetry endpoint</button
      >
    </div>

    {#if form === 'selfHosted'}
      <form on:submit|preventDefault={signInSelfHosted}>
        <label>
          Sealgate address
          <input
            type="url"
            placeholder="https://sealgate.example.com"
            bind:value={selfHostedUrl}
            required
          />
        </label>
        <button class="secondary" type="submit" disabled={busy}>Log in</button>
      </form>
    {:else if form === 'otlp'}
      <form on:submit|preventDefault={useOtlp}>
        <label>
          OTLP/HTTP endpoint
          <input
            type="url"
            placeholder="https://collector.example.com:4318"
            bind:value={otlpEndpoint}
            required
          />
        </label>
        <label>
          Headers <span class="muted">(optional, one per line)</span>
          <textarea
            rows="2"
            placeholder="Authorization: Bearer …"
            bind:value={otlpHeaders}></textarea>
        </label>
        <button class="secondary" type="submit" disabled={busy}>Save</button>
      </form>
    {/if}
  {/if}

  {#if connection?.signInError}
    <p class="error" role="alert">{connection.signInError}</p>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  {#if connection && !connection.destination && !connection.signingIn}
    <p class="hint muted">Official instance: {officialHost}</p>
  {/if}
</section>

<style>
  .connection {
    background: #ffffff;
    border: 1px solid #e2e6ef;
    border-radius: 12px;
    display: grid;
    gap: 10px;
    padding: 12px 14px;
  }

  h2 {
    font-size: 14px;
    margin: 0;
  }

  p {
    font-size: 12px;
    line-height: 1.45;
    margin: 0;
  }

  .muted {
    color: #657089;
  }

  .destination {
    align-items: center;
    display: flex;
    font-size: 13px;
    gap: 12px;
    justify-content: space-between;
  }

  .destination a {
    color: #3157d5;
    font-weight: 700;
    text-decoration: none;
  }

  .destination a:hover {
    text-decoration: underline;
  }

  .alternatives {
    display: flex;
    gap: 14px;
    justify-content: center;
  }

  form {
    display: grid;
    gap: 8px;
  }

  label {
    display: grid;
    font-size: 12px;
    font-weight: 600;
    gap: 4px;
  }

  input,
  textarea {
    border: 1px solid #cfd6e4;
    border-radius: 7px;
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    padding: 7px 9px;
    resize: vertical;
  }

  input:focus-visible,
  textarea:focus-visible {
    border-color: #3157d5;
    outline: 2px solid #c7d3fb;
  }

  button {
    border: 0;
    border-radius: 8px;
    cursor: pointer;
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

  button.large {
    font-size: 15px;
    padding: 12px 16px;
    width: 100%;
  }

  button.secondary {
    background: #e7ebf5;
    color: #28344d;
  }

  button.link {
    background: transparent;
    color: #3157d5;
    font-size: 12px;
    padding: 0;
  }

  button.link:hover:not(:disabled) {
    text-decoration: underline;
  }

  button.small {
    font-size: 11px;
    font-weight: 600;
  }

  button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  button:focus-visible {
    outline: 3px solid #93a8f5;
    outline-offset: 2px;
  }

  .error {
    background: #fee2e2;
    border-radius: 8px;
    color: #991b1b;
    padding: 7px 9px;
  }

  .sync.error button {
    color: #991b1b;
    margin-left: 4px;
    text-decoration: underline;
  }

  .hint {
    font-size: 11px;
    text-align: center;
  }
</style>
