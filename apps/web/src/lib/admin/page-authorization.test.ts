import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { getAuthRouteRedirectPath } from "@/proxy";

const pages = [
  "",
  "analytics",
  "audit",
  "feedback",
  "flags",
  "health",
  "help",
  "moderation",
  "notifications",
  "releases",
  "releases/[releaseId]",
  "servers",
  "support",
  "users",
  "voice",
];

for (const page of pages) {
  for (const allowed of [false, true]) {
    it(`/admin/${page}: waits for authorization before loading data (${allowed ? "allow" : "deny"})`, async () => {
      let accept!: (value: { role: string }) => void;
      let deny!: (reason: Error) => void;
      const authorization = new Promise<{ role: string }>((res, rej) => {
        accept = res;
        deny = rej;
      });
      const calls: string[] = [];
      const file = resolve("src/app/admin", page, "page.tsx");
      const code = transformSync(readFileSync(file, "utf8"), {
        loader: "tsx",
        format: "cjs",
        jsx: "automatic",
      }).code;
      const testModule = { exports: {} as { default: (props: unknown) => Promise<unknown> } };
      runInNewContext(code, {
        module: testModule,
        exports: testModule.exports,
        require(id: string) {
          if (id === "@/lib/admin/module-access")
            return { requireAdminModule: () => authorization };
          if (id === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
          return new Proxy(
            {},
            {
              get: (_, key) => {
                if (key === "__esModule") return true;
                if (key === "ADMIN_CAPABILITIES") return {};
                if (key === "normalizeDashboardDays") return () => 7;
                if (key === "parseAdminBoolean") return () => undefined;
                if (key === "adminRoleHasCapability") return () => false;
                return () => {
                  if (/^(get|load|list)/u.test(String(key))) calls.push(String(key));
                  return Promise.resolve({});
                };
              },
            },
          );
        },
      });
      const execution = testModule.exports.default({
        searchParams: Promise.resolve({}),
        params: Promise.resolve({ releaseId: "fixture" }),
      });
      const outcome = execution.then(
        () => "allowed",
        (error: Error) => error.message,
      );
      await new Promise<void>((done) => setImmediate(done));
      const beforeDecision = [...calls];
      if (allowed) accept({ role: "ADMIN" });
      else deny(new Error("denied"));
      assert.equal(await outcome, allowed ? "allowed" : "denied");
      assert.deepEqual(beforeDecision, [], "no loader may start while the guard is pending");
      assert.equal(calls.length > 0, allowed, "only authorized requests load admin data");
    });
  }
}

it("protects admin paths without matching unrelated prefixes", () => {
  for (const pathname of ["/admin", "/admin/voice", "/admin/releases/x"]) {
    assert.equal(
      getAuthRouteRedirectPath({ hasAuthSecret: true, isAuthenticated: false, pathname }),
      "/login",
    );
    assert.equal(
      getAuthRouteRedirectPath({ hasAuthSecret: true, isAuthenticated: true, pathname }),
      null,
    );
  }
  assert.equal(
    getAuthRouteRedirectPath({
      hasAuthSecret: true,
      isAuthenticated: false,
      pathname: "/administrator",
    }),
    null,
  );
});
