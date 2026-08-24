import { z } from "zod";

/**
 * Ana Sayfa 1a — Faz 3 veri sözleşmesi (`04-faz3-veri-katmani-migration.md` §2).
 *
 * Every DTO is a zod schema first and a TypeScript type derived from it. There is
 * no hand-written second type: a field that drifts fails `parse` on both ends.
 *
 * **Time is always an ISO-8601 string.** The server never sends "2 dk", "dün" or
 * "18 Ağustos Pazartesi" — it does not know the reader's time zone or language.
 * Relative text and date labels are produced on the client.
 */

export const HomePresenceSchema = z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]);
export type HomePresence = z.infer<typeof HomePresenceSchema>;

/** The only shape of "another person" the home screen renders. */
export const HomeActorSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  id: z.string(),
  presence: HomePresenceSchema,
});
export type HomeActor = z.infer<typeof HomeActorSchema>;

export const HomeFocusSchema = z.object({
  active: z.boolean(),
  /**
   * ISO instant the window closes. The countdown reads **this**, not
   * `minutesLeft`: a client-side counter drifts while the tab sleeps and comes
   * back lying (`06-faz5` §9). `minutesLeft` stays as the server's own answer at
   * response time, which is what the first paint shows before the first tick.
   */
  expiresAt: z.string(),
  minutesLeft: z.number().int().min(0),
  totalMinutes: z.number().int().min(0),
});
export type HomeFocus = z.infer<typeof HomeFocusSchema>;

/* ------------------------------------------------------------------ summary */

export const AppSummaryResponseSchema = z.object({
  /**
   * ISO instant of the server's "now". The header's "18 Ağustos Pazartesi" is
   * formatted from this on the client, in the reader's zone.
   */
  dateLabel: z.string(),
  dmUnread: z.number().int().min(0),
  focus: HomeFocusSchema.nullable(),
  greetingName: z.string(),
  pendingReplies: z.number().int().min(0),
  presence: HomePresenceSchema,
  unreadMentions: z.number().int().min(0),
});
export type AppSummaryResponse = z.infer<typeof AppSummaryResponseSchema>;

/* ------------------------------------------------------------------- recent */

export const HomeRecentKindSchema = z.enum(["channel", "dm"]);
export type HomeRecentKind = z.infer<typeof HomeRecentKindSchema>;

export const HomeRecentMessageSchema = z.object({
  authorAvatarUrl: z.string().nullable(),
  authorName: z.string(),
  text: z.string(),
});

export const HomeRecentItemSchema = z.object({
  /**
   * The row's own face: a DM's counterpart. `null` for a channel row, which
   * draws a `#` tile instead. It is deliberately not the last message author —
   * that avatar belongs to whoever spoke last, which is often the viewer.
   */
  avatarUrl: z.string().nullable(),
  href: z.string(),
  id: z.string(),
  kind: HomeRecentKindSchema,
  lastMessage: HomeRecentMessageSchema.nullable(),
  lastMessageAt: z.string(),
  mentioned: z.boolean(),
  name: z.string(),
  /**
   * The counterpart's presence on a 1:1 DM row, already redacted for the
   * viewer. `null` for a channel and for a group DM — those rows have no single
   * person behind them, and the card draws no dot for them.
   */
  presence: HomePresenceSchema.nullable(),
  serverName: z.string().nullable(),
  unreadCount: z.number().int().min(0),
});
export type HomeRecentItem = z.infer<typeof HomeRecentItemSchema>;

export const AppRecentResponseSchema = z.object({
  items: z.array(HomeRecentItemSchema),
});
export type AppRecentResponse = z.infer<typeof AppRecentResponseSchema>;

/** The grid asks for 4–7 rows depending on the scale step; nothing asks for more. */
export const AppRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(4).max(10).default(6),
});
export type AppRecentQuery = z.infer<typeof AppRecentQuerySchema>;

/* ----------------------------------------------------------------- awaiting */

export const HomeAwaitingSourceSchema = z.enum([
  "mention",
  "reply",
  "friend_request",
  "server_invite",
]);
export type HomeAwaitingSource = z.infer<typeof HomeAwaitingSourceSchema>;

export const HomeAwaitingActionSchema = z.enum(["reply", "accept"]).nullable();

export const HomeAwaitingItemSchema = z.object({
  action: HomeAwaitingActionSchema,
  context: z.string(),
  /** Always an in-app relative path — see `toRelativeAppHref`. */
  href: z.string(),
  id: z.string(),
  occurredAt: z.string(),
  reason: z.string(),
  source: HomeAwaitingSourceSchema,
  user: HomeActorSchema,
});
export type HomeAwaitingItem = z.infer<typeof HomeAwaitingItemSchema>;

