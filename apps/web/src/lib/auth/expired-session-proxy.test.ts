import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { it } from "node:test";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { proxy } from "@/proxy";

it("removes expired and malformed session cookies from the browser and downstream request", async (t) => {
  const secret = randomBytes(32).toString("hex");
  const environmentVariables: Record<string, string | undefined> = process.env;
  const keys = ["AUTH_SECRET", "NODE_ENV", "E2E_TEST_MODE", "E2E_ALLOW_PRODUCTION_BUILD"] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else environmentVariables[key] = value;
    }
  });
  process.env.AUTH_SECRET = secret;
  delete process.env.E2E_TEST_MODE;
  delete process.env.E2E_ALLOW_PRODUCTION_BUILD;
  for (const environment of ["development", "production"]) {
    environmentVariables.NODE_ENV = environment;
    const name =
      environment === "production" ? "__Secure-authjs.session-token" : "authjs.session-token";
    const token = await encode({
      secret,
      salt: name,
      token: { sub: "synthetic-user" },
      maxAge: -60,
    });
    for (const path of ["/", "/login", "/channels"]) {
      for (const cookie of [`${name}=${token}`, `${name}.0=broken; ${name}.42=broken`]) {
        const request = new NextRequest(`https://example.invalid${path}`, {
          headers: { cookie: `${cookie}; preference=keep; ${name}-unrelated=keep` },
        });
        const response = await proxy(request);
        assert.equal(response.status, path === "/channels" ? 307 : 200);
        assert.ok(
          response.headers
            .getSetCookie()
            .some((value) => value.startsWith(`${name}=`) && value.includes("Max-Age=0")),
        );
        if (cookie.includes(".42=")) {
          assert.ok(
            response.headers.getSetCookie().some((value) => value.startsWith(`${name}.42=`)),
          );
        }
        if (path !== "/channels") {
          const forwarded = response.headers.get("x-middleware-request-cookie");
          assert.ok(forwarded?.includes("preference=keep"));
          assert.ok(forwarded?.includes(`${name}-unrelated=keep`));
          assert.ok(!forwarded?.includes(`${name}=`));
          assert.ok(!forwarded?.includes(`${name}.0=`));
        }
      }
    }
    const valid = await encode({
      secret,
      salt: name,
      token: { sub: "synthetic-user" },
      maxAge: 3600,
    });
    const split = Math.floor(valid.length / 2);
    for (const cookie of [
      "preference=keep",
      `${name}=${valid}`,
      `${name}.0=${valid.slice(0, split)}; ${name}.1=${valid.slice(split)}`,
    ]) {
      const response = await proxy(
        new NextRequest("https://example.invalid/login", { headers: { cookie } }),
      );
      assert.equal(response.headers.getSetCookie().length, 0);
    }
  }
});
