import { WebBugReportRequestSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { submitMobileBugReport } from "@/lib/support/bug-report-service";

/**
 * SPEC-INDIRME §A "Sorun bildir" — web ve masaüstü ucu.
 *
 * `mobile/support/report` ile aynı gövdeyi aynı servise verir; tek fark kimlik
 * katmanıdır (oturum çerezi, taşıyıcı jeton değil). İkinci bir yazma yolu
 * açılmadı çünkü bilet üretimi, 90 günlük `purgeAfter` sözü, ek claim'i ve
 * `bugHunter` rozeti tek serviste yaşıyor; ikinci yol bunların birinden
 * sessizce sapardı.
 */

export type SupportReportRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string, action: "support:report"): Promise<void>;
  parseBody: typeof parseJsonBody;
  submitReport: typeof submitMobileBugReport;
};

const defaultDependencies: SupportReportRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  submitReport: submitMobileBugReport,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function supportReportSubmitRoute(
  request: Request,
  dependencies: SupportReportRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "support:report");
    const input = await dependencies.parseBody(request, WebBugReportRequestSchema);
    const payload = await dependencies.submitReport({ ...input, userId });

    return Response.json(payload, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
