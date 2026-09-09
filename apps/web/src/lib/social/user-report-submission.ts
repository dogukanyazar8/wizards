import {
  MobileUserReportResponseSchema,
  type MobileUserReportReason,
  type MobileUserReportRequest,
  type MobileUserReportResponse,
} from "@wizards/types";

import { createMobileUserReport } from "@/lib/social/mobile-user-profile-service";

/**
 * Karar K12 — the one place a user report is turned into a moderation case,
 * whichever front door it came through.
 *
 * The web `Bildir` row (§15.5) and the mobile profile sheet write the *same*
 * record on purpose: a moderator reading the queue must not be able to tell
 * which client filed a report, because "came from the phone" is not a fact that
 * should change how a case is judged. Two routes calling two builders is how
 * that difference creeps in — a field one of them forgets, a case one of them
 * skips — so both call this instead.
 *
 * Self-reports (400), a missing subject (404), the moderation case and the
 * evidence capture all live inside `createMobileUserReport` and are not
 * re-implemented here; duplicating the self-report guard would be a second place
 * for it to disagree with the first.
 */
export type CreateUserReport = typeof createMobileUserReport;

/**
 * Contract reason → stored enum. Explicit so a new reason in the contract cannot
 * silently widen the column.
 */
export const USER_REPORT_REASONS: Record<
  MobileUserReportReason,
  "HARASSMENT" | "IMPERSONATION" | "INAPPROPRIATE" | "OTHER" | "SPAM"
> = {
  harassment: "HARASSMENT",
  impersonation: "IMPERSONATION",
  inappropriate: "INAPPROPRIATE",
  other: "OTHER",
  spam: "SPAM",
};

export async function submitUserReport(
  input: {
    body: MobileUserReportRequest;
    reporterId: string;
    subjectId: string;
  },
  createReport: CreateUserReport = createMobileUserReport,
): Promise<MobileUserReportResponse> {
  const { body } = input;

  // Only the report id travels back. Nothing about the reported account —
  // not a name, not a handle, not a count of their other reports — belongs in a
  // response that anyone able to type a user id can trigger.
  return MobileUserReportResponseSchema.parse(
    await createReport({
      ...(body.attachmentId ? { attachmentId: body.attachmentId } : {}),
      details: body.details ?? null,
      ...(body.dmMessageId ? { dmMessageId: body.dmMessageId } : {}),
      ...(body.messageId ? { messageId: body.messageId } : {}),
      reason: USER_REPORT_REASONS[body.reason],
      reporterId: input.reporterId,
      subjectId: input.subjectId,
    }),
  );
}
