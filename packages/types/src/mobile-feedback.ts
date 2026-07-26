import { z } from "zod";

/**
 * Handoff 4a/4b product feedback plus the admin console that answers it.
 *
 * Everything here is `.strict()` and bounded: the diagnostics blob in
 * particular is a promise to the user — the "Neler gönderilir?" sheet lists
 * exactly these fields, so an extra key arriving from a newer client must be
 * rejected rather than quietly stored.
 */

const FeedbackIdSchema = z.string().trim().min(1).max(128);

export const MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH = 1_000;
export const MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT = 3;
export const MOBILE_ROADMAP_PREVIEW_COUNT = 3;
export const ADMIN_FEEDBACK_PAGE_SIZE = 20;

export const FeedbackRatingSchema = z.enum(["BAD", "OKAY", "GOOD", "GREAT"]);
export const FeedbackTopicSchema = z.enum(["SUGGESTION", "BUG", "VOICE", "PERFORMANCE", "OTHER"]);
export const FeedbackStatusSchema = z.enum(["REVIEWING", "PLANNED", "IN_PROGRESS", "SHIPPED"]);

export type FeedbackRating = z.infer<typeof FeedbackRatingSchema>;
export type FeedbackTopic = z.infer<typeof FeedbackTopicSchema>;
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

/**
 * One entry from the client's crash-boundary log. Deliberately coarse: the
 * boundary never surfaces a raw error message (it can carry a token, a channel
 * name or message text), so diagnostics carry the same classified kind and
 * reference code support already reads over the phone.
 */
export const MobileFeedbackFaultSchema = z
  .object({
    at: z.string().datetime(),
    kind: z.enum(["bundle", "network", "render", "storage"]),
    reference: z.string().min(1).max(32),
  })
  .strict();

export const MobileFeedbackDiagnosticsSchema = z
  .object({
    appVersion: z.string().min(1).max(40),
    deviceModel: z.string().min(1).max(120).nullable(),
    locale: z.string().min(2).max(16),
    osName: z.string().min(1).max(40).nullable(),
    osVersion: z.string().min(1).max(40).nullable(),
    /** Newest first, capped so a long-running session cannot inflate the payload. */
    recentFaults: z.array(MobileFeedbackFaultSchema).max(5),
    theme: z.enum(["dark", "light"]),
  })
  .strict();

export type MobileFeedbackDiagnostics = z.infer<typeof MobileFeedbackDiagnosticsSchema>;

export const MobileFeedbackSubmitRequestSchema = z
  .object({
    /** Claim ids from the shared mobile media upload flow, in display order. */
    attachmentClaimIds: z.array(FeedbackIdSchema).max(MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT),
    diagnostics: MobileFeedbackDiagnosticsSchema.nullable(),
    message: z.string().trim().min(1).max(MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH),
    rating: FeedbackRatingSchema,
    topic: FeedbackTopicSchema,
  })
  .strict();

export const MobileFeedbackAttachmentSchema = z
  .object({
    height: z.number().int().positive(),
    id: FeedbackIdSchema,
    url: z.string().url().max(2048),
    width: z.number().int().positive(),
  })
  .strict();

export const MobileFeedbackSummarySchema = z
  .object({
    attachments: z.array(MobileFeedbackAttachmentSchema).max(MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT),
    createdAt: z.string().datetime(),
    id: FeedbackIdSchema,
    message: z.string().min(1).max(MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH),
    /** The `n` in `WSP-{n}`; formatting lives on the client. */
    publicNumber: z.number().int().positive(),
    rating: FeedbackRatingSchema,
    roadmapItemId: FeedbackIdSchema.nullable(),
    status: FeedbackStatusSchema,
    statusChangedAt: z.string().datetime().nullable(),
    topic: FeedbackTopicSchema,
  })
  .strict();

export const MobileRoadmapItemSchema = z
  .object({
    description: z.string().max(500).nullable(),
    id: FeedbackIdSchema,
    /** True when one of the viewer's own feedback items feeds this row. */
    isOwnSuggestion: z.boolean(),
    status: FeedbackStatusSchema,
    title: z.string().min(1).max(120),
    voteCount: z.number().int().nonnegative(),
    votedByViewer: z.boolean(),
  })
  .strict();

export const MobileFeedbackSubmitResponseSchema = z
  .object({
    feedback: MobileFeedbackSummarySchema,
    roadmap: z.array(MobileRoadmapItemSchema).max(MOBILE_ROADMAP_PREVIEW_COUNT),
  })
  .strict();

export const MobileFeedbackDetailResponseSchema = z
  .object({
    feedback: MobileFeedbackSummarySchema,
    roadmap: z.array(MobileRoadmapItemSchema).max(MOBILE_ROADMAP_PREVIEW_COUNT),
  })
  .strict();

export const MobileRoadmapListResponseSchema = z
  .object({ items: z.array(MobileRoadmapItemSchema).max(200) })
  .strict();

export const MobileRoadmapVoteRequestSchema = z
  .object({
    /** The desired end state, not a delta — a retried tap cannot double-count. */
    voted: z.boolean(),
  })
  .strict();

export const MobileRoadmapVoteResponseSchema = z.object({ item: MobileRoadmapItemSchema }).strict();

export const MobileFeedbackIdParamsSchema = z.object({ feedbackId: FeedbackIdSchema }).strict();
export const MobileRoadmapItemIdParamsSchema = z
  .object({ roadmapItemId: FeedbackIdSchema })
  .strict();

