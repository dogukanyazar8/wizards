import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { build } from "esbuild";

test("2FA actions set trust only after a successful sign-in and never expose proof in JSON", async () => {
  const calls = [];
  const state = { fail: false, invalid: false, errorRedirect: false };
  class AuthError extends Error {}
  const modules = {
    "@/auth": "export const signIn=(...args)=>boundary.signIn(...args);",
    "next-auth": "export const AuthError=boundary.AuthError;",
    "next/headers":
      "export const headers=async()=>new Headers({'user-agent':'fixture-browser'}); export const cookies=async()=>boundary.cookies;",
    "@wizards/db": "export const prisma={};",
    "@/lib/auth/login-proof": "export const createLoginProof=()=> 'login-proof';",
    "@/lib/auth/two-factor-login":
      "export const submitTwoFactorCode=(input)=>boundary.verify(input); export const submitBackupCode=(input)=>boundary.verify(input);",
  };
  const bundle = await build({
    entryPoints: ["src/lib/auth/two-factor-login-actions.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "boundaries",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, ({ path }) =>
            path in modules ? { path, namespace: "boundary" } : undefined,
          );
          builder.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
            contents: modules[path],
          }));
        },
      },
    ],
  });
  const output = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    module: output,
    exports: output.exports,
    require: createRequire(import.meta.url),
    Headers,
    URL,
    process,
    console,
    boundary: {
      AuthError,
      verify: async (input) => {
        calls.push(["verify", input.rememberDevice]);
        return state.invalid
          ? { status: "codeInvalid" }
          : {
              status: "ok",
              ticket: "ticket",
              email: "user@example.test",
              redirectTo: "/messages",
              ...(input.rememberDevice ? { trustedDeviceToken: "private-device-proof" } : {}),
            };
      },
      signIn: async (provider, options) => {
        calls.push(["signIn", provider, options.redirect]);
        assert.equal(options.twoFactorTicket, "ticket");
        if (state.fail) throw new AuthError();
        if (state.errorRedirect) return "https://whispr.test/login?error=Configuration";
        return "/messages";
      },
      cookies: {
        set(name, token, options) {
          assert.match(name, /whispr\.trusted-device$/);
          assert.equal(options.httpOnly, true);
          assert.equal(options.maxAge, 2592000);
          assert.equal(options.sameSite, "lax");
          calls.push(["remember", token]);
        },
      },
    },
  });
  for (const action of ["submitTwoFactorCodeAction", "submitBackupCodeAction"]) {
    const form = new FormData();
    form.set("challengeId", "a".repeat(32));
    form.set("code", "123456");
    form.set("backupCode", "7QF42KDX9M");
    for (const checked of [false, true]) {
      calls.length = 0;
      form.set("rememberDevice", String(checked));
      const result = await output.exports[action](form);
      assert.equal(result.success, true);
      assert.equal(JSON.stringify(result).includes("private-device-proof"), false);
      assert.deepEqual(calls, [
        ["verify", checked],
        ["signIn", "credentials", false],
        ...(checked ? [["remember", "private-device-proof"]] : []),
      ]);
    }
    calls.length = 0;
    state.fail = true;
    assert.equal((await output.exports[action](form)).success, false);
    assert.equal(
      calls.some(([name]) => name === "remember"),
      false,
    );
    state.fail = false;
    state.errorRedirect = true;
    calls.length = 0;
    assert.equal((await output.exports[action](form)).success, false);
    assert.equal(
      calls.some(([name]) => name === "remember"),
      false,
    );
    state.errorRedirect = false;
    state.invalid = true;
    calls.length = 0;
    assert.equal((await output.exports[action](form)).success, false);
    assert.equal(
      calls.some(([name]) => name === "signIn" || name === "remember"),
      false,
    );
    state.invalid = false;
  }
});
