<script lang="ts">
  import {
    SEALGATE_MARK_FRAME_PATH,
    SEALGATE_MARK_LETTER_PATH,
    SEALGATE_MARK_VIEWBOX,
  } from './brand';

  export let size = 24;
  export let title = 'SealGate';
</script>

<svg
  class="mark"
  width={size}
  height={size}
  viewBox={SEALGATE_MARK_VIEWBOX}
  role="img"
  aria-label={title}
>
  <path d={SEALGATE_MARK_FRAME_PATH} />
  <path d={SEALGATE_MARK_LETTER_PATH} />
</svg>

<style>
  .mark {
    display: block;
    fill: currentColor;
    flex: none;
  }
</style>
