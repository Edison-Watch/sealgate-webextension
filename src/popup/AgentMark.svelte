<script lang="ts">
  import { AGENT_MARKS, type AgentMark } from './brand';
  import type { SiteId } from '../shared/tracker';

  export let site: SiteId;
  export let size = 14;

  // A record from an older build could carry a site this build does not know.
  const unknownMark: AgentMark = {
    viewBox: '0 0 24 24',
    path: '',
    color: 'currentColor',
  };

  $: mark =
    (AGENT_MARKS as Partial<Record<string, AgentMark>>)[site] ?? unknownMark;
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
