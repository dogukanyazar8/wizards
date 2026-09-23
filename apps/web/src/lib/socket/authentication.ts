import { parseAuthSessionIdentity, validateAuthSessionToken } from "@/lib/auth/session-revocation";
import { SOCKET_SESSION_CHECK_UNAVAILABLE } from "./events";

export class SocketAuthenticationUnavailableError extends Error {
  readonly data = { code: SOCKET_SESSION_CHECK_UNAVAILABLE };

  constructor() {
    super("Session verification temporarily unavailable");
  }
}

export type SocketAuthUser = {
  customStatus: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  emailVerified: Date | boolean | null;
  id: string;
  isBanned: boolean;
  sessionsRevokedAfter: Date | null;
  settings: { presenceVisibility: "EVERYONE" | "FRIENDS" | "NOBODY" } | null;
  username: string;
};

type MobileAccessClaims = {
  scopes: readonly string[];
  sessionId: string;
  userId: string;
};

type AuthenticatedSocketUser = {
  authSessionId: string;
  authSessionStartedAtSeconds?: number;
  clientType: "MOBILE" | "WEB";
  user: SocketAuthUser;
};

export function isActiveSocketAuthUser(
  user: SocketAuthUser | null | undefined,
): user is SocketAuthUser {
  return Boolean(user && !user.deletedAt && !user.isBanned && user.emailVerified);
}

export async function authenticateWebSocketToken(
  token: Record<string, unknown>,
  options: {
    checkAuthSession(userId: string, sessionId: string): Promise<boolean | null>;
    checkGlobalRevocation(
      userId: string,
      sessionStartedAtSeconds: number,
      loadUser: () => Promise<SocketAuthUser | null>,
    ): Promise<boolean | undefined>;
    loadUser(userId: string): Promise<SocketAuthUser | null>;
  },
): Promise<AuthenticatedSocketUser | null> {
  const identity = parseAuthSessionIdentity(token);
  if (token.revoked === true || !identity) {
    return null;
  }

  // Attach the rejection handler immediately: the parallel session checks may
  // take longer than a failing user lookup.
  const userPromise = options.loadUser(identity.userId).then(
    (user) => ({ user, unavailable: false }),
    () => ({ user: null, unavailable: true }),
  );
  const validation = await validateAuthSessionToken(token, {
    checkAuthSession: options.checkAuthSession,
    checkGlobalRevocation: (userId, startedAtSeconds) =>
      options.checkGlobalRevocation(userId, startedAtSeconds, async () => {
        const result = await userPromise;
        if (result.unavailable) throw new SocketAuthenticationUnavailableError();
        return result.user;
      }),
  });
  const { user, unavailable } = await userPromise;

  if (validation.status === "revoked") return null;
  if (validation.status === "unavailable" || unavailable) {
    throw new SocketAuthenticationUnavailableError();
  }

  if (validation.status !== "active" || !isActiveSocketAuthUser(user)) {
    return null;
  }

  return {
    authSessionId: identity.authSessionId,
    authSessionStartedAtSeconds: identity.sessionStartedAtSeconds,
    clientType: "WEB",
    user,
  };
}

export async function authenticateMobileSocketToken(
  rawToken: string,
  options: {
    checkSession(claims: MobileAccessClaims): Promise<boolean>;
    loadUser(userId: string): Promise<SocketAuthUser | null>;
    verifyToken(rawToken: string): MobileAccessClaims | null;
  },
): Promise<AuthenticatedSocketUser | null> {
  const claims = options.verifyToken(rawToken);
  if (!claims?.scopes.includes("mobile:bootstrap")) {
    return null;
  }

  if (!(await options.checkSession(claims))) {
    return null;
  }

  const user = await options.loadUser(claims.userId);
  if (!isActiveSocketAuthUser(user)) {
    return null;
  }

  return {
    authSessionId: claims.sessionId,
    clientType: "MOBILE",
    user,
  };
}
