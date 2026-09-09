import type { SecurityEvent } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  SECURITY_EVENT_LIST_LIMIT,
  listSecurityEvents,
  serializeSecurityEvent,
  type SecurityEventRecord,
} from "@/lib/security/security-event-service";

export type SecurityEventsResponse = { events: SecurityEvent[] };

export type SecurityEventsRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string): Promise<void>;
  list(userId: string, limit: number): Promise<SecurityEventRecord[]>;
};

const defaultDependencies: SecurityEventsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: (userId) => enforceApiRateLimit(userId, "account:security-events"),
  list: (userId, limit) => listSecurityEvents(userId, limit),
};

/**
 * Ş3 §3. Ten rows, enums and ISO timestamps only — `Yeni cihazdan giriş · Chrome · İstanbul, TR`
 * is assembled from `settings.security.event.*` on the client. The stored `ipHash` never leaves
 * the database: it exists so support can correlate two events, not so a browser can read it.
 */
export async function securityEventsRoute(
  dependencies: SecurityEventsRouteDependencies = defaultDependencies,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId);
    const events = await dependencies.list(userId, SECURITY_EVENT_LIST_LIMIT);

    return Response.json(
      { events: events.map(serializeSecurityEvent) } satisfies SecurityEventsResponse,
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
