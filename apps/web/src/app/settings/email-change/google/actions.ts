"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@wizards/db";
import { signIn } from "@/auth";
import {
  EMAIL_CHANGE_GOOGLE_COOKIE,
  hashGoogleReauthToken,
} from "@/lib/account/email-change-service";
import { getAuthSessionCookieOptions } from "@/lib/auth/session-cookies";

export async function startEmailChangeGoogleAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) redirect("/settings/email-change/google?result=failed");
  const pending = await prisma.emailChangeChallenge.findUnique({
    where: { oauthTokenHash: hashGoogleReauthToken(token) },
  });
  if (!pending || pending.expiresAt <= new Date() || pending.oauthVerifiedAt)
    redirect("/settings/email-change/google?result=failed");
  const store = await cookies();
  store.set(EMAIL_CHANGE_GOOGLE_COOKIE, token, { ...getAuthSessionCookieOptions(), maxAge: 600 });
  await signIn(
    "google",
    { redirectTo: "/settings/email-change/google" },
    { prompt: "select_account", max_age: "0" },
  );
}
