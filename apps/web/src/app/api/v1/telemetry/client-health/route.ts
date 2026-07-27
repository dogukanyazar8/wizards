import { jsonError, parseJsonBody } from "@/lib/api";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";
import { requireApiUserId, requireMobileApiSession } from "@/lib/auth/api";
import {
  parseClientHealthBatch,
  recordClientHealthEvents,
} from "@/lib/telemetry/client-health-service";

const RawBodySchema = z.unknown();

/**
 * Identity is best effort: a crash report can arrive before anyone signs in.
 * The service refuses anonymous measurements, and the rate limit falls back to
 * the hashed address so an unauthenticated flood still hits a ceiling.
 */
async function resolveReporter(request: Request) {
  try {
    return await requireApiUserId();
  } catch {
    try {
      const session = await requireMobileApiSession(request);
      return session.userId;
    } catch {
      return null;
    }
  }
}

export async function POST(request: Request) {
  try {
    const clientInfo = getAnalyticsClientInfo(request.headers);
    const userId = await resolveReporter(request);

    await enforceApiRateLimit(
      userId ?? `anon:${clientInfo.ipHash ?? "unknown"}`,
      "telemetry:client-health",
    );

    const body = await parseJsonBody(request, RawBodySchema);
    const batch = parseClientHealthBatch(body);
    const result = await recordClientHealthEvents({
      attribution: {
        appVersion: clientInfo.appVersion,
        clientType: clientInfo.clientType,
        os: clientInfo.os,
      },
      batch,
      userId,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