export const AppAwaitingResponseSchema = z.object({
  items: z.array(HomeAwaitingItemSchema),
  newCount: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type AppAwaitingResponse = z.infer<typeof AppAwaitingResponseSchema>;

/**
 * Faz 6 §4.1. The inbox filters **on the server**. Filtering a paged list in the
 * browser would answer "arkadaşlık istekleri" from whatever happened to be on
 * the first page and print a confident, wrong number next to it.
 */
export const AppAwaitingFilterSchema = z.enum([
  "all",
  "mention",
  "reply",
  "friend_request",
  "server_invite",
]);
export type AppAwaitingFilter = z.infer<typeof AppAwaitingFilterSchema>;

export const AppAwaitingQuerySchema = z.object({
  /** The home card asks for 6; the inbox is the full list, so the ceiling rises. */
  limit: z.coerce.number().int().min(1).max(100).default(6),
  source: AppAwaitingFilterSchema.default("all"),
});
export type AppAwaitingQuery = z.infer<typeof AppAwaitingQuerySchema>;

/* --------------------------------------------------------------- voice/live */

export const HomeLiveRoomKindSchema = z.enum(["voice", "call"]);
export type HomeLiveRoomKind = z.infer<typeof HomeLiveRoomKindSchema>;

export const HomeLiveSpeakerSchema = HomeActorSchema.extend({
  level: z.number().min(0).max(1),
});

export const HomeLiveRoomSchema = z.object({
  caption: z.string(),
  href: z.string(),
  id: z.string(),
  kind: HomeLiveRoomKindSchema,
  name: z.string(),
  /** At most 4; `participantCount` carries the real total for the "+N" chip. */
  participantCount: z.number().int().min(0),
  participants: z.array(HomeActorSchema).max(4),
  /**
   * The server the voice channel belongs to; `null` on a group-DM call, whose
   * `id` is a conversation. `Katıl` needs it — `joinChannel` takes
   * `{ channelId, serverId }` and `serverName` is not an id.
   */
  serverId: z.string().nullable(),
  serverName: z.string().nullable(),
  /**
   * Who is talking right now. Live data: the first read may legitimately be
   * `null` and the card fills in from `voice:audio-level:update`. The server
   * never stores an audio level.
   */
  speaker: HomeLiveSpeakerSchema.nullable(),
});
export type HomeLiveRoom = z.infer<typeof HomeLiveRoomSchema>;

export const VoiceLiveResponseSchema = z.object({
  rooms: z.array(HomeLiveRoomSchema),
  /**
   * Every live room the viewer can see, before `limit` cut the list. The card's
   * "<n> oda açık" header reads this: `rooms.length` would shrink with the scale
   * step and quietly under-report (05 §9).
   */
  totalCount: z.number().int().min(0),
});
export type VoiceLiveResponse = z.infer<typeof VoiceLiveResponseSchema>;

export const VoiceLiveQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(4),
});
export type VoiceLiveQuery = z.infer<typeof VoiceLiveQuerySchema>;

/* ------------------------------------------------------------------- events */

export const HomeEventSummarySchema = z.object({
  context: z.string(),
  id: z.string(),
  startAt: z.string(),
  title: z.string(),
});
export type HomeEventSummary = z.infer<typeof HomeEventSummarySchema>;

export const HomeNextEventSchema = HomeEventSummarySchema.extend({
  attendeeCount: z.number().int().min(0),
  attendees: z.array(HomeActorSchema).max(3),
  href: z.string(),
  interested: z.boolean(),
  /**
   * `Hatırlat` posts to `servers/[serverId]/events/[eventId]/interest`. Prising
   * the id back out of `href` with a regex would make the button depend on the
   * shape of a display link.
   */
  serverId: z.string(),
});
export type HomeNextEvent = z.infer<typeof HomeNextEventSchema>;

export const EventsUpcomingResponseSchema = z.object({
  next: HomeNextEventSchema.nullable(),
  totalCount: z.number().int().min(0),
  upcoming: z.array(HomeEventSummarySchema),
});
export type EventsUpcomingResponse = z.infer<typeof EventsUpcomingResponseSchema>;

export const EventsUpcomingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(3),
});
export type EventsUpcomingQuery = z.infer<typeof EventsUpcomingQuerySchema>;

