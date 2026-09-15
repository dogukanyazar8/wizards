import assert from "node:assert/strict";
import { after, it } from "node:test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@wizards/db";
import { createEmailChangeService } from "../src/lib/account/email-change-service";
import { saveAccountPhone } from "../src/lib/account/contact-service";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.EMAIL_CHANGE_DISPOSABLE_TEST !== "1" ||
  url.hostname !== "127.0.0.1" ||
  url.pathname !== "/email_change_disposable"
) {
  throw new Error(
    "Use scripts/test-email-change-postgres.mjs; this test only writes to its disposable database",
  );
}
after(() => prisma.$disconnect());
const password = "Disposable-password-42";
const hash = bcrypt.hashSync(password, 4);
async function fixture(google = false) {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      id,
      username: `test_${id.slice(0, 12)}`,
      email: `${id}@example.test`,
      passwordHash: google ? null : hash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  const messages: Array<{ to: string; code?: string }> = [];
  const service = createEmailChangeService({
    sendMail: async (message) => {
      messages.push(message);
    },
    revokeSessions: async (_id, options = {}) => ({
      ok: true,
      revokedAfter: options.now!,
      revokedAfterSeconds: options.now!.getTime() / 1000,
    }),
  });
  return {
    user,
    service,
    messages,
    code: () => {
      const code = messages.findLast((message) => message.code)?.code;
      assert.ok(code, "new address must receive a code");
      return code;
    },
  };
}

it("real transaction consumes once under concurrent confirmation, revokes and audits", async () => {
  const { user, service, code } = await fixture();
  const email = `${randomUUID()}@example.test`;
  const request = await service.requestEmailChange(user.id, { email, password });
  const expiresAt = new Date(Date.now() + 3600_000);
  await prisma.authSession.createMany({
    data: ["WEB", "DESKTOP", "MOBILE"].map((clientType) => ({
      id: randomUUID(),
      userId: user.id,
      clientType: clientType as "WEB" | "DESKTOP" | "MOBILE",
      expiresAt,
    })),
  });
  await prisma.session.create({
    data: { userId: user.id, token: randomUUID(), refreshToken: randomUUID(), expiresAt },
  });
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: randomUUID(), expiresAt },
  });
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      service.confirmEmailChange(user.id, { id: request.id, code: code() }),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(stored.email, email);
  assert.equal(stored.emailVerified, true);
  assert.ok(stored.sessionsRevokedAfter);
  assert.equal(
    await prisma.authSession.count({ where: { userId: user.id, revokedAt: { not: null } } }),
    3,
  );
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.emailVerificationToken.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.emailChangeChallenge.count({ where: { userId: user.id } }), 0);
  assert.equal(
    await prisma.securityEvent.count({ where: { userId: user.id, kind: "EMAIL_CHANGED" } }),
    1,
  );
});

it("concurrent guesses cannot exceed the five-attempt budget", async () => {
  const { user, service, code } = await fixture();
  const request = await service.requestEmailChange(user.id, {
    email: `${randomUUID()}@example.test`,
    password,
  });
  const wrong = code() === "000000" ? "111111" : "000000";
  const results = await Promise.allSettled(
    Array.from({ length: 9 }, () =>
      service.confirmEmailChange(user.id, { id: request.id, code: wrong }),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 0);
  const pending = await prisma.emailChangeChallenge.findUniqueOrThrow({
    where: { userId: user.id },
  });
  assert.equal(pending.attempts, 5);
  await assert.rejects(service.confirmEmailChange(user.id, { id: request.id, code: code() }));
});

it("two users cannot claim the same email; losing transaction preserves its account", async () => {
  const a = await fixture();
  const b = await fixture();
  const email = `${randomUUID()}@example.test`;
  const [ar, br] = await Promise.all([
    a.service.requestEmailChange(a.user.id, { email, password }),
    b.service.requestEmailChange(b.user.id, { email, password }),
  ]);
  const results = await Promise.allSettled([
    a.service.confirmEmailChange(a.user.id, { id: ar.id, code: a.code() }),
    b.service.confirmEmailChange(b.user.id, { id: br.id, code: b.code() }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await prisma.user.count({ where: { email } }), 1);
  const loser = results[0]!.status === "rejected" ? a : b;
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: loser.user.id } });
  assert.equal(stored.email, loser.user.email);
  assert.equal(stored.sessionsRevokedAfter, null);
  assert.equal(await prisma.emailChangeChallenge.count({ where: { userId: loser.user.id } }), 1);
});

it("Google reauthentication binds provider identity, then completes without a password", async () => {
  const { user, service, code, messages } = await fixture(true);
  const googleId = randomUUID();
  await prisma.account.create({
    data: { userId: user.id, type: "oauth", provider: "google", providerAccountId: googleId },
  });
  const request = await service.requestEmailChange(user.id, {
    email: `${randomUUID()}@example.test`,
  });
  assert.equal(messages.length, 0);
  assert.equal(await service.completeGoogleEmailReauth(request.googleToken!, "wrong"), false);
  assert.equal(await service.completeGoogleEmailReauth(request.googleToken!, googleId), true);
  await service.sendGoogleEmailChangeCode(user.id, request.id);
  await service.confirmEmailChange(user.id, { id: request.id, code: code() });
  assert.equal(
    await prisma.account.count({ where: { userId: user.id, providerAccountId: googleId } }),
    1,
  );
});

it("phone add, update and remove persist without granting verification or returning raw digits", async () => {
  const { user } = await fixture();
  assert.deepEqual(await saveAccountPhone(user.id, "+90 (532) 123-42-18"), {
    phone: "+905•••••4218",
  });
  let stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(stored.phoneNumber, "+905321234218");
  assert.equal(stored.phoneVerified, false);
  await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
  await saveAccountPhone(user.id, "+44 7700 900123");
  stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(stored.phoneVerified, false);
  await assert.rejects(saveAccountPhone(user.id, "0532invalid"));
  assert.deepEqual(await saveAccountPhone(user.id, ""), { phone: null });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phoneNumber, null);
});
