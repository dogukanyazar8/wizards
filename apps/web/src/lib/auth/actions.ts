"use server";

import { signIn, signOut } from "@/auth";
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

export async function registerAction(formData: FormData): Promise<AuthActionResult> {
  const validation = RegisterSchema.safeParse({
    email: getFormValue(formData, "email"),
    username: getFormValue(formData, "username"),
    password: getFormValue(formData, "password"),
    confirmPassword: getFormValue(formData, "confirmPassword"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Invalid registration data",
    };
  }

  const email = validation.data.email.toLowerCase();
  const username = validation.data.username;

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
  ]);

  if (existingEmail) {
    return {
      success: false,
      error: "Email already taken",
    };
  }

  if (existingUsername) {
    return {
      success: false,
      error: "Username already taken",
    };
  }

  const passwordHash = await bcrypt.hash(validation.data.password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          displayName: username,
          settings: { create: {} },
          notificationSettings: { create: {} },
        },
      });
    });

    await signIn("credentials", {
      email,
      password: validation.data.password,
      redirectTo: "/channels/@me",
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        success: false,
        error: "Account created but auto-login failed. Please log in.",
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: "Email already taken",
      };
    }

    throw error;
  }
}

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const validation = LoginSchema.safeParse({
    email: getFormValue(formData, "email"),
    password: getFormValue(formData, "password"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Invalid login data",
    };
  }

  try {
    await signIn("credentials", {
      email: validation.data.email.toLowerCase(),
      password: validation.data.password,
      redirectTo: "/channels/@me",
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return {
          success: false,
          error: "Invalid email or password",
        };
      }

      return {
        success: false,
        error: "Unable to log in right now",
      };
    }

    throw error;
  }
}

export async function logoutAction(): Promise<AuthActionResult> {
  try {
    await signOut({
      redirectTo: "/login",
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        success: false,
        error: "Unable to log out right now",
      };
    }

    throw error;
  }
}
