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
    accountSettings: () => [...all, "account-settings"] as const,
    bootstrap: () => [...all, "bootstrap"] as const,
    channelMessagesRoot: () => [...all, "channel-messages"] as const,
    channelMessages: (channelId: string) => [...all, "channel-messages", channelId] as const,
    channelPins: (channelId: string) => [...all, "channel-pins", channelId] as const,
    channelThread: (channelId: string, messageId: string) =>
      [...all, "channel-thread", channelId, messageId] as const,
    dmConversations: () => [...all, "dm-conversations"] as const,
    dmMessagesRoot: () => [...all, "dm-messages"] as const,
    dmMessages: (conversationId: string) => [...all, "dm-messages", conversationId] as const,
    dmDetails: (conversationId: string) => [...all, "dm-details", conversationId] as const,
    dmAttachmentsRoot: (conversationId: string) =>
      [...all, "dm-attachments", conversationId] as const,
    /** 11f keeps one cached page stack per gallery tab, so switching is instant. */
    dmAttachments: (conversationId: string, tab: string) =>
      [...all, "dm-attachments", conversationId, tab] as const,
    dmThread: (conversationId: string, messageId: string) =>
      [...all, "dm-thread", conversationId, messageId] as const,
    feedbackRoot: () => [...all, "feedback"] as const,
    feedback: (feedbackId: string) => [...all, "feedback", feedbackId] as const,
    /**
     * Deliberately outside the `feedback` prefix: an optimistic roadmap vote
     * walks every key under `feedbackRoot()` and reads each hit as a detail
     * response, so the report list must not live where that walk can reach it.
     */
    myFeedback: () => [...all, "my-feedback"] as const,
    roadmap: () => [...all, "roadmap"] as const,
    friends: () => [...all, "friends"] as const,
    profile: () => [...all, "profile"] as const,
    userProfileRoot: () => [...all, "user-profile"] as const,
    /** Server context changes the payload (role chips), so it is part of the key. */
    userProfile: (userId: string, serverId?: string | undefined) =>
      [...all, "user-profile", userId, serverId ?? null] as const,
    userSearchRoot: () => [...all, "user-search"] as const,
    userSearch: (term: string) => [...all, "user-search", term] as const,
    legalDocument: (documentId: string) => [...all, "legal", documentId] as const,
    linkPreview: (messageId: string) => [...all, "link-preview", messageId] as const,
    notificationsRoot: () => [...all, "notifications"] as const,
    notifications: (filter: string = "all") => [...all, "notifications", filter] as const,
    voiceStatesRoot: () => [...all, "voice-states"] as const,
    voiceStates: (serverId: string) => [...all, "voice-states", serverId] as const,
    messageSearch: (input: MobileMessageSearchKeyInput) =>
      [
        ...all,
        "message-search",
        input.scope,
        input.conversationId,
        registry.getFingerprint(input),
      ] as const,
    workspaceRoot: () => [...all, "workspace"] as const,
    workspace: (serverId: string) => [...all, "workspace", serverId] as const,
    workspaceMembers: (serverId: string) => [...all, "workspace", serverId, "members"] as const,
    workspaceRoles: (serverId: string) => [...all, "workspace", serverId, "roles"] as const,
    workspaceRoleOverview: (serverId: string) =>
      [...all, "workspace", serverId, "role-overview"] as const,
    workspaceInvites: (serverId: string) => [...all, "workspace", serverId, "invites"] as const,
    /** 2a/2b sheet payload: link, friends and pending targeted invites together. */
    workspaceInviteSheet: (serverId: string) =>
      [...all, "workspace", serverId, "invite-sheet"] as const,
  };
}

export const mobileSearchKeyRegistry = new MobileSearchKeyRegistry();
export const mobileQueryKeys = createMobileQueryKeys(mobileSearchKeyRegistry);