export type MobileFeedbackSubmitRequest = z.infer<typeof MobileFeedbackSubmitRequestSchema>;
export type MobileFeedbackSummary = z.infer<typeof MobileFeedbackSummarySchema>;
export type MobileFeedbackAttachment = z.infer<typeof MobileFeedbackAttachmentSchema>;
export type MobileRoadmapItem = z.infer<typeof MobileRoadmapItemSchema>;
export type MobileFeedbackSubmitResponse = z.infer<typeof MobileFeedbackSubmitResponseSchema>;
export type MobileFeedbackDetailResponse = z.infer<typeof MobileFeedbackDetailResponseSchema>;
export type MobileRoadmapListResponse = z.infer<typeof MobileRoadmapListResponseSchema>;
export type MobileRoadmapVoteResponse = z.infer<typeof MobileRoadmapVoteResponseSchema>;

/* ---------------------------------------------------------------- admin --- */

const AdminFeedbackUserSchema = z
  .object({
    avatarUrl: z.string().url().max(2048).nullable(),
    displayName: z.string().max(120).nullable(),
    id: FeedbackIdSchema,
    username: z.string().min(1).max(80),
  })
  .strict();

export const AdminFeedbackListItemSchema = z
  .object({
    attachmentCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    id: FeedbackIdSchema,
    /** Trimmed for the row; the detail view carries the whole message. */
    preview: z.string().max(200),
    publicNumber: z.number().int().positive(),
    rating: FeedbackRatingSchema,
    roadmapItemId: FeedbackIdSchema.nullable(),
    status: FeedbackStatusSchema,
    topic: FeedbackTopicSchema,
    user: AdminFeedbackUserSchema,
  })
  .strict();

export const AdminFeedbackListResponseSchema = z
  .object({
    items: z.array(AdminFeedbackListItemSchema).max(ADMIN_FEEDBACK_PAGE_SIZE),
    /** Opaque cursor for the next page; `null` when the list is exhausted. */
    nextCursor: z.string().max(128).nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const AdminFeedbackDetailSchema = z
  .object({
    attachments: z.array(MobileFeedbackAttachmentSchema).max(MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT),
    createdAt: z.string().datetime(),
    diagnostics: MobileFeedbackDiagnosticsSchema.nullable(),
    id: FeedbackIdSchema,
    message: z.string().min(1).max(MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH),
    publicNumber: z.number().int().positive(),
    rating: FeedbackRatingSchema,
    roadmapItemId: FeedbackIdSchema.nullable(),
    status: FeedbackStatusSchema,
    statusChangedAt: z.string().datetime().nullable(),
    topic: FeedbackTopicSchema,
    updatedAt: z.string().datetime(),
    user: AdminFeedbackUserSchema.extend({
      feedbackCount: z.number().int().nonnegative(),
      registeredAt: z.string().datetime(),
    }).strict(),
  })
  .strict();

export const AdminFeedbackDetailResponseSchema = z
  .object({ feedback: AdminFeedbackDetailSchema })
  .strict();

export const AdminFeedbackUpdateRequestSchema = z
  .object({
    roadmapItemId: FeedbackIdSchema.nullable().optional(),
    status: FeedbackStatusSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.roadmapItemId !== undefined || value.status !== undefined,
    "At least one field must change",
  );

export const AdminRoadmapItemSchema = z
  .object({
    createdAt: z.string().datetime(),
    description: z.string().max(500).nullable(),
    featured: z.boolean(),
    /** How many feedback items point at this row. */
    feedbackCount: z.number().int().nonnegative(),
    id: FeedbackIdSchema,
    position: z.number().int(),
    status: FeedbackStatusSchema,
    title: z.string().min(1).max(120),
    voteCount: z.number().int().nonnegative(),
  })
  .strict();

export const AdminRoadmapListResponseSchema = z
  .object({ items: z.array(AdminRoadmapItemSchema).max(200) })
  .strict();

export const AdminRoadmapItemResponseSchema = z.object({ item: AdminRoadmapItemSchema }).strict();

export const AdminRoadmapCreateRequestSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
    featured: z.boolean().optional(),
    position: z.number().int().min(0).max(9_999).optional(),
    status: FeedbackStatusSchema.optional(),
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export const AdminRoadmapUpdateRequestSchema = z
  .object({
    description: z.string().trim().max(500).nullable().optional(),
    featured: z.boolean().optional(),
    position: z.number().int().min(0).max(9_999).optional(),
    status: FeedbackStatusSchema.optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field must change");

export type AdminFeedbackListItem = z.infer<typeof AdminFeedbackListItemSchema>;
export type AdminFeedbackListResponse = z.infer<typeof AdminFeedbackListResponseSchema>;
export type AdminFeedbackDetail = z.infer<typeof AdminFeedbackDetailSchema>;
export type AdminFeedbackDetailResponse = z.infer<typeof AdminFeedbackDetailResponseSchema>;
export type AdminFeedbackUpdateRequest = z.infer<typeof AdminFeedbackUpdateRequestSchema>;
export type AdminRoadmapItem = z.infer<typeof AdminRoadmapItemSchema>;
export type AdminRoadmapItemResponse = z.infer<typeof AdminRoadmapItemResponseSchema>;
export type AdminRoadmapListResponse = z.infer<typeof AdminRoadmapListResponseSchema>;
export type AdminRoadmapCreateRequest = z.infer<typeof AdminRoadmapCreateRequestSchema>;
export type AdminRoadmapUpdateRequest = z.infer<typeof AdminRoadmapUpdateRequestSchema>;

/**
 * `WSP-1284`. A pure formatter so the mobile card, the console row and the
 * notification title cannot drift into three different shapes.
 */
export function formatFeedbackPublicNumber(publicNumber: number): string {
  return `WSP-${Math.trunc(publicNumber)}`;
}
