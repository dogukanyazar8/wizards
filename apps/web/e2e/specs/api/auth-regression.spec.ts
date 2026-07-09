import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "../../fixtures/test";
import { apiLoginAs } from "../../helpers/api-auth";
import { withE2EDatabase } from "../../helpers/db";
import { e2eUserPassword, e2eUsers, type E2EUserKey } from "../../helpers/test-data";
import { createLoginProof } from "../../../src/lib/auth/login-proof";
import { canOAuthUserSignIn } from "../../../src/lib/auth/oauth-email";
import { revokeUserSessions } from "../../../src/lib/auth/session-revocation";
import { generateTotpCode } from "../../../src/lib/auth/totp";
import { getRedis } from "../../../src/lib/redis";

const E2E_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

async function getCsrfToken(request: APIRequestContext) {
  const response = await request.get("/api/auth/csrf");

  expect(response.status()).toBe(200);

  const body = (await response.json()) as { csrfToken?: unknown };
  expect(typeof body.csrfToken).toBe("string");

  return body.csrfToken as string;
}

async function submitCredentialsLogin(
  request: APIRequestContext,
  userKey: E2EUserKey,
  options: {
    password?: string;
    twoFactorCode?: string;
  } = {},
) {
  const user = e2eUsers[userKey];
  const csrfToken = await getCsrfToken(request);

  return request.post("/api/auth/callback/credentials", {
    form: {
      callbackUrl: "/channels",
      csrfToken,
      email: user.email,
      loginProof: createLoginProof(user.email),
      password: options.password ?? e2eUserPassword,
      rememberMe: "false",
      twoFactorCode: options.twoFactorCode ?? "",
    },
  });
}

async function getSessionEmail(request: APIRequestContext) {
  const response = await request.get("/api/auth/session");

  expect(response.status()).toBe(200);

  const session = (await response.json()) as { user?: { email?: unknown } } | null;
  return typeof session?.user?.email === "string" ? session.user.email : null;
}

function getSessionRevocationKey(userId: string) {
  return `auth:session-revoked-after:${userId}`;
}

async function resetE2EUserAuthState(userKey: E2EUserKey) {
  await withE2EDatabase(async (prisma) => {
    const user = await prisma.user.findUnique({
      where: { email: e2eUsers[userKey].email },
      select: { id: true },
    });

    if (!user) {
      return;
    }

    await getRedis().del(getSessionRevocationKey(user.id));
    await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({
      data: {
        sessionsRevokedAfter: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
      where: { id: user.id },
    });
  });
}

async function enableE2EUserTwoFactor(userKey: E2EUserKey) {
  await withE2EDatabase(async (prisma) => {
    await prisma.user.update({
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: E2E_TOTP_SECRET,
      },
      where: { email: e2eUsers[userKey].email },
    });
  });
}

async function revokeE2EUserSessionsAfterIssue(userKey: E2EUserKey) {
  const revokedAfter = new Date(Date.now() + 2000);

  const userId = await withE2EDatabase(async (prisma) => {
    const user = await prisma.user.update({
      data: {
        sessionsRevokedAfter: revokedAfter,
      },
      where: { email: e2eUsers[userKey].email },
      select: { id: true },
    });

    return user.id;
  });

  const revocation = await revokeUserSessions(userId, { now: revokedAfter });
  expect(revocation.ok).toBe(true);
}

async function submitDuplicateRegistration(page: Page) {
  const uniqueName = `auth-upgrade-${Date.now()}`;

  await page.goto("/register");
  const form = page.getByTestId("register-form");
  await expect(form).toBeVisible();

  await form.locator('input[name="username"]').fill(uniqueName);
  await form.locator('input[name="email"]').fill(e2eUsers.alice.email);
  await form.locator('input[name="password"]').fill(e2eUserPassword);
  await form.locator('input[name="confirmPassword"]').fill(e2eUserPassword);
  await form.locator('input[type="checkbox"]').check();
  await form.locator('button[type="submit"]').click();
}

test.describe("Auth.js upgrade regression safety net", () => {
  test("credentials login uses the real Auth.js callback", async ({ request }) => {
    await resetE2EUserAuthState("alice");

    const response = await submitCredentialsLogin(request, "alice");

    expect(response.status()).toBeLessThan(500);
    await expect.poll(() => getSessionEmail(request)).toBe(e2eUsers.alice.email);
  });

  test("two-factor credentials login requires a valid second factor", async ({ request }) => {
    await resetE2EUserAuthState("alice");
    await enableE2EUserTwoFactor("alice");

    try {
      const missingFactorResponse = await submitCredentialsLogin(request, "alice");

      expect(missingFactorResponse.status()).toBeLessThan(500);
      await expect.poll(() => getSessionEmail(request)).toBe(null);

      const validFactorResponse = await submitCredentialsLogin(request, "alice", {
        twoFactorCode: generateTotpCode(E2E_TOTP_SECRET),
      });

      expect(validFactorResponse.status()).toBeLessThan(500);
      await expect.poll(() => getSessionEmail(request)).toBe(e2eUsers.alice.email);
    } finally {
      await resetE2EUserAuthState("alice");
    }
  });

  test("session revocation invalidates an already issued Auth.js session", async ({ request }) => {
    await resetE2EUserAuthState("bob");

    try {
      await apiLoginAs(request, "bob");

      await revokeE2EUserSessionsAfterIssue("bob");

      await expect.poll(() => getSessionEmail(request)).toBe(null);
    } finally {
      await resetE2EUserAuthState("bob");
    }
  });

  test("registration remains covered by the auth upgrade safety net", async ({ page }) => {
    await submitDuplicateRegistration(page);

    await expect(page.getByTestId("register-form").getByRole("alert")).toContainText(
      /already|taken|registered|kullan|kayit|kayıt|alin|alın|email/i,
    );
  });

  test("desktop OAuth handoff creates a one-time desktop claim URL", async ({ request }) => {
    test.skip(!process.env.REDIS_URL, "Redis-backed handoff creation needs REDIS_URL in E2E.");

    await apiLoginAs(request, "alice");

    const response = await request.get("/desktop/oauth/complete?callbackUrl=%2Fchannels");

    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("whispr://oauth/");
    expect(html).not.toContain(e2eUsers.alice.email);
  });

  test("Google OAuth remains tied to verified provider email", async () => {
    await expect(
      canOAuthUserSignIn({
        account: { provider: "google" },
        profile: { email: "alice@whispr.test", email_verified: true },
        user: { email: "alice@whispr.test" },
      }),
    ).resolves.toBe(true);

    await expect(
      canOAuthUserSignIn({
        account: { provider: "google" },
        profile: { email: "alice@whispr.test" },
        user: { email: "alice@whispr.test" },
      }),
    ).resolves.toBe(false);
  });

});
