import { z } from "zod";

/**
 * The mobile moderation surface is triage, not administration: the phone can
 * read the queue, claim a case, dismiss it with a reason, or hand it to the
 * desktop. Banning an account and deleting a message are not modelled here
 * because those endpoints do not exist on the mobile surface at all.
 */

export const MOBILE_ADMIN_QUEUE_MAX_COUNT = 20;
export const MOBILE_ADMIN_EVIDENCE_MAX_COUNT = 5;
export const MOBILE_ADMIN_REPORT_MAX_COUNT = 5;
export const MOBILE_ADMIN_PREVIEW_MAX_LENGTH = 200;
export const MOBILE_ADMIN_RESOLUTION_MAX_LENGTH = 1000;
export const MOBILE_ADMIN_NOTE_MAX_LENGTH = 1000;

export const MobileAdminCaseStatusSchema = z.enum([
  "OPEN",
  "IN_REVIEW",
  "ACTIONED",
  "DISMISSED",
  "APPEALED",
  "CLOSED",
]);

export const MobileAdminCasePrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const MobileAdminReportReasonSchema = z.enum([
  "HARASSMENT",
  "SPAM",
  "INAPPROPRIATE",
  "IMPERSONATION",
  "OTHER",
]);

export const MobileAdminCaseSummarySchema = z
  .object({
    assigneeHandle: z.string().nullable(),
    caseId: z.string().min(1),
    openedAt: z.string().datetime(),
    priority: MobileAdminCasePrioritySchema,
    publicNumber: z.number().int().positive(),
    reportCount: z.number().int().nonnegative(),
    status: MobileAdminCaseStatusSchema,
    subjectHandle: z.string().min(1),
  })
  .strict();

export const MobileAdminCaseListResponseSchema = z
  .object({ cases: z.array(MobileAdminCaseSummarySchema).max(MOBILE_ADMIN_QUEUE_MAX_COUNT) })
  .strict();

/**
 * An evidence row is a snapshot summary, never the live message: the case file
 * keeps its own copy so a deleted source cannot erase the record.
 */
export const MobileAdminEvidenceSchema = z
  .object({
    evidenceId: z.string().min(1),
    preview: z.string().max(MOBILE_ADMIN_PREVIEW_MAX_LENGTH),
    scope: z.string().nullable(),
  })
  .strict();

export const MobileAdminReportSchema = z
  .object({
    createdAt: z.string().datetime(),
    details: z.string().nullable(),
    reason: MobileAdminReportReasonSchema,
    reportId: z.string().min(1),
  })
  .strict();

export const MobileAdminCaseDetailSchema = MobileAdminCaseSummarySchema.extend({
  evidence: z.array(MobileAdminEvidenceSchema).max(MOBILE_ADMIN_EVIDENCE_MAX_COUNT),
  reports: z.array(MobileAdminReportSchema).max(MOBILE_ADMIN_REPORT_MAX_COUNT),
}).strict();

export const MobileAdminCaseDetailResponseSchema = z
  .object({ case: MobileAdminCaseDetailSchema })
  .strict();

export const MobileAdminCaseClaimResponseSchema = z
  .object({ caseId: z.string().min(1), claimed: z.literal(true) })
  .strict();

export const MobileAdminCaseDismissResponseSchema = z
  .object({ caseId: z.string().min(1), status: MobileAdminCaseStatusSchema })
  .strict();

export const MobileAdminCaseEscalateResponseSchema = z
  .object({ caseId: z.string().min(1), priority: z.literal("URGENT") })
  .strict();

export type MobileAdminCasePriority = z.infer<typeof MobileAdminCasePrioritySchema>;
export type MobileAdminCaseStatus = z.infer<typeof MobileAdminCaseStatusSchema>;
export type MobileAdminReportReason = z.infer<typeof MobileAdminReportReasonSchema>;
export type MobileAdminCaseSummary = z.infer<typeof MobileAdminCaseSummarySchema>;
export type MobileAdminCaseListResponse = z.infer<typeof MobileAdminCaseListResponseSchema>;
export type MobileAdminEvidence = z.infer<typeof MobileAdminEvidenceSchema>;
export type MobileAdminReport = z.infer<typeof MobileAdminReportSchema>;
export type MobileAdminCaseDetail = z.infer<typeof MobileAdminCaseDetailSchema>;
export type MobileAdminCaseDetailResponse = z.infer<typeof MobileAdminCaseDetailResponseSchema>;
export type MobileAdminCaseClaimResponse = z.infer<typeof MobileAdminCaseClaimResponseSchema>;
export type MobileAdminCaseDismissResponse = z.infer<typeof MobileAdminCaseDismissResponseSchema>;
export type MobileAdminCaseEscalateResponse = z.infer<typeof MobileAdminCaseEscalateResponseSchema>;
