import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma, type User as PrismaUser } from "@wizards/db";
import { LoginCredentialsSchema } from "@wizards/types";
import NextAuth, { type NextAuthConfig, type NextAuthResult } from "next-auth";
import { cookies, headers } from "next/headers";
import { isEmailChangeGoogleCallback } from "@/lib/account/email-change-policy";
import {
  EMAIL_CHANGE_GOOGLE_COOKIE,
  completeGoogleEmailReauth,
} from "@/lib/account/email-change-service";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import { authLogger } from "@/lib/auth/auth-logger";
import {
  authSessionJwt,
  refreshJwtSessionExpiry,
  REMEMBERED_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session-lifetime";
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
  canOAuthIdentityUseTwoFactorStepUp,
  getOAuthProfileEmail,
  isGoogleEmailVerified,
  resolveOAuthPolicyUser,
  type OAuthEmailAccount,
} from "@/lib/auth/oauth-email";
import { loginChallengeStore } from "@/lib/auth/login-challenge";
import {
  LOGIN_CREDENTIAL_USER_SELECT,
  verifyLoginCredentials,
  type LoginCredentialUser,
} from "@/lib/auth/login-credentials";
import {
  authorizeOAuthTwoFactorSignIn,
  getAuthJsCallbackCookieName,
  getOAuthTwoFactorGrantCookieConfig,
} from "@/lib/auth/oauth-two-factor";
import {
  getAuthSessionCookieConfig,
  getAuthSessionCookieOptions,
} from "@/lib/auth/session-cookies";
import {
  applyRevokedJwtUserState,
  ensureSessionStartedAt,
  isUserSessionRevoked,
  shouldCheckSessionRevocation,
  validateAuthSessionToken,
} from "@/lib/auth/session-revocation";
import {
  ensureAuthSession,
  isAuthSessionActive,
  type AuthSessionMetadata,
} from "@/lib/auth/auth-session-service";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";
import { recordSecurityEventFromHeaders } from "@/lib/security/security-event-service";
import { consumeDesktopOAuthHandoffToken } from "@/lib/auth/desktop-oauth-handoff";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { verifyWebLoginTwoFactor } from "@/lib/auth/web-login-two-factor";

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

const AUTH_SESSION_TOUCH_INTERVAL_SECONDS = 5 * 60;

/**
 * `Başarısız giriş` — one of the eight `SecurityEvent` kinds the Güvenlik tab lists.
 *
 * `recordSecurityEventFromHeaders` swallows its own failures, so a security-log outage can never
 * change what `authorize` returns.
 */
async function recordFailedWebLogin(userId: string, stage: "password" | "twoFactor") {
  await recordSecurityEventFromHeaders(await headers().catch(() => null), {
    kind: "FAILED_LOGIN",
    metadata: { stage },
    userId,
  });
}

async function getCurrentAuthSessionMetadata(): Promise<AuthSessionMetadata | null> {
  try {
    const info = getAnalyticsClientInfo(await headers());
    return {
      appVersion: info.appVersion,
      browser: info.browser,
      clientType: info.clientType,
      countryCode: info.countryCode,
      deviceType: info.deviceType,
      os: info.os,
    };
  } catch {
    return null;
  }
}

