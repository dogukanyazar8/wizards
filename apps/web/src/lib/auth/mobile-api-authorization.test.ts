import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import { authorizeMobileApiRequest, requireMobileApiSession } from "./api";

const TEST_AUTH_SECRET = "test-mobile-authorization-secret";

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * Mirrors `createMobileAccessToken`, which is module-private. The token
 * contract is separately pinned by src/lib/mobile/auth.test.ts, so a drift
 * there fails loudly rather than silently weakening these cases.
 */
function mintAccessToken(
  overrides: { scopes?: string[]; sessionId?: string; userId?: string } = {},
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "whispr-mobile",
    exp: issuedAt + 900,
    iat: issuedAt,
    iss: "whispr-api",
    jti: randomBytes(16).toString("base64url"),
    scopes: overrides.scopes ?? ["mobile:bootstrap"],
    sid: overrides.sessionId ?? "session-1",
    sub: overrides.userId ?? "user-1",
    typ: "whispr-mobile-access",
    v: 1,
  };
  const signingInput = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  const signature = createHmac("sha256", TEST_AUTH_SECRET).update(signingInput).digest("base64url");

  return `${signingInput}.${signature}`;
}

function request(token: string | null) {
  return new Request("https://whispr.team/api/v1/mobile/bootstrap", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function activeUser() {
  return { deletedAt: null, emailVerified: true, id: "user-1", isBanned: false };
}

let previousSecret: string | undefined;
let previousNextAuthSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.AUTH_SECRET;
  previousNextAuthSecret = process.env.NEXTAUTH_SECRET;
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;
});

afterEach(() => {
  if (previousSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = previousSecret;
  }
  if (previousNextAuthSecret !== undefined) {
    process.env.NEXTAUTH_SECRET = previousNextAuthSecret;
  }
});

describe("authorizeMobileApiRequest", () => {
  it("starts the session, user, and rate-limit lookups concurrently", async () => {
    const started: string[] = [];
    let releaseSession = () => {};
    const sessionGate = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });

    const pending = authorizeMobileApiRequest(request(mintAccessToken()), "mobile:bootstrap", {
      enforceRateLimit: async () => {
        started.push("rate-limit");
      },
      findUser: async () => {
        started.push("user");
        return activeUser();
      },
      isSessionActive: async () => {
        started.push("session");
        await sessionGate;
        return true;
      },
    });

    // The session lookup is still blocked; both other calls must already have
    // run, which is the whole point of the change.
    await Promise.resolve();
    assert.deepEqual([...started].sort(), ["rate-limit", "session", "user"]);

    releaseSession();
    assert.equal(await pending, "user-1");
  });

  it("passes the route's rate-limit action through untouched", async () => {
    const actions: string[] = [];

    await authorizeMobileApiRequest(request(mintAccessToken()), "mobile:server:detail", {
      enforceRateLimit: async (userId, action) => {
        actions.push(`${userId}:${action}`);
      },
      findUser: async () => activeUser(),
      isSessionActive: async () => true,
    });

    assert.deepEqual(actions, ["user-1:mobile:server:detail"]);
  });

  it("reports an unauthorized request as 401 even when it is also rate limited", async () => {
    await assert.rejects(
      () =>
        authorizeMobileApiRequest(request(mintAccessToken()), "mobile:bootstrap", {
          enforceRateLimit: async () => {
            throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
          },
          findUser: async () => activeUser(),
          isSessionActive: async () => false,
        }),
      (error) => error instanceof ApiError && error.status === 401 && error.code === "UNAUTHORIZED",
    );
  });

  it("surfaces the rate limit once the request is authenticated", async () => {
    await assert.rejects(
      () =>
        authorizeMobileApiRequest(request(mintAccessToken()), "mobile:bootstrap", {
          enforceRateLimit: async () => {
            throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
          },
          findUser: async () => activeUser(),
          isSessionActive: async () => true,
        }),
      (error) => error instanceof ApiError && error.status === 429 && error.code === "RATE_LIMITED",
    );
  });

  it("keeps suspended and deleted accounts out before the rate limit is reported", async () => {
    await assert.rejects(
      () =>
        authorizeMobileApiRequest(request(mintAccessToken()), "mobile:bootstrap", {
          enforceRateLimit: async () => {
            throw new ApiError("Too many requests.", 429, "RATE_LIMITED");
          },
          findUser: async () => ({ ...activeUser(), isBanned: true }),
          isSessionActive: async () => true,
        }),
      (error) =>
        error instanceof ApiError && error.status === 403 && error.code === "ACCOUNT_SUSPENDED",
    );
  });

  it("rejects a missing, malformed, or wrongly scoped token before any backing call", async () => {
    const calls: string[] = [];
    const dependencies = {
      enforceRateLimit: async () => {
        calls.push("rate-limit");
      },
      findUser: async () => {
        calls.push("user");
        return activeUser();
      },
      isSessionActive: async () => {
        calls.push("session");
        return true;
      },
    };

    for (const token of [null, "not-a-token", mintAccessToken({ scopes: ["mobile:other"] })]) {
      await assert.rejects(
        () => authorizeMobileApiRequest(request(token), "mobile:bootstrap", dependencies),
        (error) => error instanceof ApiError && error.status === 401,
      );
    }

    assert.deepEqual(calls, []);
  });

  it("does not leave the losing lookup as an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      await assert.rejects(
        () =>
          authorizeMobileApiRequest(request(mintAccessToken()), "mobile:bootstrap", {
            enforceRateLimit: async () => {
              throw new Error("redis down");
            },
            findUser: async () => {
              throw new Error("postgres down");
            },
            isSessionActive: async () => false,
          }),
        (error) => error instanceof ApiError && error.status === 401,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    assert.deepEqual(unhandled, []);
  });
});

describe("requireMobileApiSession", () => {
  it("resolves the session and user lookups concurrently", async () => {
    const started: string[] = [];

    const session = await requireMobileApiSession(
      request(mintAccessToken({ sessionId: "session-9" })),
      {
        findUser: async () => {
          started.push("user");
          return activeUser();
        },
        isSessionActive: async () => {
          started.push("session");
          return true;
        },
      },
    );

    assert.deepEqual([...started].sort(), ["session", "user"]);
    assert.deepEqual(session, { sessionId: "session-9", userId: "user-1" });
  });

  it("rejects a revoked session with the shared 401", async () => {
    await assert.rejects(
      () =>
        requireMobileApiSession(request(mintAccessToken()), {
          findUser: async () => activeUser(),
          isSessionActive: async () => false,
        }),
      (error) => error instanceof ApiError && error.status === 401,
    );
  });
});
