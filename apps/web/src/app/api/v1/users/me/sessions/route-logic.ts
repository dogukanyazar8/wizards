import type {
  AuthSessionRevokeOthersResponse,
  AuthSessionRevokeResponse,
  AuthSessionsResponse,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  listAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
  type AuthSessionRecord,
} from "@/lib/auth/auth-session-service";
import { revokeMobileSession } from "@/lib/mobile/auth";

export type AuthSessionRouteContext = { sessionId: string; userId: string };

type ListDependencies = {
  list(userId: string, currentSessionId: string): Promise<AuthSessionsResponse>;
};

type DeleteDependencies = {
  revoke(userId: string, sessionId: string): Promise<AuthSessionRecord | null>;
  revokeMobile(input: { sessionId?: string | null }): Promise<void>;
};

type RevokeOthersDependencies = {
  revokeMobile(input: { sessionId?: string | null }): Promise<void>;
  revokeOthers(userId: string, currentSessionId: string): Promise<AuthSessionRecord[]>;
};

const defaultListDependencies: ListDependencies = { list: listAuthSessions };
const defaultDeleteDependencies: DeleteDependencies = {
  revoke: revokeAuthSession,
  revokeMobile: revokeMobileSession,
};
const defaultRevokeOthersDependencies: RevokeOthersDependencies = {
  revokeMobile: revokeMobileSession,
  revokeOthers: revokeOtherAuthSessions,
};

export function getAuthSessionsRoute(
  context: AuthSessionRouteContext,
  dependencies: ListDependencies = defaultListDependencies,
) {
  return dependencies.list(context.userId, context.sessionId);
}

export async function deleteAuthSessionRoute(
  context: AuthSessionRouteContext,
  targetSessionId: string,
  dependencies: DeleteDependencies = defaultDeleteDependencies,
): Promise<AuthSessionRevokeResponse> {
  const revoked = await dependencies.revoke(context.userId, targetSessionId);
  if (!revoked) {
    throw new ApiError("Session not found", 404, "SESSION_NOT_FOUND");
  }

  if (revoked.clientType === "MOBILE") {
    await Promise.allSettled([dependencies.revokeMobile({ sessionId: revoked.id })]);
  }

  return {
    currentSessionRevoked: revoked.id === context.sessionId,
    revokedSessionId: revoked.id,
  };
}

export async function revokeOtherAuthSessionsRoute(
  context: AuthSessionRouteContext,
  dependencies: RevokeOthersDependencies = defaultRevokeOthersDependencies,
): Promise<AuthSessionRevokeOthersResponse> {
  const revoked = await dependencies.revokeOthers(context.userId, context.sessionId);
  await Promise.allSettled(
    revoked
      .filter(({ clientType }) => clientType === "MOBILE")
      .map(({ id }) => dependencies.revokeMobile({ sessionId: id })),
  );
  return { revokedCount: revoked.length };
}
