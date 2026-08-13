import type { DefaultSession } from "next-auth";

type WhisprDefaultSessionUser = NonNullable<DefaultSession["user"]>;

declare module "next-auth" {
  interface Session {
    authSessionId: string | null;
    user: Omit<WhisprDefaultSessionUser, "emailVerified"> & {
      id: string;
      username: string | null;
      authEmailVerified: boolean;
      displayName: string | null;
      avatarUrl: string | null;
      deletedAt: string | null;
      isBanned: boolean;
      locale: string | null;
      theme: string | null;
    };
  }

  interface User {
    authEmailVerified?: boolean;
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    deletedAt?: Date | string | null;
    emailVerified?: Date | null;
    isBanned?: boolean;
    locale?: string | null;
    theme?: string | null;
    revoked?: boolean;
    revocationCheckedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authSessionId?: string;
    authSessionTouchedAt?: number;
    id?: string;
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    authStatusHydrated?: boolean;
    deletedAt?: string | null;
    emailVerified?: boolean;
    isBanned?: boolean;
    locale?: string | null;
    profileHydrated?: boolean;
    rememberMe?: boolean;
    revoked?: boolean;
    revocationCheckedAt?: number;
    sessionStartedAt?: number;
    theme?: string | null;
  }
}
