import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma, type User as PrismaUser } from "@wizards/db";
import { LoginCredentialsSchema } from "@wizards/types";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthConfig, type NextAuthResult } from "next-auth";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import { decode as decodeJwt, encode as encodeJwt } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DEFAULT_WIZARDS_THEME, normalizeWizardsThemeId } from "@/lib/appearance";
import { normalizeAppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";
import { getRequestLocale } from "@/lib/locale/server";
import {
  buildUsernameCandidate,
  MAX_USERNAME_LENGTH,
  normalizeUsername as normalizeStableUsername,
} from "@/lib/auth/username";
import { isActiveAuthUser } from "@/lib/auth/access";
import { verifyLoginProof } from "@/lib/auth/login-proof";
import {
  canOAuthUserSignIn,
  getOAuthProfileEmail,
  isGoogleEmailVerified,
  type OAuthEmailAccount,
} from "@/lib/auth/oauth-email";
import {
  getAuthSessionCookieConfig,
  getAuthSessionCookieOptions,
} from "@/lib/auth/session-cookies";
import { isUserSessionRevoked, shouldCheckSessionRevocation } from "@/lib/auth/session-revocation";

function getAuthEnvCandidates() {
  return [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "apps/web/.env.local"),
    resolve(process.cwd(), "apps/web/.env"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), "../../.env"),
  ];
}

function loadAuthEnvironment() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  for (const candidate of getAuthEnvCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      process.loadEnvFile(candidate);
    } catch {
      // Next.js will still load supported env files; this only protects the
      // custom dev server and Auth.js route module from stale empty env values.
    }
  }
}

loadAuthEnvironment();

const REMEMBERED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SHORT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function parseRememberMeCredential(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  return ["1", "on", "true", "yes"].includes(value.toLowerCase());
}

function getJwtSessionMaxAge(token: unknown) {
  if (
    token &&
    typeof token === "object" &&
    "rememberMe" in token &&
    (token as { rememberMe?: unknown }).rememberMe === false
  ) {
    return SHORT_SESSION_MAX_AGE_SECONDS;
  }

  return REMEMBERED_SESSION_MAX_AGE_SECONDS;
}

function readLocalEnvValue(key: string): string {
  if (process.env.NODE_ENV === "production") {
    return "";
  }

  for (const candidate of getAuthEnvCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      const content = readFileSync(candidate, "utf8");
      const line = content.split(/\r?\n/).find((item) => item.trim().startsWith(`${key}=`));

      if (!line) {
        continue;
      }

      return line
        .slice(line.indexOf("=") + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    } catch {
      // Ignore unreadable local env files and keep checking other candidates.
    }
  }

  return "";
}

export function normalizeAuthEmail(rawValue: unknown): string {
  if (typeof rawValue !== "string") {
    return "";
  }

  return rawValue.trim().toLowerCase();
}

function deriveBaseUsername(data: { email?: string | null; name?: string | null }): string {
  if (data.name && data.name.trim().length > 0) {
    return normalizeStableUsername(data.name);
  }

  if (data.email) {
    const emailPrefix = data.email.split("@")[0] ?? "whispr";
    return normalizeStableUsername(emailPrefix);
  }

  return normalizeStableUsername("whispr");
}

async function getUniqueUsername(seed: string): Promise<string> {
  const safeSeed = normalizeStableUsername(seed);
  const firstCandidate = buildUsernameCandidate(safeSeed);

  const existingFirstCandidate = await prisma.user.findUnique({
    where: { username: firstCandidate },
    select: { id: true },
  });

  if (!existingFirstCandidate) {
    return firstCandidate;
  }

  for (let batch = 0; batch < 3; batch += 1) {
    const candidates = Array.from(
      new Set(
        Array.from({ length: 16 }, () =>
          buildUsernameCandidate(safeSeed, `_${randomBytes(4).toString("hex").slice(0, 6)}`),
        ),
      ),
    );

    const existingUsers = await prisma.user.findMany({
      where: { username: { in: candidates } },
      select: { username: true },
    });
    const existingUsernames = new Set(existingUsers.map((user) => user.username));
    const availableCandidate = candidates.find((candidate) => !existingUsernames.has(candidate));

    if (availableCandidate) {
      return availableCandidate;
    }
  }

  return buildUsernameCandidate(
    "whispr",
    `_${Date.now().toString(36)}${randomBytes(4).toString("hex").slice(0, 6)}`,
  ).slice(0, MAX_USERNAME_LENGTH);
}

