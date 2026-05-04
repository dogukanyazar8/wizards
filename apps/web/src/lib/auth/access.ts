import { ApiError } from "@/lib/api";

export type AuthAccessUser = {
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
};

export function isActiveAuthUser(
  user: AuthAccessUser | null | undefined,
): user is AuthAccessUser {
  return Boolean(user && !user.isBanned && user.emailVerified);
}

export function assertActiveApiUser(user: AuthAccessUser | null | undefined): asserts user is AuthAccessUser {
  if (!user) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (user.isBanned) {
    throw new ApiError("Your account has been suspended", 403, "ACCOUNT_SUSPENDED");
  }

  if (!user.emailVerified) {
    throw new ApiError("Verify your email address before continuing", 403, "EMAIL_VERIFICATION_REQUIRED");
  }
}
