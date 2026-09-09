<script lang="ts">
  function closePopup(): void {
    window.close();
  }
</script>

<main>
  <p>Hooray, the extension works!</p>
  <button type="button" on:click={closePopup}>Close</button>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    min-width: 280px;
    background: #f7f8fc;
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
    gap: 14px;
    padding: 20px;
    text-align: center;
  }

  p {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    line-height: 1.4;
  }

  button {
    appearance: none;
    border: 0;
    border-radius: 8px;
    background: #3157d5;
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-weight: 650;
    padding: 9px 14px;
  }

  button:hover {
    background: #2848b3;
  }

  button:focus-visible {
    outline: 3px solid #93a8f5;
    outline-offset: 2px;
  }
</style>
