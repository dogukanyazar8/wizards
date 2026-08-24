import { ApiError } from "@/lib/api";

export type AuthAccessUser = {
  deletedAt?: Date | string | null;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
};

export function isActiveAuthUser(user: AuthAccessUser | null | undefined): user is AuthAccessUser {
  return Boolean(user && !user.deletedAt && !user.isBanned && user.emailVerified);
}

export function assertActiveApiUser(
  user: AuthAccessUser | null | undefined,
): asserts user is AuthAccessUser {
  if (!user) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (user.isBanned) {
    throw new ApiError("Your account has been suspended", 403, "ACCOUNT_SUSPENDED");
  }

  if (user.deletedAt) {
    throw new ApiError("This account has been deleted", 403, "ACCOUNT_DELETED");
  }

  if (!user.emailVerified) {
    throw new ApiError(
      "Verify your email address before continuing",
      403,
      "EMAIL_VERIFICATION_REQUIRED",
    );
  }
}
