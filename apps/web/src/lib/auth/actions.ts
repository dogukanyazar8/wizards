"use server";

import { headers } from "next/headers";
import { auth, normalizeAuthEmail, signIn, signOut } from "@/auth";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import {
  broadcastPresenceUpdateToFriends,
  persistUserPresence,
} from "@/lib/friends/service";
import { normalizeAppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { Prisma, prisma } from "@wizards/db";
import { LoginSchema, RegisterSchema } from "@wizards/types";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";

export interface AuthActionResult {
  success: boolean;
  error?: string;
}

function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function getRequestIpAddress() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

export async function registerAction(formData: FormData): Promise<AuthActionResult> {
  const validation = RegisterSchema.safeParse({
    email: normalizeAuthEmail(getFormValue(formData, "email")),
    username: getFormValue(formData, "username"),
    password: getFormValue(formData, "password"),
    confirmPassword: getFormValue(formData, "confirmPassword"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "auth.register.alertUnavailable",
    };
  }

  const email = normalizeAuthEmail(validation.data.email);
  const locale = normalizeAppLocale(getFormValue(formData, "locale"));
  const username = validation.data.username;
  const redis = getRedis();
  const ipAddress = await getRequestIpAddress();

  try {
    const isAllowed = await checkRateLimit(
      redis,
      `rate:register:${ipAddress}`,
      10,
      60 * 60,
    );

    if (!isAllowed) {
      return {
        success: false,
        error: "auth.register.rateLimited",
      };
    }
  } catch {
    // Fail open if Redis is temporarily unavailable.
  }

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
  ]);

  if (existingEmail) {
    return {
      success: false,
      error: "auth.register.emailTaken",
    };
  }

  if (existingUsername) {
    return {
      success: false,
      error: "auth.register.usernameTaken",
    };
  }

  const passwordHash = await bcrypt.hash(validation.data.password, 12);

  try {
    const createdUser = await prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          displayName: username,
          locale,
          theme: DEFAULT_WIZARDS_THEME,
          settings: { create: {} },
          notificationSettings: { create: {} },
        },
      });
    });

    await persistUserLocale(createdUser.id, locale);

    await signIn("credentials", {
      email,
      password: validation.data.password,
      redirectTo: "/channels",
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        success: false,
        error: "auth.register.autoLoginFailed",
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: "auth.register.emailTaken",
      };
    }

    throw error;
  }
}

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const validation = LoginSchema.safeParse({
    email: normalizeAuthEmail(getFormValue(formData, "email")),
    password: getFormValue(formData, "password"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "auth.login.alertUnavailable",
    };
  }

  const { email, password } = validation.data;
  const redis = getRedis();
  const ipAddress = await getRequestIpAddress();

  try {
    const isAllowed = await checkRateLimit(
      redis,
      `rate:login:${email}:${ipAddress}`,
      5,
      15 * 60,
    );

    if (!isAllowed) {
      return {
        success: false,
        error: "auth.login.rateLimited",
      };
    }
  } catch {
    // Fail open if Redis is temporarily unavailable.
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/channels",
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return {
          success: false,
          error: "auth.login.invalidCredentials",
        };
      }

      return {
        success: false,
        error: "auth.login.alertUnavailable",
      };
    }

    throw error;
  }
}

export async function logoutAction() {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const presence = await persistUserPresence(session.user.id, "OFFLINE");
      if (presence) {
        await broadcastPresenceUpdateToFriends(presence);
      }
    }

    await signOut({
      redirectTo: "/login",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      throw new Error("auth.login.signInUnavailable");
    }

    throw error;
  }
}
