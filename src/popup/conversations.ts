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

export function conversationUrl(group: ConversationGroup): string | null {
  return group.conversationId === null
    ? null
    : conversationUrls[group.site](group.conversationId);
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