function mapUserToAdapterUser(
  user: Pick<
    PrismaUser,
    "id" | "email" | "emailVerifiedAt" | "displayName" | "username" | "avatarUrl"
  >,
): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt ?? null,
    name: user.displayName ?? user.username,
    image: user.avatarUrl ?? null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function jwtDateStringOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" && value.length > 0 ? value : null;
}

function clearJwtUserState(token: {
  authStatusHydrated?: boolean;
  avatarUrl?: string | null;
  deletedAt?: string | null;
  displayName?: string | null;
  emailVerified?: boolean;
  id?: string;
  isBanned?: boolean;
  locale?: string | null;
  profileHydrated?: boolean;
  revoked?: boolean;
  sub?: string;
  theme?: string | null;
  username?: string | null;
}) {
  token.revoked = true;
  token.id = "";
  token.sub = "";
  token.username = null;
  token.displayName = null;
  token.avatarUrl = null;
  token.locale = null;
  token.theme = null;
  token.deletedAt = null;
  token.emailVerified = false;
  token.isBanned = true;
  token.authStatusHydrated = true;
  token.profileHydrated = true;
}

function getEnvValue(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim() || readLocalEnvValue(key);
    if (value) {
      return value;
    }
  }

  return "";
}

type OAuthAccountInput = AdapterAccount & {
  access_token?: string;
  expires_at?: number;
  id_token?: string;
  refresh_token?: string;
  session_state?: string;
  token_type?: string;
};

function stringField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

async function canOAuthUserAccessWhispr(args: {
  account: OAuthEmailAccount | null | undefined;
  profile: unknown;
  user: { email?: unknown; id?: unknown };
}) {
  if (!(await canOAuthUserSignIn(args))) {
    return false;
  }

  const email = getOAuthProfileEmail(args.profile) || normalizeAuthEmail(args.user.email);
  const userId = stringOrEmpty(args.user.id);
  const where =
    email && userId
      ? { OR: [{ email }, { id: userId }] }
      : email
        ? { email }
        : userId
          ? { id: userId }
          : null;

  if (!where) {
    return true;
  }

  const existingUser = await prisma.user.findFirst({
    where,
    select: {
      deletedAt: true,
      emailVerified: true,
      id: true,
      isBanned: true,
    },
  });

  return !existingUser || isActiveAuthUser(existingUser);
}

function normalizeAdapterAccount(account: OAuthAccountInput) {
  return {
    userId: account.userId,
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refreshToken: stringField(account.refresh_token ?? account.refreshToken),
    accessToken: stringField(account.access_token ?? account.accessToken),
    expiresAt: numberField(account.expires_at ?? account.expiresAt),
    tokenType: stringField(account.token_type ?? account.tokenType),
    scope: stringField(account.scope),
    idToken: stringField(account.id_token ?? account.idToken),
    sessionState:
      typeof account.session_state === "string"
        ? account.session_state
        : typeof account.sessionState === "string"
          ? account.sessionState
          : null,
  };
}

const baseAdapter = PrismaAdapter(prisma);

