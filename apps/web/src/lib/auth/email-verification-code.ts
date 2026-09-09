import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { prisma } from "@wizards/db";

/**
 * Altı haneli e-posta doğrulama kodu — SPEC-GIRIS-KAYIT §4.5, §10 ve paket kararı K3.
 *
 * "6 hane, 10 dakika geçerli. Tekrar gönderme 60 saniye kilitli; üç istekten sonra hız sınırı
 * (2 dakika)." Link tabanlı akış **kaldırılmadı**; gönderilmiş bağlantılar çalışmaya devam
 * eder ve iki yol da aynı doğrulama sonucunu üretir.
 *
 * Kod düz metin saklanmaz: depoda `sha256(kod + userId)` durur, düz hâli yalnız e-postaya gider.
 * Böylece veritabanı okuması tek başına hesap ele geçirmeye yetmez.
 */

/** SPEC §4.5 — kod on dakika geçerli. */
export const EMAIL_CODE_TTL_MS = 10 * 60_000;

/** Kaba kuvvete karşı: beş yanlış denemede kod iptal olur, yenisi istenmek zorundadır. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

/** SPEC §4.5 — `Tekrar gönder · 00:42` geri sayımı. */
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60_000;

/**
 * SPEC §10 ve §7/9 — "üç istekten sonra hız sınırı (2 dakika)".
 *
 * Sayım penceresi kodun kendi ömrüdür: bir kullanıcı on dakika içinde üç kod istediyse
 * dördüncüsü için iki dakika bekler (`Yeni kod · 01:58`). Pencereyi iki dakika yapmak işe
 * yaramazdı — 60 saniyelik yeniden gönderme kilidi zaten iki dakikaya en fazla iki istek
 * sığdırıyor, sınır hiç tetiklenmezdi.
 */
export const EMAIL_CODE_RATE_WINDOW_MS = EMAIL_CODE_TTL_MS;
export const EMAIL_CODE_RATE_MAX_REQUESTS = 3;
export const EMAIL_CODE_RATE_PENALTY_MS = 2 * 60_000;

const CODE_LENGTH = 6;
const CODE_UPPER_BOUND = 10 ** CODE_LENGTH;

export type EmailVerificationCodeRecord = {
  attempts: number;
  codeHash: string;
  consumedAt: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  userId: string;
};

export type RequestEmailCodeResult =
  | { code: string; expiresAtMs: number; status: "sent" }
  | { retryAfterMs: number; status: "cooldown" }
  | { retryAfterMs: number; status: "rateLimited" };

export type SubmitEmailCodeResult =
  | { status: "verified"; userId: string }
  | { attemptsLeft: number; status: "invalid" }
  | { status: "expired" };

export type EmailVerificationCodeDependencies = {
  cancelOutstanding: (userId: string) => Promise<void>;
  consume: (id: string) => Promise<void>;
  create: (input: {
    codeHash: string;
    email: string;
    expiresAt: Date;
    userId: string;
  }) => Promise<EmailVerificationCodeRecord>;
  findActive: (userId: string) => Promise<EmailVerificationCodeRecord | null>;
  listRecent: (userId: string, sinceMs: number) => Promise<Array<{ createdAt: Date }>>;
  nowMs: () => number;
  randomCode: () => string;
  registerFailure: (id: string, attempts: number) => Promise<void>;
};

function hashCode(code: string, userId: string) {
  return createHash("sha256").update(code).update("\n").update(userId).digest("base64url");
}

function isSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const defaultDependencies: EmailVerificationCodeDependencies = {
  async cancelOutstanding(userId) {
    await prisma.emailVerificationCode.updateMany({
      data: { consumedAt: new Date() },
      where: { consumedAt: null, userId },
    });
  },
  async consume(id) {
    await prisma.emailVerificationCode.update({
      data: { consumedAt: new Date() },
      where: { id },
    });
  },
  create: (input) =>
    prisma.emailVerificationCode.create({
      data: input,
    }) as Promise<EmailVerificationCodeRecord>,
  findActive: (userId) =>
    prisma.emailVerificationCode.findFirst({
      orderBy: { createdAt: "desc" },
      where: { consumedAt: null, userId },
    }) as Promise<EmailVerificationCodeRecord | null>,
  listRecent: (userId, sinceMs) =>
    prisma.emailVerificationCode.findMany({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
      where: { createdAt: { gte: new Date(sinceMs) }, userId },
    }),
  nowMs: () => Date.now(),
  randomCode: () => String(randomInt(0, CODE_UPPER_BOUND)).padStart(CODE_LENGTH, "0"),
  async registerFailure(id, attempts) {
    await prisma.emailVerificationCode.update({
      data: { attempts },
      where: { id },
    });
  },
};

/**
 * Yeni kod üretir. Dönen `code` **çağıranın** e-postaya koyması içindir; başka hiçbir yere
 * yazılmaz ve geri okunamaz.
 */
export async function requestEmailVerificationCode(
  user: { email: string; id: string },
  overrides: Partial<EmailVerificationCodeDependencies> = {},
): Promise<RequestEmailCodeResult> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const nowMs = dependencies.nowMs();
  const recent = await dependencies.listRecent(user.id, nowMs - EMAIL_CODE_RATE_WINDOW_MS);

  const last = recent[0];

  if (recent.length >= EMAIL_CODE_RATE_MAX_REQUESTS) {
    // SPEC §7/9 — ceza son istekten itibaren işler; süre dolunca bir istek daha açılır.
    const retryAfterMs = (last?.createdAt.getTime() ?? nowMs) + EMAIL_CODE_RATE_PENALTY_MS - nowMs;

    if (retryAfterMs > 0) {
      return { retryAfterMs, status: "rateLimited" };
    }
  }

  if (last && nowMs - last.createdAt.getTime() < EMAIL_CODE_RESEND_COOLDOWN_MS) {
    return {
      retryAfterMs: last.createdAt.getTime() + EMAIL_CODE_RESEND_COOLDOWN_MS - nowMs,
      status: "cooldown",
    };
  }

  /*
   * Yeni kod üretilirken eskiler kapatılır. İki geçerli kod aynı anda yaşasaydı, saldırganın
   * deneme bütçesi ikiye katlanırdı.
   */
  await dependencies.cancelOutstanding(user.id);

  const code = dependencies.randomCode();
  const expiresAt = new Date(nowMs + EMAIL_CODE_TTL_MS);

  await dependencies.create({
    codeHash: hashCode(code, user.id),
    email: user.email,
    expiresAt,
    userId: user.id,
  });

  return { code, expiresAtMs: expiresAt.getTime(), status: "sent" };
}

export async function submitEmailVerificationCode(
  input: { code: string; userId: string },
  overrides: Partial<EmailVerificationCodeDependencies> = {},
): Promise<SubmitEmailCodeResult> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const nowMs = dependencies.nowMs();
  const record = await dependencies.findActive(input.userId);

  if (!record || record.consumedAt) {
    return { status: "expired" };
  }

  if (record.expiresAt.getTime() <= nowMs) {
    await dependencies.consume(record.id);
    return { status: "expired" };
  }

  if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    await dependencies.consume(record.id);
    return { status: "expired" };
  }

  if (!isSafeEqual(record.codeHash, hashCode(input.code, input.userId))) {
    const attempts = record.attempts + 1;

    if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      await dependencies.consume(record.id);
      return { status: "expired" };
    }

    await dependencies.registerFailure(record.id, attempts);

    return { attemptsLeft: EMAIL_CODE_MAX_ATTEMPTS - attempts, status: "invalid" };
  }

  await dependencies.consume(record.id);

  return { status: "verified", userId: record.userId };
}
