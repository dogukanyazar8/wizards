/**
 * The deployment's own canonical origin, in the precedence
 * `buildMobileInviteShareUrl` (invite-service.ts) already established:
 * `APP_URL` → `AUTH_URL` → `NEXTAUTH_URL`. Keeping the order identical is the
 * point — a link the user copies from the profile card and a link minted by
 * the invite flow must never disagree about which host this is.
 *
 * Unlike that function this one never throws. It backs a *display* string
 * (6c's identity row, 6d's address line); a deployment missing the variable
 * should lose the address line, not 500 the whole profile read.
 */
/**
 * The three keys this reads, named so a caller can see them, plus the index
 * signature `process.env` carries — without it every property here is optional
 * and TypeScript's weak-type check rejects `ProcessEnv` for having "nothing in
 * common" with the shape.
 */
export interface AppOriginEnv {
  readonly [key: string]: string | undefined;
  readonly APP_URL?: string | undefined;
  readonly AUTH_URL?: string | undefined;
  readonly NEXTAUTH_URL?: string | undefined;
}

export function resolveAppOrigin(env: AppOriginEnv = process.env): URL | null {
  const rawOrigin = [env.APP_URL, env.AUTH_URL, env.NEXTAUTH_URL]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));

  if (!rawOrigin) {
    return null;
  }

  try {
    return new URL(rawOrigin);
  } catch {
    return null;
  }
}

/**
 * The origin as it is shown to a person: no scheme, no trailing slash, no
 * `www.`. `https://wizardsweb-uat.up.railway.app/` reads as
 * `wizardsweb-uat.up.railway.app`. The port survives, because a link without
 * it would not open in local development.
 */
export function resolveAppOriginDisplayHost(env: AppOriginEnv = process.env): string | null {
  const origin = resolveAppOrigin(env);
  if (!origin) {
    return null;
  }

  return origin.host.replace(/^www\./, "");
}