const adapter: Adapter = {
  ...baseAdapter,
  async createUser(data) {
    if (!data.email) {
      throw new Error("OAuth user is missing an email address.");
    }

    const normalizedEmail = normalizeAuthEmail(data.email);
    const username = await getUniqueUsername(
      deriveBaseUsername({
        ...data,
        email: normalizedEmail,
      }),
    );

    const createdUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username,
        displayName: data.name ?? username,
        avatarUrl: data.image ?? null,
        emailVerified: Boolean(data.emailVerified),
        emailVerifiedAt: data.emailVerified ?? null,
        locale: await getRequestLocale(),
        status: "ONLINE",
        theme: DEFAULT_WIZARDS_THEME,
        settings: { create: {} },
        notificationSettings: { create: {} },
      },
    });

    await persistUserLocale(createdUser.id, createdUser.locale);

    return mapUserToAdapterUser(createdUser);
  },
  async getUser(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        deletedAt: true,
        id: true,
        email: true,
        emailVerifiedAt: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    if (!user || user.deletedAt) {
      return null;
    }

    return mapUserToAdapterUser(user);
  },
  async getUserByEmail(email) {
    const normalizedEmail = normalizeAuthEmail(email);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        deletedAt: true,
        id: true,
        email: true,
        emailVerifiedAt: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    if (!user || user.deletedAt) {
      return null;
    }

    return mapUserToAdapterUser(user);
  },
  async updateUser(data) {
    if (!data.id) {
      throw new Error("User ID is required to update a user.");
    }

    const updateData: {
      email?: string;
      displayName?: string | null;
      avatarUrl?: string | null;
      emailVerified?: boolean;
      emailVerifiedAt?: Date | null;
    } = {};

    if (typeof data.email === "string") {
      updateData.email = normalizeAuthEmail(data.email);
    }

    if (data.name !== undefined) {
      updateData.displayName = data.name;
    }

    if (data.image !== undefined) {
      updateData.avatarUrl = data.image;
    }

    if (data.emailVerified !== undefined) {
      updateData.emailVerified = data.emailVerified !== null;
      updateData.emailVerifiedAt = data.emailVerified;
    }

    const updatedUser = await prisma.user.update({
      where: { id: data.id },
      data: updateData,
      select: {
        deletedAt: true,
        id: true,
        email: true,
        emailVerifiedAt: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    if (updatedUser.deletedAt) {
      throw new Error("Deleted users cannot be updated.");
    }

    return mapUserToAdapterUser(updatedUser);
  },
  async linkAccount(data) {
    await prisma.account.create({
      data: normalizeAdapterAccount(data as OAuthAccountInput),
    });

    return data;
  },
  async getUserByAccount(providerAccountId) {
    const account = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: providerAccountId,
      },
      include: {
        user: true,
      },
    });

    return account?.user && !account.user.deletedAt ? mapUserToAdapterUser(account.user) : null;
  },
  async getAccount(providerAccountId, provider): Promise<AdapterAccount | null> {
    const account = await prisma.account.findFirst({
      where: {
        provider,
        providerAccountId,
      },
    });

    if (!account) {
      return null;
    }

    return {
      userId: account.userId,
      type: account.type as AdapterAccount["type"],
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      refresh_token: account.refreshToken,
      access_token: account.accessToken,
      expires_at: account.expiresAt,
      token_type: account.tokenType,
      scope: account.scope,
      id_token: account.idToken,
      session_state: account.sessionState,
    } as AdapterAccount;
  },
};

