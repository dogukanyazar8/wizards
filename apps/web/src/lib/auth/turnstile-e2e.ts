export const E2E_TURNSTILE_TOKEN = "wizards-e2e-turnstile-token";

export function isE2ETurnstileBypassEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.NEXT_PUBLIC_E2E_TEST_MODE === "true" && env.NODE_ENV !== "production";
}
