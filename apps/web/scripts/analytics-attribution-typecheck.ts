/**
 * Type-level guard, not a runtime test. It fails `pnpm --filter @wizards/web
 * typecheck` if `incrementUserDailyMetric` ever regains a default attribution:
 * a default is what lets a new metric writer record UNKNOWN unnoticed.
 *
 * The `@ts-expect-error` lines below are the assertion — if the call starts
 * compiling, TypeScript reports the unused expectation as an error.
 */
import { UNKNOWN_ATTRIBUTION } from "@/lib/analytics/client-attribution";
import { incrementMetricAcrossInterval, incrementUserDailyMetric } from "@/lib/analytics/service";

export async function attributionIsRequired() {
  // @ts-expect-error attribution is required — a metric may not be written blind.
  await incrementUserDailyMetric("user-1", { messageCount: 1 });

  // @ts-expect-error the interval writer carries the same obligation.
  await incrementMetricAcrossInterval("user-1", new Date(), new Date(), "appSeconds");

  // Writing UNKNOWN stays possible, but only by saying so.
  await incrementUserDailyMetric("user-1", { messageCount: 1 }, UNKNOWN_ATTRIBUTION);
}
