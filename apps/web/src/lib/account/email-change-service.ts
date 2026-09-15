import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma as defaultPrisma, type Prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import { verifyTwoFactorCredential } from "@/lib/auth/two-factor";
import { revokeUserSessions } from "@/lib/auth/session-revocation";
import { sendEmailChangeMail } from "./email-change-mail";
import { credentialStamp, hashEmailChangeCode, canConfirmEmailChange } from "./email-change-policy";
import {
  EmailChangeRequestSchema,
  EmailChangeConfirmSchema,
  EMAIL_CHANGE_TTL_MS,
} from "./contact-contract";

export const EMAIL_CHANGE_GOOGLE_COOKIE = "whispr-email-change-google";
export const hashGoogleReauthToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const userSelect = {
  id: true,
  email: true,
  emailVerified: true,
  passwordHash: true,
  sessionsRevokedAfter: true,
  isBanned: true,
  deletedAt: true,
  locale: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorSecretCiphertext: true,
  twoFactorSecretKeyVersion: true,
} as const;

export function createEmailChangeService(
  dependencies: {
    db?: typeof defaultPrisma;
    sendMail?: typeof sendEmailChangeMail;
    revokeSessions?: typeof revokeUserSessions;
  } = {},
) {
  const prisma = dependencies.db ?? defaultPrisma;
  const sendMail = dependencies.sendMail ?? sendEmailChangeMail;
  const revokeSessions = dependencies.revokeSessions ?? revokeUserSessions;

  async function loadActiveUser(
    userId: string,
    db: Pick<Prisma.TransactionClient, "user"> = prisma,
  ) {
    const user = await db.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user || user.isBanned || user.deletedAt || !user.emailVerified) {
      throw new ApiError("Account unavailable", 403, "UNAVAILABLE");
    }
    return user;
  }

  // All challenge transitions take the same account lock. Concurrent resend, confirmation,
  // password changes and deletion cannot commit against a stale credential snapshot.
  async function lockUser(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    return loadActiveUser(userId, tx);
  }

  async function requestEmailChange(userId: string, raw: unknown) {
    const input = EmailChangeRequestSchema.parse(raw);
    const user = await loadActiveUser(userId);
    if (input.email === user.email) throw new ApiError("Address unchanged", 400, "SAME_EMAIL");
    if (user.passwordHash) {
      if (!input.password || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw new ApiError("Invalid current password", 403, "INVALID_PASSWORD");
      }
    } else {
      const linked = await prisma.account.findFirst({
        where: { userId, provider: "google" },
        select: { id: true },
      });
      if (!linked)
        throw new ApiError("No supported reauthentication method", 403, "REAUTH_UNAVAILABLE");
    }
    if (user.twoFactorEnabled) {
      const result = await verifyTwoFactorCredential({
        userId,
        code: input.twoFactorCode ?? "",
        secret: user.twoFactorSecret,
        secretCiphertext: user.twoFactorSecretCiphertext,
        secretKeyVersion: user.twoFactorSecretKeyVersion,
      });
      if (!result.success) throw new ApiError("Second factor required", 403, "INVALID_TWO_FACTOR");
    }
    const now = new Date();
    const id = randomUUID();
    const googleToken = user.passwordHash ? null : randomBytes(32).toString("base64url");
    const code = user.passwordHash ? String(randomInt(1_000_000)).padStart(6, "0") : null;
    await prisma.$transaction(async (tx) => {
      const locked = await lockUser(tx, userId);
      if (credentialStamp(locked) !== credentialStamp(user))
        throw new ApiError("Credentials changed", 409, "EXPIRED");
      const previous = await tx.emailChangeChallenge.findUnique({ where: { userId } });
      if (previous && now.getTime() - previous.createdAt.getTime() < 60_000) {
        throw new ApiError("Wait before resending", 429, "RATE_LIMITED");
      }
      const data = {
        id,
        currentEmail: user.email,
        newEmail: input.email,
        credentialStamp: credentialStamp(user),
        codeHash: code ? hashEmailChangeCode(code, id) : null,
        attempts: 0,
        createdAt: now,
        expiresAt: new Date(now.getTime() + EMAIL_CHANGE_TTL_MS),
        sentAt: null,
        oauthTokenHash: googleToken ? hashGoogleReauthToken(googleToken) : null,
        oauthVerifiedAt: null,
      };
      await tx.emailChangeChallenge.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    });
    if (code) await deliverCode(userId, id, user.email, input.email, user.locale, code);
    return {
      id,
      method: googleToken ? ("google" as const) : ("code" as const),
      googleToken,
      expiresAt: new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString(),
    };
  }

  async function deliverCode(
    userId: string,
    id: string,
    oldEmail: string,
    newEmail: string,
    locale: string | null,
    code: string,
  ) {
    try {
      await sendMail({ to: oldEmail, locale });
      await sendMail({ to: newEmail, locale, code });
      const ready = await prisma.emailChangeChallenge.updateMany({
        where: { userId, id, expiresAt: { gt: new Date() } },
        data: { sentAt: new Date() },
      });
      if (!ready.count) throw new ApiError("Challenge expired", 409, "EXPIRED");
    } catch (error) {
      logError("[email-change] delivery failed", error);
      // Preserve the resend cooldown, but invalidate a partially delivered challenge.
      await prisma.emailChangeChallenge.updateMany({
        where: { userId, id },
        data: { codeHash: null, sentAt: null },
      });
      throw new ApiError("Unable to deliver email", 503, "SEND_FAILED");
    }
  }

  async function completeGoogleEmailReauth(token: string, providerAccountId: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const pending = await prisma.emailChangeChallenge.findUnique({
      where: { oauthTokenHash: hashGoogleReauthToken(token) },
    });
    if (!pending || pending.expiresAt <= new Date() || pending.oauthVerifiedAt) return false;
    return prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, pending.userId);
      const linked = await tx.account.findUnique({
        where: { provider_providerAccountId: { provider: "google", providerAccountId } },
      });
      if (
        linked?.userId !== user.id ||
        user.passwordHash ||
        credentialStamp(user) !== pending.credentialStamp
      )
        return false;
      const result = await tx.emailChangeChallenge.updateMany({
        where: {
          userId: user.id,
          id: pending.id,
          oauthVerifiedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { oauthVerifiedAt: new Date(), oauthTokenHash: null },
      });
      return result.count === 1;
    });
  }

  async function sendGoogleEmailChangeCode(userId: string, id: string) {
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    const delivery = await prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      const pending = await tx.emailChangeChallenge.findUnique({ where: { userId } });
      if (
        !pending ||
        pending.id !== id ||
        pending.expiresAt <= new Date() ||
        pending.credentialStamp !== credentialStamp(user)
      ) {
        throw new ApiError("Challenge expired", 409, "EXPIRED");
      }
      if (!pending.oauthVerifiedAt)
        throw new ApiError("Google verification required", 403, "GOOGLE_REQUIRED");
      if (pending.sentAt) return null;
      if (pending.codeHash) throw new ApiError("Delivery in progress", 429, "RATE_LIMITED");
      await tx.emailChangeChallenge.update({
        where: { userId },
        data: {
          codeHash: hashEmailChangeCode(code, id),
          expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
        },
      });
      return { user, pending };
    });
    if (delivery)
      await deliverCode(
        userId,
        id,
        delivery.user.email,
        delivery.pending.newEmail,
        delivery.user.locale,
        code,
      );
  }

  async function confirmEmailChange(userId: string, raw: unknown) {
    const input = EmailChangeConfirmSchema.parse(raw);
    let now = new Date();
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const user = await lockUser(tx, userId);
        now = new Date();
        const pending = await tx.emailChangeChallenge.findUnique({ where: { userId } });
        if (
          !pending ||
          pending.id !== input.id ||
          !pending.codeHash ||
          !canConfirmEmailChange(pending, user, now)
        )
          return "EXPIRED";
        if (
          !timingSafeEqual(
            Buffer.from(pending.codeHash, "hex"),
            Buffer.from(hashEmailChangeCode(input.code, input.id), "hex"),
          )
        ) {
          await tx.emailChangeChallenge.update({
            where: { userId },
            data: { attempts: { increment: 1 } },
          });
          return "INVALID_CODE";
        }
        const conflict = await tx.user.findUnique({
          where: { email: pending.newEmail },
          select: { id: true },
        });
        if (conflict) return "EMAIL_UNAVAILABLE";
        await tx.user.update({
          where: { id: userId },
          data: {
            email: pending.newEmail,
            emailVerified: true,
            emailVerifiedAt: now,
            sessionsRevokedAfter: now,
          },
        });
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.session.deleteMany({ where: { userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId } });
        await tx.emailVerificationCode.deleteMany({ where: { userId } });
        await tx.accountReauthChallenge.deleteMany({ where: { userId } });
        await tx.emailChangeChallenge.delete({ where: { userId } });
        await tx.securityEvent.create({ data: { userId, kind: "EMAIL_CHANGED" } });
        return "OK";
      });
      if (outcome !== "OK") throw new ApiError("Email change was not completed", 400, outcome);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ApiError("Address unavailable", 409, "EMAIL_UNAVAILABLE");
      }
      throw error;
    }
    // Durable revocation committed above. A cache/transport outage must not report the
    // already committed address change as a failure or invite another submission.
    try {
      await revokeSessions(userId, { now });
    } catch (error) {
      logError("[email-change] session revocation propagation failed", error);
    }
  }

  return {
    requestEmailChange,
    confirmEmailChange,
    completeGoogleEmailReauth,
    sendGoogleEmailChangeCode,
  };
}

export const {
  requestEmailChange,
  confirmEmailChange,
  completeGoogleEmailReauth,
  sendGoogleEmailChangeCode,
} = createEmailChangeService();
