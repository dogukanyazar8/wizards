import { createHash, timingSafeEqual } from "node:crypto";

import { ApiError } from "@/lib/api";
import type { AdminAccessUser } from "@/lib/admin/access";

type ReleasePublisherEnvironment = Partial<
  Record<
    "WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID" | "WHISPR_RELEASE_PUBLISH_TOKEN",
    string | undefined
  >
>;

function tokenDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function tryReleasePublisherUserId(
  request: Request,
  environment: ReleasePublisherEnvironment = {
    WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID: process.env.WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID,
    WHISPR_RELEASE_PUBLISH_TOKEN: process.env.WHISPR_RELEASE_PUBLISH_TOKEN,
  },
): string | null {
  const authorization = request.headers.get("authorization");
  const expected = environment.WHISPR_RELEASE_PUBLISH_TOKEN?.trim();
  const adminUserId = environment.WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID?.trim();
  if (!authorization?.startsWith("Bearer ") || !expected || expected.length < 32 || !adminUserId) {
    return null;
  }
  const supplied = authorization.slice("Bearer ".length).trim();
  return supplied.length >= 32 && timingSafeEqual(tokenDigest(supplied), tokenDigest(expected))
    ? adminUserId
    : null;
}

export async function requireReleasePublisherOrAdmin(
  request: Request,
  requireInteractiveAdmin: () => Promise<AdminAccessUser>,
  environment: ReleasePublisherEnvironment = {
    WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID: process.env.WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID,
    WHISPR_RELEASE_PUBLISH_TOKEN: process.env.WHISPR_RELEASE_PUBLISH_TOKEN,
  },
): Promise<AdminAccessUser> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return requireInteractiveAdmin();
  }

  const supplied = authorization.slice("Bearer ".length).trim();
  const expected = environment.WHISPR_RELEASE_PUBLISH_TOKEN?.trim();
  const adminUserId = environment.WHISPR_RELEASE_PUBLISH_ADMIN_USER_ID?.trim();
  if (!expected || expected.length < 32 || !adminUserId) {
    throw new ApiError(
      "Release publisher authentication is not configured",
      503,
      "RELEASE_PUBLISH_NOT_CONFIGURED",
    );
  }
  if (supplied.length < 32 || !timingSafeEqual(tokenDigest(supplied), tokenDigest(expected))) {
    throw new ApiError(
      "Release publisher authentication failed",
      401,
      "RELEASE_PUBLISH_UNAUTHORIZED",
    );
  }

  // This id must name a dedicated, active service user so audit-log foreign
  // keys remain valid. The token grants release publication plus the read-only
  // post-publication update-decision verification.
  return {
    email: "release-publisher@whispr.internal",
    id: adminUserId,
    role: "ADMIN",
    username: "release-publisher",
  };
}
