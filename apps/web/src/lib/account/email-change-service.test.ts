import assert from "node:assert/strict";
import { it } from "node:test";
import bcrypt from "bcryptjs";
import type { prisma, Prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { createEmailChangeService } from "./email-change-service";
import type { revokeUserSessions } from "@/lib/auth/session-revocation";

type EmailChangeChallenge = NonNullable<
  Awaited<ReturnType<typeof prisma.emailChangeChallenge.findUnique>>
>;

const passwordHash = bcrypt.hashSync("Correct-password-42", 4);
const rejectCode = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;

function setup(
  options: { google?: boolean; conflict?: boolean; banned?: boolean; deliveryFails?: boolean } = {},
) {
  process.env.AUTH_SECRET = "unit-test-email-change-signing-secret";
  let user = {
    id: "user-1",
    email: "old@example.com",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    passwordHash: options.google ? null : passwordHash,
    sessionsRevokedAfter: null as Date | null,
    isBanned: options.banned ?? false,
    deletedAt: null,
    locale: "en",
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorSecretCiphertext: null,
    twoFactorSecretKeyVersion: null,
  };
  let challenge: EmailChangeChallenge | null = null;
  const mail: Array<{ to: string; code?: string }> = [];
  const writes: string[] = [];
  let revocations = 0;
  const matches = (where: Record<string, unknown>) =>
    challenge &&
    (!where.id || where.id === challenge.id) &&
    (!where.userId || where.userId === challenge.userId) &&
    (!where.oauthTokenHash || where.oauthTokenHash === challenge.oauthTokenHash) &&
    (!Object.hasOwn(where, "oauthVerifiedAt") ||
      where.oauthVerifiedAt === challenge.oauthVerifiedAt);
  const update = async ({ data }: { data: Record<string, unknown> }) => {
    assert.ok(challenge);
    if (typeof data.attempts === "object") data = { ...data, attempts: challenge.attempts + 1 };
    challenge = { ...challenge, ...data } as EmailChangeChallenge;
    return challenge;
  };
  const tx = {
    $queryRaw: async () => [{ id: user.id }],
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id ? (where.id === user.id ? user : null) : options.conflict ? { id: "other" } : null,
      update: async ({ data }: { data: Partial<typeof user> }) => {
        user = { ...user, ...data };
        writes.push("email");
        return user;
      },
    },
    account: {
      findFirst: async () => (options.google ? { id: "google-link" } : null),
      findUnique: async ({
        where,
      }: {
        where: { provider_providerAccountId: { providerAccountId: string } };
      }) => ({
        userId:
          where.provider_providerAccountId.providerAccountId === "google-owner"
            ? user.id
            : "different-user",
      }),
    },
    emailChangeChallenge: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        matches(where) ? challenge : null,
      upsert: async ({ create }: { create: EmailChangeChallenge }) => {
        challenge = create;
        return challenge;
      },
      update,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!matches(where)) return { count: 0 };
        await update({ data });
        return { count: 1 };
      },
      delete: async () => {
        challenge = null;
        writes.push("consume");
      },
    },
    authSession: {
      updateMany: async () => {
        writes.push("sessions");
        return { count: 2 };
      },
    },
    session: {
      deleteMany: async () => {
        writes.push("mobile-sessions");
        return { count: 2 };
      },
    },
    emailVerificationToken: {
      deleteMany: async () => {
        writes.push("old-tokens");
        return { count: 1 };
      },
    },
    emailVerificationCode: {
      deleteMany: async () => {
        writes.push("old-codes");
        return { count: 1 };
      },
    },
    accountReauthChallenge: {
      deleteMany: async () => {
        writes.push("reauth");
        return { count: 1 };
      },
    },
    securityEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.deepEqual(data, { userId: user.id, kind: "EMAIL_CHANGED" });
        writes.push("audit");
        return data;
      },
    },
  };
  // Serialize the fake transaction like the service's per-user PostgreSQL row lock.
  let queue = Promise.resolve();
  const transaction = (work: (db: Prisma.TransactionClient) => Promise<unknown>) => {
    const result = queue.then(async () => {
      const before = structuredClone({ user, challenge, writes });
      try {
        return await work(tx as unknown as Prisma.TransactionClient);
      } catch (error) {
        user = before.user;
        challenge = before.challenge;
        writes.splice(0, writes.length, ...before.writes);
        throw error;
      }
    });
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const send = async (input: { to: string; code?: string }) => {
    mail.push(input);
    if (options.deliveryFails) throw new Error("mail offline");
  };
  const revoke: typeof revokeUserSessions = async (_id, { now } = {}) => {
    revocations += 1;
    return { ok: true, revokedAfter: now!, revokedAfterSeconds: now!.getTime() / 1000 };
  };
  const service = createEmailChangeService({
    db: { ...tx, $transaction: transaction } as unknown as typeof prisma,
    sendMail: send,
    revokeSessions: revoke,
  });
  return {
    service,
    send,
    revoke,
    mail,
    writes,
    get user() {
      return user;
    },
    get challenge() {
      return challenge;
    },
    get revocations() {
      return revocations;
    },
    start: () =>
      service.requestEmailChange(user.id, {
        email: "NEW@Example.com",
        password: "Correct-password-42",
      }),
    confirm: (id: string, code = mail.find((entry) => entry.code)?.code ?? "000000") =>
      service.confirmEmailChange(user.id, { id, code }),
  };
}

