import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      locale: string | null;
      theme: string | null;
    };
  }

  interface User {
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    locale?: string | null;
    theme?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    locale?: string | null;
    theme?: string | null;
  }
}
