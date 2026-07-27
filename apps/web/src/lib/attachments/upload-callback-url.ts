const CALLBACK_PATH = "/api/uploadthing";
const ORIGIN_ENV_VARS = ["APP_URL", "AUTH_URL", "NEXTAUTH_URL"] as const;

/**
 * The absolute URL UploadThing's ingest calls to run `onUploadComplete`.
 *
 * Left unset, the SDK derives it from the incoming request. Behind a proxy that
 * terminates TLS the derived value can be `http://…`, which this app answers
 * with a 301 to https — a redirect the ingest does not follow. The callback then
 * never runs, and every client that waits for server data (the default) waits
 * until it gives up: on a phone, an upload that reaches 100% and never answers.
 *
 * Returning `null` leaves the SDK's own derivation in place, which is the right
 * behaviour when nothing is configured to pin it to.
 */
export function resolveUploadCallbackUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  for (const name of ORIGIN_ENV_VARS) {
    const configured = env[name]?.trim();
    if (!configured) {
      continue;
    }

    try {
      const origin = new URL(configured);
      if (origin.protocol !== "https:" && origin.protocol !== "http:") {
        continue;
      }

      return new URL(CALLBACK_PATH, origin.origin).toString();
    } catch {
      continue;
    }
  }

  return null;
}
