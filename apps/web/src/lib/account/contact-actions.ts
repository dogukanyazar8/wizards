"use server";

import { z } from "zod";
import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import { maskPhoneNumber } from "./service";
import { saveAccountPhone } from "./contact-service";
import {
  requestEmailChange,
  confirmEmailChange,
  sendGoogleEmailChangeCode,
} from "./email-change-service";

function safeError(error: unknown) {
  if (error instanceof ApiError)
    return { success: false as const, error: error.code ?? "UNAVAILABLE" };
  if (error instanceof z.ZodError) return { success: false as const, error: "INVALID_INPUT" };
  logError("[account-contact] operation failed", error);
  return { success: false as const, error: "UNAVAILABLE" };
}

export async function getAccountContactAction() {
  const userId = await requireApiUserId();
  await enforceApiRateLimit(userId, "settings:bootstrap");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      phoneNumber: true,
      passwordHash: true,
      twoFactorEnabled: true,
      accounts: { where: { provider: "google" }, select: { id: true }, take: 1 },
    },
  });
  return {
    phone: maskPhoneNumber(user.phoneNumber),
    hasPassword: Boolean(user.passwordHash),
    googleAvailable: user.accounts.length > 0,
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

export async function saveAccountPhoneAction(raw: unknown) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "account:phone");
    return { success: true as const, ...(await saveAccountPhone(userId, raw)) };
  } catch (error) {
    return safeError(error);
  }
}

export async function requestAccountEmailChangeAction(raw: unknown) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "account:email-request");
    return { success: true as const, ...(await requestEmailChange(userId, raw)) };
  } catch (error) {
    return safeError(error);
  }
}

export async function sendGoogleAccountEmailCodeAction(id: string) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "account:email-confirm");
    await sendGoogleEmailChangeCode(userId, z.uuid().parse(id));
    return { success: true as const };
  } catch (error) {
    return safeError(error);
  }
}

export async function confirmAccountEmailChangeAction(raw: unknown) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "account:email-confirm");
    await confirmEmailChange(userId, raw);
    return { success: true as const };
  } catch (error) {
    return safeError(error);
  }
}