it("changes only after the new email code, consumes tokens and revokes all sessions", async () => {
  const state = setup();
  const request = await state.start();
  assert.equal(request.method, "code");
  assert.equal(state.user.email, "old@example.com");
  assert.equal(state.mail[0]?.to, "old@example.com");
  assert.equal(state.mail[0]?.code, undefined);
  assert.equal(state.mail[1]?.to, "new@example.com");
  assert.notEqual(state.challenge?.codeHash, state.mail[1]?.code);
  await state.confirm(request.id);
  assert.equal(state.user.email, "new@example.com");
  assert.equal(state.user.emailVerified, true);
  assert.ok(state.user.sessionsRevokedAfter);
  assert.deepEqual(state.writes, [
    "email",
    "sessions",
    "mobile-sessions",
    "old-tokens",
    "old-codes",
    "reauth",
    "consume",
    "audit",
  ]);
  assert.equal(state.revocations, 1);
  await assert.rejects(state.confirm(request.id), rejectCode("EXPIRED"));
});

it("rejects a wrong password and banned accounts without creating a challenge", async () => {
  const state = setup();
  await assert.rejects(
    state.service.requestEmailChange("user-1", { email: "new@example.com", password: "wrong" }),
    rejectCode("INVALID_PASSWORD"),
  );
  state.user.isBanned = true;
  await assert.rejects(state.start(), rejectCode("UNAVAILABLE"));
  assert.equal(state.challenge, null);
  assert.equal(state.mail.length, 0);
});

it("persists failed attempts and stops after five guesses", async () => {
  const state = setup();
  const request = await state.start();
  const bad = state.mail[1]?.code === "000000" ? "111111" : "000000";
  for (let index = 0; index < 5; index += 1)
    await assert.rejects(state.confirm(request.id, bad), rejectCode("INVALID_CODE"));
  assert.equal(state.challenge?.attempts, 5);
  await assert.rejects(state.confirm(request.id), rejectCode("EXPIRED"));
  assert.equal(state.user.email, "old@example.com");
});

it("rejects expired or credential-invalidated codes", async () => {
  const state = setup();
  const request = await state.start();
  state.user.sessionsRevokedAfter = new Date();
  await assert.rejects(state.confirm(request.id), rejectCode("EXPIRED"));
  state.user.sessionsRevokedAfter = null;
  state.challenge!.expiresAt = new Date(0);
  await assert.rejects(state.confirm(request.id), rejectCode("EXPIRED"));
});

it("invalidates delivery failures without changing the address or bypassing cooldown", async () => {
  const state = setup({ deliveryFails: true });
  await assert.rejects(state.start(), rejectCode("SEND_FAILED"));
  assert.equal(state.challenge?.codeHash, null);
  assert.equal(state.challenge?.sentAt, null);
  assert.equal(state.user.email, "old@example.com");
  await assert.rejects(state.start(), rejectCode("RATE_LIMITED"));
});

it("rejects an address conflict without session or account mutations", async () => {
  const state = setup({ conflict: true });
  const request = await state.start();
  await assert.rejects(state.confirm(request.id), rejectCode("EMAIL_UNAVAILABLE"));
  assert.equal(state.user.email, "old@example.com");
  assert.deepEqual(state.writes, []);
});

it("allows only one successful concurrent confirmation", async () => {
  const state = setup();
  const request = await state.start();
  const results = await Promise.allSettled([state.confirm(request.id), state.confirm(request.id)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(state.revocations, 1);
});

it("requires the linked Google identity, rejects replay, then sends a new-address code", async () => {
  const state = setup({ google: true });
  const request = await state.start();
  assert.equal(request.method, "google");
  assert.equal(state.mail.length, 0);
  await assert.rejects(
    state.service.sendGoogleEmailChangeCode("user-1", request.id),
    rejectCode("GOOGLE_REQUIRED"),
  );
  assert.equal(
    await state.service.completeGoogleEmailReauth(request.googleToken!, "different-google"),
    false,
  );
  assert.equal(
    await state.service.completeGoogleEmailReauth(request.googleToken!, "google-owner"),
    true,
  );
  assert.equal(
    await state.service.completeGoogleEmailReauth(request.googleToken!, "google-owner"),
    false,
  );
  await state.service.sendGoogleEmailChangeCode("user-1", request.id);
  assert.equal(state.mail.length, 2);
  await state.service.sendGoogleEmailChangeCode("user-1", request.id);
  assert.equal(state.mail.length, 2);
  await state.confirm(request.id);
  assert.equal(state.user.email, "new@example.com");
});
