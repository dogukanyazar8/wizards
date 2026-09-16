import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { it } from "node:test";
import { decode, type JWT } from "next-auth/jwt";
import { authSessionJwt, refreshJwtSessionExpiry } from "./session-lifetime";

it("preserves each session's policy across concurrent token issuance", async () => {
  const secret = randomBytes(32).toString("hex");
  const salt = "authjs.session-token";
  await Promise.all(
    [false, true, false, undefined].map(async (rememberMe) => {
      const token: JWT = {
        sub: "synthetic-user",
        ...(rememberMe === undefined ? {} : { rememberMe }),
      };
      refreshJwtSessionExpiry(token);
      const encoded = await authSessionJwt.encode({ secret, salt, token });
      const decoded = await decode({ secret, salt, token: encoded });
      assert.equal(decoded?.exp, token.exp);
      assert.ok(decoded?.iat);
      const remaining = decoded.exp! - decoded.iat;
      const expected = rememberMe === false ? 43_200 : 2_592_000;
      assert.ok(remaining <= expected && remaining >= expected - 2);
    }),
  );
});

it("does not extend the selected expiry when encoding happens later", async () => {
  const secret = randomBytes(32).toString("hex");
  const salt = "authjs.session-token";
  const token: JWT = { sub: "synthetic-user", rememberMe: false };
  refreshJwtSessionExpiry(token, Math.floor(Date.now() / 1000) - 30);
  const encoded = await authSessionJwt.encode({ secret, salt, token });
  const decoded = await decode({ secret, salt, token: encoded });
  assert.equal(decoded?.exp, token.exp);
  assert.ok(decoded!.exp! - decoded!.iat! <= 43_170);
});

it("rejects already expired and wrongly encrypted tokens", async () => {
  const secret = randomBytes(32).toString("hex");
  const salt = "authjs.session-token";
  const expired = await authSessionJwt.encode({
    secret,
    salt,
    token: { sub: "synthetic-user", rememberMe: false, exp: Math.floor(Date.now() / 1000) - 60 },
  });
  await assert.rejects(authSessionJwt.decode({ secret, salt, token: expired }), {
    code: "ERR_JWT_EXPIRED",
  });
  const valid = await authSessionJwt.encode({
    secret,
    salt,
    token: { sub: "synthetic-user", rememberMe: false },
  });
  await assert.rejects(
    authSessionJwt.decode({ secret: randomBytes(32).toString("hex"), salt, token: valid }),
  );
});

it("preserves expiry when encryption crosses a clock boundary", async (t) => {
  const secret = randomBytes(32).toString("hex");
  const salt = "authjs.session-token";
  const now = Math.floor(Date.now() / 1000);
  const token: JWT = { sub: "synthetic-user", rememberMe: false };
  refreshJwtSessionExpiry(token, now);
  t.mock.method(Date, "now", () => (now + 2) * 1000);
  const encoded = await authSessionJwt.encode({ secret, salt, token });
  const decoded = await decode({ secret, salt, token: encoded });
  assert.equal(decoded?.exp, token.exp);
});
