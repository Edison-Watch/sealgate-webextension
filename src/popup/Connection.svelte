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

<section class="panel connection" aria-labelledby="connection-heading">
  <div class="heading">
    <h2 id="connection-heading" class="label">Reporting</h2>
    {#if connection?.destination}
      <span class="pill pill-live">
        <span class="pill-dot"></span>
        Connected
      </span>
    {:else if connection && !connection.signingIn}
      <span class="pill muted">Not connected</span>
    {/if}
  </div>

  <div class="body">
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
          class="btn-link"
          type="button"
          disabled={busy}
          on:click={() => send({ type: 'connection:disconnect' })}
          >{destination.kind === 'sealgate' ? 'Sign out' : 'Disconnect'}</button
        >
      </div>
      {#if status.lastError}
        <p class="notice sync" role="alert">
          {status.pending}
          {status.pending === 1 ? 'call' : 'calls'} not sent: {status.lastError}
          <button
            class="btn-link retry"
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
        class="btn btn-primary btn-large"
        type="button"
        disabled={busy}
        on:click={() => signIn(officialSealgateUrl)}>Log in to Sealgate</button
      >
      <div class="alternatives">
        <button
          class="btn-link small"
          type="button"
          aria-expanded={form === 'selfHosted'}
          on:click={() =>
            (form = form === 'selfHosted' ? 'none' : 'selfHosted')}
          >Use a self-hosted Sealgate</button
        >
        <span class="divider" aria-hidden="true"></span>
        <button
          class="btn-link small"
          type="button"
          aria-expanded={form === 'otlp'}
          on:click={() => (form = form === 'otlp' ? 'none' : 'otlp')}
          >Use an OpenTelemetry endpoint</button
        >
      </div>

      {#if form === 'selfHosted'}
        <form on:submit|preventDefault={signInSelfHosted}>
          <label class="field">
            Sealgate address
            <input
              type="url"
              placeholder="https://sealgate.example.com"
              bind:value={selfHostedUrl}
              required
            />
          </label>
          <button
            class="btn btn-outline btn-small"
            type="submit"
            disabled={busy}>Log in</button
          >
        </form>
      {:else if form === 'otlp'}
        <form on:submit|preventDefault={useOtlp}>
          <label class="field">
            OTLP/HTTP endpoint
            <input
              type="url"
              placeholder="https://collector.example.com:4318"
              bind:value={otlpEndpoint}
              required
            />
          </label>
          <label class="field">
            Headers <span class="muted">(optional, one per line)</span>
            <textarea
              rows="2"
              placeholder="Authorization: Bearer …"
              bind:value={otlpHeaders}></textarea>
          </label>
          <button
            class="btn btn-outline btn-small"
            type="submit"
            disabled={busy}>Save</button
          >
        </form>
      {/if}
    {/if}

    {#if connection?.signInError}
      <p class="notice" role="alert">{connection.signInError}</p>
    {/if}
    {#if error}
      <p class="notice" role="alert">{error}</p>
    {/if}
    {#if connection && !connection.destination && !connection.signingIn}
      <p class="hint muted">Official instance: {officialHost}</p>
    {/if}
  </div>
</section>

<style>
  .connection {
    display: grid;
    gap: 12px;
  }

  .heading {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: space-between;
  }

  .body {
    display: grid;
    gap: 10px;
  }

  p {
    font-size: 12px;
  }

  .destination {
    align-items: center;
    display: flex;
    font-size: 13px;
    gap: 12px;
    justify-content: space-between;
  }

  .destination a,
  .destination strong {
    font-weight: 600;
  }

  .btn-large {
    font-size: 14px;
    padding: 11px 16px;
    width: 100%;
  }

  .btn-small {
    font-size: 12px;
    padding: 8px 12px;
  }

  .alternatives {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .divider {
    background: var(--line-strong);
    height: 12px;
    width: 1px;
  }

  .small {
    color: var(--grey);
    font-size: 11px;
  }

  .small:hover {
    color: var(--cyan);
  }

  form {
    display: grid;
    gap: 8px;
  }

  .sync {
    font-size: 12px;
  }

  .retry {
    color: inherit;
    margin-left: 4px;
    text-decoration: underline;
  }

  .hint {
    color: var(--grey-dim);
    font-family: var(--font-mono);
    font-size: 11px;
    text-align: center;
  }
</style>
