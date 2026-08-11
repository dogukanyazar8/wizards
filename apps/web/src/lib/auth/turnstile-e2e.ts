export const E2E_TURNSTILE_TOKEN = "wizards-e2e-turnstile-token";

export function isE2ETurnstileBypassEnabled(env?: Record<string, string | undefined>) {
  // Keep the default path as direct property reads. Next.js inlines public env vars in
  // browser bundles only for static member expressions, and a dynamic process.env
  // object default can make SSR and hydration disagree.
  const e2eMode = env ? env.NEXT_PUBLIC_E2E_TEST_MODE : process.env.NEXT_PUBLIC_E2E_TEST_MODE;
  const allowProductionBuild = env
    ? env.NEXT_PUBLIC_E2E_ALLOW_PRODUCTION_BUILD
    : process.env.NEXT_PUBLIC_E2E_ALLOW_PRODUCTION_BUILD;
  const nodeEnv = env ? env.NODE_ENV : process.env.NODE_ENV;

  return e2eMode === "true" && (nodeEnv !== "production" || allowProductionBuild === "true");
}
