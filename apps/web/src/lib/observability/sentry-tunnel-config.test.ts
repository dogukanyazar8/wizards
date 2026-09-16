import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { it } from "node:test";
import type * as NextTesting from "next/experimental/testing/server";
import nextConfig from "../../../next.config";
import { config } from "../../proxy";

const { unstable_doesMiddlewareMatch } = createRequire(import.meta.url)(
  "next/experimental/testing/server",
) as typeof NextTesting;

it("keeps Sentry envelopes out of external rewrites and session middleware", async () => {
  const rewrites = await nextConfig.rewrites?.();
  const routes = Array.isArray(rewrites)
    ? rewrites
    : [
        ...(rewrites?.beforeFiles ?? []),
        ...(rewrites?.afterFiles ?? []),
        ...(rewrites?.fallback ?? []),
      ];
  assert.ok(!routes.some((route) => route.source.startsWith("/monitoring")));
  for (const url of ["/monitoring", "/monitoring/", "/monitoring?o=123&p=456&r=de"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig, url }), false, url);
  }
  for (const url of ["/channels", "/login", "/api/v1/users/me", "/monitoring-dashboard"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig, url }), true, url);
  }
});