const authConfig = {
  adapter,
  session: {
    strategy: "jwt",
    maxAge: REMEMBERED_SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: REMEMBERED_SESSION_MAX_AGE_SECONDS,
    async encode(params) {
      return encodeJwt({
        ...params,
        maxAge: getJwtSessionMaxAge(params.token),
      });
    },
    async decode(params) {
      return decodeJwt(params);
    },
  },
  cookies: {
    sessionToken: {
      name: getAuthSessionCookieConfig().cookieName,
      options: getAuthSessionCookieOptions(),
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        loginProof: { label: "Login proof", type: "text" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
      },
      async authorize(credentials) {
        const credentialRecord =
          credentials && typeof credentials === "object"
            ? (credentials as Record<string, unknown>)
            : null;

        const parsedCredentials = LoginCredentialsSchema.safeParse({
          email: normalizeAuthEmail(credentialRecord?.email),
          password: typeof credentialRecord?.password === "string" ? credentialRecord.password : "",
        });

        if (!parsedCredentials.success) {
          return null;
        }

        const { email: normalizedEmail, password } = parsedCredentials.data;
        const rememberMe = parseRememberMeCredential(credentialRecord?.rememberMe);
        const loginProof =
          typeof credentialRecord?.loginProof === "string" ? credentialRecord.loginProof : "";

        let hasValidLoginProof = false;
        try {
          hasValidLoginProof = verifyLoginProof(normalizedEmail, loginProof);
        } catch {
          hasValidLoginProof = false;
        }

        if (!hasValidLoginProof) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            emailVerified: true,
            deletedAt: true,
            locale: true,
            isBanned: true,
            passwordHash: true,
            theme: true,
          },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
          return null;
        }

        if (user.isBanned || user.deletedAt) {
          return null;
        }

        if (!user.emailVerified) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? user.username,
          image: user.avatarUrl ?? null,
          authEmailVerified: user.emailVerified,
          deletedAt: user.deletedAt,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isBanned: user.isBanned,
          locale: normalizeAppLocale(user.locale),
          rememberMe,
          theme: normalizeWizardsThemeId(user.theme),
        };
      },
    }),
    GitHub({
      allowDangerousEmailAccountLinking: false,
      authorization: { params: { scope: "read:user user:email" } },
      clientId: getEnvValue("GITHUB_CLIENT_ID", "AUTH_GITHUB_ID"),
      clientSecret: getEnvValue("GITHUB_CLIENT_SECRET", "AUTH_GITHUB_SECRET"),
      profile(profile) {
        const email = typeof profile.email === "string" ? profile.email : null;
        const login = typeof profile.login === "string" ? profile.login : "";
        const name = typeof profile.name === "string" ? profile.name : login;
        const image = typeof profile.avatar_url === "string" ? profile.avatar_url : null;

        return {
          id: String(profile.id),
          email,
          name,
          image,
          username: normalizeStableUsername(login || email?.split("@")[0] || "whispr"),
          displayName: name,
          avatarUrl: image,
        };
      },
    }),
    Google({
      // Google supplies email_verified; callbacks.signIn rejects unverified profiles before linking.
      allowDangerousEmailAccountLinking: true,
      clientId: getEnvValue("GOOGLE_CLIENT_ID", "AUTH_GOOGLE_ID"),
      clientSecret: getEnvValue("GOOGLE_CLIENT_SECRET", "AUTH_GOOGLE_SECRET"),
      profile(profile) {
        const email = typeof profile.email === "string" ? profile.email : null;
        const name = typeof profile.name === "string" ? profile.name : "";
        const image = typeof profile.picture === "string" ? profile.picture : null;
        const emailVerified = isGoogleEmailVerified(profile) ? new Date() : null;

        return {
          id: profile.sub,
          email,
          emailVerified,
          name,
          image,
          username: normalizeStableUsername(email?.split("@")[0] || name || "whispr"),
          displayName: name,
          avatarUrl: image,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.type === "oauth") {
        return canOAuthUserAccessWhispr({
          account,
          profile,
          user,
        });
      }

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const userRecord = user as typeof user & {
          authEmailVerified?: unknown;
          deletedAt?: unknown;
          isBanned?: unknown;
          rememberMe?: unknown;
        };
        const userId = stringOrEmpty(user.id);
        if (userId) {
          token.id = userId;
        }

        token.username =
          "username" in user && typeof user.username === "string" ? user.username : null;

        token.displayName =
          "displayName" in user && typeof user.displayName === "string"
            ? user.displayName
            : stringOrNull(user.name);

        token.avatarUrl =
          "avatarUrl" in user && typeof user.avatarUrl === "string"
            ? user.avatarUrl
            : stringOrNull(user.image);

        token.locale =
          "locale" in user && typeof user.locale === "string"
            ? normalizeAppLocale(user.locale)
            : stringOrNull(token.locale);

        token.theme =
          "theme" in user && typeof user.theme === "string"
            ? normalizeWizardsThemeId(user.theme)
            : stringOrNull(token.theme);

        token.deletedAt = jwtDateStringOrNull(userRecord.deletedAt);
        token.emailVerified =
          typeof userRecord.authEmailVerified === "boolean"
            ? userRecord.authEmailVerified
            : Boolean(user.emailVerified);
        token.isBanned = typeof userRecord.isBanned === "boolean" ? userRecord.isBanned : false;
        token.rememberMe =
          typeof userRecord.rememberMe === "boolean" ? userRecord.rememberMe : true;
        token.authStatusHydrated = true;
        token.profileHydrated = true;
      }

      if (trigger === "update" && session?.user?.locale) {
        token.locale = normalizeAppLocale(session.user.locale);
      }

      if (trigger === "update" && session?.user?.theme) {
        token.theme = normalizeWizardsThemeId(session.user.theme);
      }

      const revocationUserId = stringOrEmpty(token.id) || stringOrEmpty(token.sub);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const revocationCheckedAt =
        typeof token.revocationCheckedAt === "number" ? token.revocationCheckedAt : undefined;
      if (revocationUserId && shouldCheckSessionRevocation(revocationCheckedAt, nowSeconds)) {
        token.revocationCheckedAt = nowSeconds;

        if (
          await isUserSessionRevoked(
            revocationUserId,
            typeof token.iat === "number" ? token.iat : nowSeconds,
            {
              loadDurableRevokedAfter: async (userId) => {
                const user = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { sessionsRevokedAfter: true },
                });

                return user?.sessionsRevokedAfter ?? null;
              },
            },
          )
        ) {
          clearJwtUserState(token);
          return token;
        }
      }

      const tokenUserId = stringOrEmpty(token.id) || stringOrEmpty(token.sub);
      const needsTokenHydration =
        Boolean(tokenUserId) &&
        (!token.profileHydrated ||
          !token.authStatusHydrated ||
          typeof token.emailVerified !== "boolean" ||
          typeof token.isBanned !== "boolean" ||
          !("deletedAt" in token));

      if (needsTokenHydration) {
        const dbUser = await prisma.user.findUnique({
          where: { id: tokenUserId },
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            deletedAt: true,
            emailVerified: true,
            isBanned: true,
            locale: true,
            theme: true,
          },
        });

        if (dbUser) {
          token.username = dbUser.username;
          token.displayName = dbUser.displayName;
          token.avatarUrl = dbUser.avatarUrl;
          token.deletedAt = jwtDateStringOrNull(dbUser.deletedAt);
          token.emailVerified = dbUser.emailVerified;
          token.isBanned = dbUser.isBanned;
          token.locale = normalizeAppLocale(dbUser.locale);
          token.theme = normalizeWizardsThemeId(dbUser.theme);
          token.authStatusHydrated = true;
          token.profileHydrated = true;
        } else {
          clearJwtUserState(token);
        }
      }

      token.id = stringOrEmpty(token.id) || stringOrEmpty(token.sub);

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = stringOrEmpty(token.id) || stringOrEmpty(token.sub);
        session.user.username = stringOrNull(token.username);
        session.user.displayName = stringOrNull(token.displayName);
        session.user.avatarUrl = stringOrNull(token.avatarUrl);
        session.user.deletedAt = stringOrNull(token.deletedAt);
        session.user.authEmailVerified = token.emailVerified === true;
        session.user.isBanned = token.isBanned === true;
        session.user.locale = stringOrNull(token.locale);
        session.user.theme = stringOrNull(token.theme);
      }

      return session;
    },
  },
  events: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google" || !user.id || !isGoogleEmailVerified(profile)) {
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
    },
  },
} satisfies NextAuthConfig;

const nextAuthResult: NextAuthResult = NextAuth(authConfig);

export const handlers: NextAuthResult["handlers"] = nextAuthResult.handlers;
export const signIn: NextAuthResult["signIn"] = nextAuthResult.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuthResult.signOut;
export const auth: NextAuthResult["auth"] = nextAuthResult.auth;
export const unstable_update: NextAuthResult["unstable_update"] = nextAuthResult.unstable_update;
