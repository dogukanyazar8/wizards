export type E2ETimeoutPolicy = {
  authRequestTimeoutMs: number;
  screenTestTimeoutMs: number;
};

/**
 * Screen tests compose an authenticated API call with one or more client-side
 * readiness checks. Their total timeout must exceed the individual CI budgets,
 * otherwise a healthy but cold production server is reported as a UI failure.
 */
export function resolveE2ETimeoutPolicy(
  environment: { CI?: string | undefined } = { CI: process.env.CI },
): E2ETimeoutPolicy {
  if (environment.CI === "true") {
    return {
      authRequestTimeoutMs: 30_000,
      screenTestTimeoutMs: 75_000,
    };
  }

  return {
    authRequestTimeoutMs: 15_000,
    screenTestTimeoutMs: 45_000,
  };
}
