<script lang="ts">
  import { AGENT_MARKS } from './brand';
  import type { SiteId } from '../shared/tracker';

  export let site: SiteId;
  export let size = 14;

  $: mark = AGENT_MARKS[site];
</script>

<svg
  class="agent"
  width={size}
  height={size}
  viewBox={mark.viewBox}
  aria-hidden="true"
  style={`color: ${mark.color}`}
>
  <path d={mark.path} fill="currentColor" />
</svg>

<style>
  .agent {
    display: inline-block;
    flex: none;
    vertical-align: -2px;
  }
</style>
