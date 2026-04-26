import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma, type User as PrismaUser } from "@wizards/db";
import { LoginSchema } from "@wizards/types";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthConfig, type NextAuthResult } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import {
  DEFAULT_WIZARDS_THEME,
  normalizeWizardsThemeId,
} from "@/lib/appearance";

const MAX_USERNAME_LENGTH = 32;

const USERNAME_SANITIZE_REGEX = /[^a-zA-Z0-9_]/g;

function normalizeUsername(rawValue: string): string {
  const normalized = rawValue
    .toLowerCase()
    .replace(USERNAME_SANITIZE_REGEX, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_USERNAME_LENGTH);

  if (normalized.length >= 2) {
    return normalized;
  }

  return `wizard_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function deriveBaseUsername(data: { email?: string | null; name?: string | null }): string {
  if (data.name && data.name.trim().length > 0) {
    return normalizeUsername(data.name);
  }

  if (data.email) {
    const emailPrefix = data.email.split("@")[0] ?? "wizard";
    return normalizeUsername(emailPrefix);
  }

  return normalizeUsername("wizard");
}

async function getUniqueUsername(seed: string): Promise<string> {
  const safeSeed = normalizeUsername(seed);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? "" : `_${attempt}`;
    const sliceLength = MAX_USERNAME_LENGTH - suffix.length;
    const base = safeSeed.slice(0, Math.max(sliceLength, 2));
    const candidate = `${base}${suffix}`;

    const existingUser = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });

    if (!existingUser) {
      return candidate;
    }
  }

  return normalizeUsername(`wizard_${Date.now().toString(36)}`);
}

function mapUserToAdapterUser(
  user: Pick<PrismaUser, "id" | "email" | "emailVerifiedAt" | "displayName" | "username" | "avatarUrl">,
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

const baseAdapter = PrismaAdapter(prisma);

const adapter: Adapter = {
  ...baseAdapter,
  async createUser(data) {
    if (!data.email) {
      throw new Error("OAuth user is missing an email address.");
    }

    const username = await getUniqueUsername(deriveBaseUsername(data));

    const createdUser = await prisma.user.create({
      data: {
        email: data.email,
        username,
        displayName: data.name ?? username,
        avatarUrl: data.image ?? null,
        emailVerified: Boolean(data.emailVerified),
        emailVerifiedAt: data.emailVerified ?? null,
        theme: DEFAULT_WIZARDS_THEME,
        settings: { create: {} },
        notificationSettings: { create: {} },
      },
    });

    return mapUserToAdapterUser(createdUser);
  },
  async getUser(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return null;
    }

    return mapUserToAdapterUser(user);
  },
  async getUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    if (!user) {
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
      updateData.email = data.email;
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
        id: true,
        email: true,
        emailVerifiedAt: true,
        displayName: true,
        username: true,
        avatarUrl: true,
      },
    });

    return mapUserToAdapterUser(updatedUser);
  },
};

const authConfig = {
  adapter,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 30,
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
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
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsedCredentials = LoginSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsedCredentials.data.email.toLowerCase() },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            passwordHash: true,
            theme: true,
          },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          parsedCredentials.data.password,
          user.passwordHash,
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? user.username,
          image: user.avatarUrl ?? null,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          theme: normalizeWizardsThemeId(user.theme),
        };
      },
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
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
          username: normalizeUsername(login || email?.split("@")[0] || "wizard"),
          displayName: name,
          avatarUrl: image,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      profile(profile) {
        const email = typeof profile.email === "string" ? profile.email : null;
        const name = typeof profile.name === "string" ? profile.name : "";
        const image = typeof profile.picture === "string" ? profile.picture : null;

        return {
          id: profile.sub,
          email,
          name,
          image,
          username: normalizeUsername(email?.split("@")[0] || name || "wizard"),
          displayName: name,
          avatarUrl: image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
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

        token.theme =
          "theme" in user && typeof user.theme === "string"
            ? normalizeWizardsThemeId(user.theme)
            : stringOrNull(token.theme);
      }

      if (trigger === "update" && session?.user?.theme) {
        token.theme = normalizeWizardsThemeId(session.user.theme);
      }

      if (
        token.sub &&
        (!token.username || !token.displayName || !token.avatarUrl || !token.theme)
      ) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            theme: true,
          },
        });

        if (dbUser) {
          token.username = dbUser.username;
          token.displayName = dbUser.displayName;
          token.avatarUrl = dbUser.avatarUrl;
          token.theme = normalizeWizardsThemeId(dbUser.theme);
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
        session.user.theme = stringOrNull(token.theme);
      }

      return session;
    },
  },
} satisfies NextAuthConfig;

const nextAuthResult: NextAuthResult = NextAuth(authConfig);

export const handlers: NextAuthResult["handlers"] = nextAuthResult.handlers;
export const signIn: NextAuthResult["signIn"] = nextAuthResult.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuthResult.signOut;
export const auth: NextAuthResult["auth"] = nextAuthResult.auth;
export const unstable_update: NextAuthResult["unstable_update"] =
  nextAuthResult.unstable_update;
