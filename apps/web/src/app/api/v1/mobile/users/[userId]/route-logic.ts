import {
  MobileFriendUserParamsSchema,
  MobileUserNoteResponseSchema,
  MobileUserNoteUpdateSchema,
  MobileUserProfileQuerySchema,
  MobileUserProfileResponseSchema,
  MobileUserReportRequestSchema,
  MobileUserReportResponseSchema,
  type MobileUserReportReason,
} from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { saveMobileUserNote } from "@/lib/social/mobile-user-note-service";
import {
  createMobileUserReport,
  getMobileUserProfile,
} from "@/lib/social/mobile-user-profile-service";

export type MobileUserRouteContext = { params: Promise<Record<string, string>> };

export type MobileUserRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  createReport: typeof createMobileUserReport;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getProfile: typeof getMobileUserProfile;
  parseBody: typeof parseJsonBody;
  saveNote: typeof saveMobileUserNote;
};

const defaultDependencies: MobileUserRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  createReport: createMobileUserReport,
  enforceRateLimit: enforceApiRateLimit,
  getProfile: getMobileUserProfile,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  saveNote: saveMobileUserNote,
};

/** Contract reason → stored enum. Kept explicit so a new reason cannot silently widen the column. */
const REPORT_REASONS: Record<
  MobileUserReportReason,
  "HARASSMENT" | "IMPERSONATION" | "INAPPROPRIATE" | "OTHER" | "SPAM"
> = {
  harassment: "HARASSMENT",
  impersonation: "IMPERSONATION",
  inappropriate: "INAPPROPRIATE",
  other: "OTHER",
  spam: "SPAM",
};

export async function mobileUserProfileRoute(
  request: Request,
  context: MobileUserRouteContext,
  dependencies: MobileUserRouteDependencies = defaultDependencies,
) {
  try {
    const requesterId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(requesterId, "mobile:users:profile");
    const { userId } = MobileFriendUserParamsSchema.parse(await context.params);
    const { serverId } = MobileUserProfileQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    return Response.json(
      MobileUserProfileResponseSchema.parse({
        profile: await dependencies.getProfile({
          requesterId,
          userId,
          ...(serverId === undefined ? {} : { serverId }),
        }),
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * 11e note write (handoff 2b). The author is always the session user — the path
 * names the subject only — so no request can read or write a note that belongs
 * to someone else, whatever it puts in the body.
 */
export async function mobileUserNoteRoute(
  request: Request,
  context: MobileUserRouteContext,
  dependencies: MobileUserRouteDependencies = defaultDependencies,
) {
  try {
    const requesterId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(requesterId, "mobile:users:note");
    const { userId } = MobileFriendUserParamsSchema.parse(await context.params);
    const { body } = await dependencies.parseBody(request, MobileUserNoteUpdateSchema);

    return Response.json(
      MobileUserNoteResponseSchema.parse(
        await dependencies.saveNote({ authorId: requesterId, subjectId: userId }, body),
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileUserReportRoute(
  request: Request,
  context: MobileUserRouteContext,
  dependencies: MobileUserRouteDependencies = defaultDependencies,
) {
  try {
    const requesterId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(requesterId, "mobile:users:report");
    const { userId } = MobileFriendUserParamsSchema.parse(await context.params);
    const body = await dependencies.parseBody(request, MobileUserReportRequestSchema);

    return Response.json(
      MobileUserReportResponseSchema.parse(
        await dependencies.createReport({
          details: body.details ?? null,
          reason: REPORT_REASONS[body.reason],
          reporterId: requesterId,
          subjectId: userId,
        }),
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
