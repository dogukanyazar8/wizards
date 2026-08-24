import type { JWT } from "next-auth/jwt";

/**
 * E2E oturum token'ının gövdesi.
 *
 * `authSessionId` + `sessionStartedAt` **zorunludur**: `auth.ts`'in `jwt` geri çağrısı her istekte
 * `validateAuthSessionToken` koşuyor ve `parseAuthSessionIdentity` bu iki alandan birini bulamazsa
 * token'ı `revoked` sayıyor (`@/lib/auth/session-revocation`). Kimliksiz token, geçerli görünen ama
 * ilk sayfa isteğinde `/login`'e dönen bir çerez üretir.
 */
export type E2ESessionUser = {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly isBanned: boolean;
  readonly locale: string | null;
  readonly theme: string | null;
  readonly username: string;
};

export type E2ESessionTokenInput = {
  readonly authSessionId: string;
  readonly issuedAtSeconds: number;
  readonly jti: string;
  readonly maxAgeSeconds: number;
  readonly user: E2ESessionUser;
};

export function buildE2ESessionToken(input: E2ESessionTokenInput): JWT {
  const authSessionId = input.authSessionId.trim();

  if (!authSessionId) {
    throw new Error("E2E session token requires a non-empty authSessionId");
  }

  const { issuedAtSeconds, user } = input;

  return {
    authSessionId,
    authSessionTouchedAt: issuedAtSeconds,
    authStatusHydrated: true,
    avatarUrl: user.avatarUrl,
    deletedAt: null,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    exp: issuedAtSeconds + input.maxAgeSeconds,
    iat: issuedAtSeconds,
    id: user.id,
    isBanned: user.isBanned,
    jti: input.jti,
    locale: user.locale,
    name: user.displayName ?? user.username,
    profileHydrated: true,
    // Deliberately absent. `validateAuthSessionToken` only re-reads the
    // revocation key every `SESSION_REVOCATION_CHECK_INTERVAL_SECONDS` (60);
    // stamping the mint time here bought a freshly issued test session a full
    // minute of immunity, which is exactly what
    // `auth-regression.spec.ts: "session revocation invalidates an already
    // issued Auth.js session"` exists to catch. Leaving it unset makes the very
    // first request check.
    sessionStartedAt: issuedAtSeconds,
    sub: user.id,
    theme: user.theme,
    username: user.username,
  };
}