function parseRememberMeCredential(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  return ["1", "on", "true", "yes"].includes(value.toLowerCase());
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
  const email = getOAuthProfileEmail(args.profile) || normalizeAuthEmail(args.user.email);
  const userSelect = {
    deletedAt: true,
    emailVerified: true,
    id: true,
    isBanned: true,
    twoFactorEnabled: true,
  } as const;
  const policySubject = await resolveOAuthPolicyUser({
    account: args.account,
    email,
    findByAccount: async (provider, providerAccountId) => {
      const linkedAccount = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { user: { select: userSelect } },
      });
      return linkedAccount?.user ?? null;
    },
    findByEmail: (candidateEmail) =>
      prisma.user.findUnique({ where: { email: candidateEmail }, select: userSelect }),
  });
  const existingUser = policySubject?.user ?? null;

  if (!(await canOAuthUserSignIn({ ...args, existingUser: null }))) {
    return false;
  }

  if (!existingUser) {
    return true;
  }

  if (!isActiveAuthUser(existingUser)) {
    return false;
  }

  if (!existingUser.twoFactorEnabled) {
    return true;
  }

  // GitHub intentionally keeps automatic email linking disabled. Existing linked
  // GitHub accounts still step up; unlinked email matches retain Auth.js's
  // OAuthAccountNotLinked behavior and never receive an unusable challenge.
  if (!canOAuthIdentityUseTwoFactorStepUp(args.account?.provider, policySubject?.linked === true)) {
    return false;
  }

  const cookieStore = await cookies();
  const grantCookie = getOAuthTwoFactorGrantCookieConfig();
  return authorizeOAuthTwoFactorSignIn({
    existingUser,
    grantToken: cookieStore.get(grantCookie.name)?.value,
    provider: args.account?.provider,
    providerAccountId: args.account?.providerAccountId,
  });
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
  logger: authLogger,
  session: {
    strategy: "jwt",
    maxAge: REMEMBERED_SESSION_MAX_AGE_SECONDS,
  },
  jwt: authSessionJwt,
  cookies: {
    callbackUrl: {
      name: getAuthJsCallbackCookieName(),
      options: getAuthSessionCookieOptions(),
    },
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
        desktopOAuthCallbackUrl: { label: "Desktop OAuth callback", type: "text" },
        desktopOAuthHandoffToken: { label: "Desktop OAuth handoff", type: "text" },
        email: { label: "Email", type: "email" },
        loginProof: { label: "Login proof", type: "text" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
        twoFactorCode: { label: "Two-factor code", type: "text" },
        twoFactorTicket: { label: "Two-factor ticket", type: "text" },
      },
      async authorize(credentials) {
        const credentialRecord =
          credentials && typeof credentials === "object"
            ? (credentials as Record<string, unknown>)
            : null;

        const desktopOAuthHandoffToken =
          typeof credentialRecord?.desktopOAuthHandoffToken === "string"
            ? credentialRecord.desktopOAuthHandoffToken
            : "";
        if (desktopOAuthHandoffToken) {
          const user = await consumeDesktopOAuthHandoffToken(desktopOAuthHandoffToken, {
            expectedCallbackUrl: getSafeAuthRedirectPath(
              typeof credentialRecord?.desktopOAuthCallbackUrl === "string"
                ? credentialRecord.desktopOAuthCallbackUrl
                : "",
            ),
          });

          if (!user) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.displayName ?? user.username,
            image: user.avatarUrl ?? null,
            authEmailVerified: Boolean(user.emailVerified),
            deletedAt: user.deletedAt,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isBanned: user.isBanned,
            locale: normalizeAppLocale(user.locale),
            rememberMe: true,
            theme: normalizeWizardsThemeId(user.theme),
          };
        }

        /*
         * İki adımlı doğrulama bileti (paket kararı K2).
         *
         * `/login/two-factor` ekranı kodu doğruladıktan sonra sunucu 30 saniyelik, tek
         * kullanımlık bir bilet üretir ve `signIn` bunu taşır. Bilet **parolanın yerine geçmez**:
         * ancak parola zaten doğrulandıktan sonra basılır, imzalı `loginProof` olmadan kabul
         * edilmez ve tükettiği anda düşer.
         */
        const twoFactorTicket =
          typeof credentialRecord?.twoFactorTicket === "string"
            ? credentialRecord.twoFactorTicket
            : "";

        if (twoFactorTicket) {
          const ticketEmail = normalizeAuthEmail(credentialRecord?.email);
          const ticketProof =
            typeof credentialRecord?.loginProof === "string" ? credentialRecord.loginProof : "";

          if (!ticketEmail) {
            return null;
          }

          let hasValidTicketProof = false;
          try {
            hasValidTicketProof = verifyLoginProof(ticketEmail, ticketProof);
          } catch {
            hasValidTicketProof = false;
          }

          if (!hasValidTicketProof) {
            return null;
          }

          const ticketRecord = await loginChallengeStore.consumeTicket(
            twoFactorTicket,
            ticketEmail,
          );

          if (!ticketRecord) {
            return null;
          }

          const ticketUser = (await prisma.user.findUnique({
            select: LOGIN_CREDENTIAL_USER_SELECT,
            where: { id: ticketRecord.userId },
          })) as LoginCredentialUser | null;

          if (!ticketUser || ticketUser.email !== ticketEmail) {
            return null;
          }

          if (ticketUser.isBanned || ticketUser.deletedAt || !ticketUser.emailVerified) {
            return null;
          }

          return {
            id: ticketUser.id,
            email: ticketUser.email,
            name: ticketUser.displayName ?? ticketUser.username,
            image: ticketUser.avatarUrl ?? null,
            authEmailVerified: ticketUser.emailVerified,
            deletedAt: ticketUser.deletedAt,
            username: ticketUser.username,
            displayName: ticketUser.displayName,
            avatarUrl: ticketUser.avatarUrl,
            isBanned: ticketUser.isBanned,
            locale: normalizeAppLocale(ticketUser.locale),
            rememberMe: ticketRecord.rememberMe,
            theme: normalizeWizardsThemeId(ticketUser.theme),
          };
        }

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
        const twoFactorCode =
          typeof credentialRecord?.twoFactorCode === "string" ? credentialRecord.twoFactorCode : "";

        let hasValidLoginProof = false;
        try {
          hasValidLoginProof = verifyLoginProof(normalizedEmail, loginProof);
        } catch {
          hasValidLoginProof = false;
        }

        if (!hasValidLoginProof) {
          return null;
        }

        const credentialResult = await verifyLoginCredentials({
          email: normalizedEmail,
          password,
        });

        if (credentialResult.status === "invalid") {
          // Ayarlar Ş3 §3. Only a *known* account gets a row: writing one for an address that
          // does not exist would turn the owner's own security log into an enumeration oracle
          // for whoever guessed the address. The write can never fail the login (K5).
          if (credentialResult.userId) {
            await recordFailedWebLogin(credentialResult.userId, "password");
          }
          return null;
        }

        if (credentialResult.status !== "ok") {
          return null;
        }

        const user = credentialResult.user;

        if (!(await verifyWebLoginTwoFactor(user, twoFactorCode))) {
          await recordFailedWebLogin(user.id, "twoFactor");
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
        const cookieStore = await cookies();
        const reauthToken = cookieStore.get(EMAIL_CHANGE_GOOGLE_COOKIE)?.value;
        if (reauthToken) {
          cookieStore.delete(EMAIL_CHANGE_GOOGLE_COOKIE);
          if (isEmailChangeGoogleCallback(cookieStore.get(getAuthJsCallbackCookieName())?.value)) {
            const verified =
              account.provider === "google" &&
              isGoogleEmailVerified(profile) &&
              (await completeGoogleEmailReauth(reauthToken, account.providerAccountId));
            // Returning a URL stops normal sign-in/account linking. A cancelled reauth
            // cookie must never intercept a later ordinary login in this browser.
            return `/settings/email-change/google?result=${verified ? "success" : "failed"}`;
          }
        }
      }
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
      ensureSessionStartedAt(token, nowSeconds);
      if (revocationUserId && !token.authSessionId) {
        token.authSessionId = randomBytes(24).toString("base64url");
      }

      const authSessionId = stringOrEmpty(token.authSessionId);
      const authSessionExpiresAt = new Date(refreshJwtSessionExpiry(token, nowSeconds) * 1_000);
      if (user && revocationUserId && authSessionId) {
        await ensureAuthSession({
          expiresAt: authSessionExpiresAt,
          id: authSessionId,
          metadata: await getCurrentAuthSessionMetadata(),
          now: new Date(nowSeconds * 1_000),
          userId: revocationUserId,
        });
        token.authSessionTouchedAt = nowSeconds;
      }

      const revocationCheckedAt =
        typeof token.revocationCheckedAt === "number" ? token.revocationCheckedAt : undefined;
      if (revocationUserId && shouldCheckSessionRevocation(revocationCheckedAt, nowSeconds)) {
        const validation = await validateAuthSessionToken(token, {
          checkAuthSession: isAuthSessionActive,
          checkGlobalRevocation: (userId, startedAtSeconds) =>
            isUserSessionRevoked(userId, startedAtSeconds, {
              loadDurableRevokedAfter: async (durableUserId) => {
                const user = await prisma.user.findUnique({
                  where: { id: durableUserId },
                  select: { sessionsRevokedAfter: true },
                });

                return user?.sessionsRevokedAfter ?? null;
              },
            }),
        });

        if (validation.status === "unavailable") {
          throw new Error("Auth session validation is unavailable");
        }

        token.revocationCheckedAt = nowSeconds;
        if (validation.status === "revoked") {
          const revokedUser = await prisma.user.findUnique({
            where: { id: revocationUserId },
            select: { deletedAt: true, isBanned: true },
          });
          applyRevokedJwtUserState(token, revokedUser);
          return token;
        }
      }

      const authSessionTouchedAt =
        typeof token.authSessionTouchedAt === "number" ? token.authSessionTouchedAt : 0;
      if (
        revocationUserId &&
        authSessionId &&
        nowSeconds - authSessionTouchedAt >= AUTH_SESSION_TOUCH_INTERVAL_SECONDS
      ) {
        await ensureAuthSession({
          expiresAt: authSessionExpiresAt,
          id: authSessionId,
          metadata: await getCurrentAuthSessionMetadata(),
          now: new Date(nowSeconds * 1_000),
          userId: revocationUserId,
        });
        token.authSessionTouchedAt = nowSeconds;
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
          applyRevokedJwtUserState(token, null);
        }
      }

      token.id = stringOrEmpty(token.id) || stringOrEmpty(token.sub);

      return token;
    },
    async session({ session, token }) {
      session.authSessionId = null;
      if (session.user) {
        const sessionUserId = stringOrEmpty(token.id) || stringOrEmpty(token.sub);
        if (token.revoked === true || !sessionUserId) {
          session.user.id = "";
          session.user.name = null;
          session.user.email = "";
          session.user.image = null;
          session.user.username = null;
          session.user.displayName = null;
          session.user.avatarUrl = null;
          session.user.deletedAt = null;
          session.user.authEmailVerified = false;
          session.user.isBanned = true;
          session.user.locale = null;
          session.user.theme = null;
          return session;
        }

        session.authSessionId = stringOrNull(token.authSessionId);
        session.user.id = sessionUserId;
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
