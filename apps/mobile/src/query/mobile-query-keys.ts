export type MobileMessageSearchKeyInput = {
  readonly author?: string | null;
  readonly conversationId: string;
  readonly exact?: boolean | null;
  readonly from?: string | null;
  readonly limit?: number | null;
  readonly query: string;
  readonly scope: "channel" | "dm";
  readonly to?: string | null;
};

function normalizeSearchText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function getSearchRegistryKey(input: MobileMessageSearchKeyInput): string {
  return JSON.stringify({
    author: normalizeSearchText(input.author),
    conversationId: input.conversationId,
    exact: input.exact === true,
    from: normalizeSearchText(input.from),
    limit: Number.isFinite(input.limit) ? Math.trunc(input.limit!) : null,
    query: normalizeSearchText(input.query),
    scope: input.scope,
    to: normalizeSearchText(input.to),
  });
}

export class MobileSearchKeyRegistry {
  private readonly fingerprints = new Map<string, string>();
  private nextId = 1;

  clear(): void {
    this.fingerprints.clear();
    this.nextId = 1;
  }

  getFingerprint(input: MobileMessageSearchKeyInput): string {
    const registryKey = getSearchRegistryKey(input);
    const existing = this.fingerprints.get(registryKey);

    if (existing) {
      return existing;
    }

    const fingerprint = `search-${this.nextId}`;
    this.nextId += 1;
    this.fingerprints.set(registryKey, fingerprint);
    return fingerprint;
  }
}

export function createMobileQueryKeys(registry: MobileSearchKeyRegistry) {
  const all = ["mobile"] as const;

  return {
    all,
    bootstrap: () => [...all, "bootstrap"] as const,
    channelMessages: (channelId: string) => [...all, "channel-messages", channelId] as const,
    dmConversations: () => [...all, "dm-conversations"] as const,
    dmMessages: (conversationId: string) => [...all, "dm-messages", conversationId] as const,
    messageSearch: (input: MobileMessageSearchKeyInput) =>
      [
        ...all,
        "message-search",
        input.scope,
        input.conversationId,
        registry.getFingerprint(input),
      ] as const,
    workspace: (serverId: string) => [...all, "workspace", serverId] as const,
  };
}

export const mobileSearchKeyRegistry = new MobileSearchKeyRegistry();
export const mobileQueryKeys = createMobileQueryKeys(mobileSearchKeyRegistry);
