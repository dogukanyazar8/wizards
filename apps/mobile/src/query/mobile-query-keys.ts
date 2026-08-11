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
    /** "Hakkında" redesign. One root so a channel change can drop the lot. */
    aboutRoot: () => [...all, "about"] as const,
    aboutUpdate: () => [...all, "about", "update"] as const,
    aboutReleases: () => [...all, "about", "releases"] as const,
    aboutRelease: (version: string) => [...all, "about", "releases", version] as const,
    aboutStatus: () => [...all, "about", "status"] as const,
    aboutCommunityInvite: (slug: string) => [...all, "about", "community-invite", slug] as const,
    /** S2 Section D: the same 2g body, sourced by `serverId` instead of an invite code. */
    aboutServerProfile: (serverId: string) =>
      [...all, "about", "server-profile", serverId] as const,
    helpRoot: () => [...all, "help"] as const,
    /**
     * 2e asks for either the popular four or one category, and those are two
     * different lists — so the parameters are part of the key rather than a
     * refetch of the same one.
     */
    helpArticles: (params: { readonly category?: string; readonly popular?: boolean } = {}) =>
      [...all, "help", "articles", params.category ?? null, params.popular === true] as const,
    helpSearch: (query: string) => [...all, "help", "search", query.trim()] as const,
    accountSettings: () => [...all, "account-settings"] as const,
    /**
     * Badges are never merged into the profile key: they go stale on a five
     * minute clock while a profile carries presence, so one key would make the
     * cheap read pay for the expensive one's freshness.
     *
     * They stay under the `mobile` root because signing out drops exactly that
     * subtree (`mobile-realtime-provider` calls `removeQueries` on
     * `mobileQueryKeys.all`); a key outside it would survive the wipe and show
     * the previous account's badges to the next one.
     */
    badges: {
      own: () => [...all, "badges", "own"] as const,
      root: () => [...all, "badges"] as const,
      user: (userId: string) => [...all, "badges", "user", userId] as const,
    },
    adminCasesRoot: () => [...all, "admin-cases"] as const,
    adminCases: () => [...all, "admin-cases", "list"] as const,
    adminCase: (caseId: string) => [...all, "admin-cases", caseId] as const,
    bootstrap: () => [...all, "bootstrap"] as const,
    channelMessagesRoot: () => [...all, "channel-messages"] as const,
    channelMessages: (channelId: string) => [...all, "channel-messages", channelId] as const,
    /**
     * A search hit opens a window in the middle of a channel's history. It is a
     * sibling entry, not the live one: the realtime bridge patches
     * `channelMessages(channelId)` and must not be made to keep two shapes of
     * the same transcript in sync, and the offline stream must keep holding the
     * tail rather than whatever slice was last searched.
     */
    channelMessagesAround: (channelId: string, messageId: string) =>
      [...all, "channel-messages", channelId, "around", messageId] as const,
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
    /**
     * Grup sohbetleri 2a–2f §B5. Four reads that a group screen owns, kept apart
     * from `dmDetails` on purpose: that key belongs to the 1:1 details body
     * (mutual servers, the counterpart's profile) and its screen is replaced in
     * Faz 5. One key over two shapes is how the messaging send-storm started.
     */
    groupDetails: (conversationId: string) => [...all, "group-details", conversationId] as const,
    groupMembers: (conversationId: string) => [...all, "group-members", conversationId] as const,
    groupMedia: (conversationId: string) => [...all, "group-media", conversationId] as const,
    groupInvite: (conversationId: string) => [...all, "group-invite", conversationId] as const,
    /**
     * `dm:call:state` cached whole, per conversation: the banner reads the
     * server's roster and never rebuilds it from the ring signals it witnessed
     * (Faz 2, karar 8).
     */
    groupCallState: (conversationId: string) =>
      [...all, "group-call-state", conversationId] as const,
    /** Keyed by the code: a preview is about the link, not about a conversation. */
    groupInvitePreview: (code: string) => [...all, "group-invite-preview", code] as const,
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
    /** 1c suggestion rows; separate key so a friends refetch does not re-run the graph scan. */
    friendSuggestions: () => [...all, "friend-suggestions"] as const,
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
    /** S3 Section D: browse page, keyed by its trimmed search text. */
    serverDiscovery: (query: string) => [...all, "server-discovery", query.trim()] as const,
    /**
     * 6d/6e read the same profile `aboutServerProfile` already caches, so this is
     * deliberately an alias rather than a second key: two names over one route
     * would give the profile screen and the "⋯" menu separate cache entries that
     * go stale independently — the messaging send-storm failure again.
     */
    serverProfile: (serverId: string) => [...all, "about", "server-profile", serverId] as const,
    /**
     * Events are their own key, not part of the profile: the profile carries one
     * `upcomingEvent`, while the event screen lists them all (and optionally the
     * past ones). An event mutation invalidates *both*.
     */
    serverEvents: (serverId: string) => [...all, "server-events", serverId] as const,
    /**
     * 6b's server-wide message search. Keyed by the trimmed query like
     * `serverDiscovery`, not through the search-key registry: the workspace box
     * has one text field and no filters, so a fingerprint would carry nothing
     * the query string does not already say.
     */
    serverMessageSearch: (serverId: string, query: string) =>
      [...all, "server-message-search", serverId, query.trim()] as const,
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
