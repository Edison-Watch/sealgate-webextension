import type { SiteId, ToolCallRecord } from '../shared/tracker';

export interface ConversationGroup {
  key: string;
  site: SiteId;
  conversationId: string | null;
  calls: ToolCallRecord[];
}

const conversationUrls: Record<SiteId, (id: string) => string> = {
  chatgpt: (id) => `https://chatgpt.com/c/${encodeURIComponent(id)}`,
  claude: (id) => `https://claude.ai/chat/${encodeURIComponent(id)}`,
};

// A record from an older build could carry a site this build does not know;
// such a conversation has no link.
export function conversationUrl(group: ConversationGroup): string | null {
  const url = (
    conversationUrls as Partial<Record<string, (id: string) => string>>
  )[group.site];
  return group.conversationId === null || !url
    ? null
    : url(group.conversationId);
}

// Calls are stored oldest first. Groups come back with the conversation that
// saw the latest call first, and each group lists its newest call first.
export function groupCallsByConversation(
  calls: readonly ToolCallRecord[],
): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();

  for (const call of [...calls].reverse()) {
    const key = `${call.site}:${call.conversationId ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        site: call.site,
        conversationId: call.conversationId,
        calls: [],
      };
      groups.set(key, group);
    }
    group.calls.push(call);
  }

  return [...groups.values()];
}
