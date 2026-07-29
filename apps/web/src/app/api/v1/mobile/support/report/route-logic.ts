import { MobileBugReportRequestSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { submitMobileBugReport } from "@/lib/support/bug-report-service";

/**
 * 2f "Sorun bildir".
 *
 * JSON, not multipart: the screenshot rides the existing mobile upload flow and
 * arrives here as `screenshotUploadKey`, so this does not open a second upload
 * path with its own size, type and cleanup rules.
 */

export type MobileBugReportRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:support:report"): Promise<void>;
  parseBody: typeof parseJsonBody;
  submitReport: typeof submitMobileBugReport;
};

const defaultDependencies: MobileBugReportRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  submitReport: submitMobileBugReport,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileBugReportSubmitRoute(
  request: Request,
  dependencies: MobileBugReportRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:support:report");
    const input = await dependencies.parseBody(request, MobileBugReportRequestSchema);
    const payload = await dependencies.submitReport({ ...input, userId });

    return Response.json(payload, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