/*
 * Ş10 — Faz 6'nın `events/list` ve `events/calendar` sözleşmeleri **silindi**.
 * Akışın tek ucu `GET /api/v1/events` ve onun şeması `@wizards/types`
 * (`EventsListResponseSchema`) içinde; iki farklı `EventsListResponse` tipi
 * aynı depoda yaşamıyor. Ana Sayfa'nın "Sıradaki" kartı `EventsUpcoming*`
 * sözleşmesini kullanmaya devam ediyor.
 */

/* ----------------------------------------------------------- search/command */

export const HomeCommandGroupKindSchema = z.enum(["server", "channel", "dm", "user", "command"]);
export type HomeCommandGroupKind = z.infer<typeof HomeCommandGroupKindSchema>;

export const HomeCommandItemSchema = z.object({
  avatarUrl: z.string().nullable(),
  href: z.string(),
  id: z.string(),
  label: z.string(),
  presence: HomePresenceSchema.nullable(),
  sublabel: z.string().nullable(),
});
export type HomeCommandItem = z.infer<typeof HomeCommandItemSchema>;

export const HomeCommandGroupSchema = z.object({
  items: z.array(HomeCommandItemSchema).max(5),
  kind: HomeCommandGroupKindSchema,
});
export type HomeCommandGroup = z.infer<typeof HomeCommandGroupSchema>;

export const SearchCommandResponseSchema = z.object({
  groups: z.array(HomeCommandGroupSchema),
});
export type SearchCommandResponse = z.infer<typeof SearchCommandResponseSchema>;

/** Each group returns at most five rows; the palette never paginates. */
export const HOME_COMMAND_GROUP_LIMIT = 5;

export const SearchCommandQuerySchema = z.object({
  /** Empty means "recent surfaces", not "everything in the database". */
  q: z.string().trim().max(64).default(""),
});
export type SearchCommandQuery = z.infer<typeof SearchCommandQuerySchema>;

/* ----------------------------------------------------------------- presence */

export const HomeFocusUpdateSchema = z.union([
  z.object({ enabled: z.literal(true), minutes: z.number().int().min(5).max(240) }),
  z.object({ enabled: z.literal(false) }),
]);
export type HomeFocusUpdate = z.infer<typeof HomeFocusUpdateSchema>;

/**
 * `INVISIBLE` is a client-side word. It is stored as `OFFLINE` — the mode keeps
 * the socket open while publishing "offline", which is exactly what the stored
 * value means (`lib/presence.ts`).
 */
export const PresenceUpdateBodySchema = z
  .object({
    focus: HomeFocusUpdateSchema.optional(),
    presence: z.enum(["ONLINE", "DND", "IDLE", "INVISIBLE"]).optional(),
  })
  .refine((value) => value.focus !== undefined || value.presence !== undefined, {
    message: "Nothing to update",
  })
  .refine((value) => !(value.focus !== undefined && value.presence !== undefined), {
    message: "Presence and focus must be updated separately",
  });
export type PresenceUpdateBody = z.infer<typeof PresenceUpdateBodySchema>;

export const PresenceUpdateResponseSchema = z.object({
  focus: HomeFocusSchema.nullable(),
  presence: HomePresenceSchema,
});
export type PresenceUpdateResponse = z.infer<typeof PresenceUpdateResponseSchema>;

/* ------------------------------------------------------- servers/join (Faz 5) */

/**
 * The web twin of `POST /api/v1/mobile/servers/join`.
 *
 * "Yanıt bekliyor" lists unread `SERVER_INVITE` notifications with an accept
 * action, and accepting has to happen **in place**: the row disappears, the
 * counter drops, and a failure puts both back. The only web path that redeemed
 * an invite code was the `/invite/[code]` page's server action, which redirects
 * on every branch — including the failures the optimistic row must recover
 * from. The code regex mirrors the mobile schema so one shape of invite code is
 * accepted everywhere.
 */
export const ServerJoinByInviteBodySchema = z
  .object({
    inviteCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,96}$/),
  })
  .strict();
export type ServerJoinByInviteBody = z.infer<typeof ServerJoinByInviteBodySchema>;

export const ServerJoinByInviteResponseSchema = z.object({
  /** True when the membership already existed; the caller lands, nothing is written. */
  alreadyMember: z.boolean(),
  /** Where the caller should land — always an in-app relative path. */
  href: z.string(),
  /** Additive for Keşfet's success strip; older consumers may ignore it. */
  name: z.string().min(1).optional(),
  serverId: z.string(),
});
export type ServerJoinByInviteResponse = z.infer<typeof ServerJoinByInviteResponseSchema>;
