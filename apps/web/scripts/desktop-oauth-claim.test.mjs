import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

test("desktop handoff preserves an existing session before consuming any token", async () => {
  const calls = [];
  const state = { session: { user: { id: "signed-in-user" } }, fail: false };
  class AuthError extends Error {}
  const result = await build({
    entryPoints: ["src/app/desktop/oauth/claim/[token]/actions.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "server-boundaries",
        setup(builder) {
          const modules = {
            "@/auth":
              "export const auth = () => boundary.auth(); export const signIn = (...args) => boundary.signIn(...args);",
            "next-auth": "export const AuthError = boundary.AuthError;",
            "next/navigation": "export const redirect = (path) => boundary.redirect(path);",
            "@wizards/db": "export const prisma = {};",
            "@/lib/redis":
              "export const getRedis = () => { throw new Error('Unexpected Redis connection'); };",
          };
          builder.onResolve(
            { filter: /^(?:@\/auth|next-auth|next\/navigation|@wizards\/db|@\/lib\/redis)$/ },
            ({ path }) => ({ path, namespace: "boundary" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
            contents: modules[path],
          }));
        },
      },
    ],
  });
  const outputModule = { exports: {} };
  runInNewContext(result.outputFiles[0].text, {
    module: outputModule,
    exports: outputModule.exports,
    URL,
    boundary: {
      AuthError,
      auth: async () => state.session,
      redirect: (path) => {
        throw new Error(`redirect:${path}`);
      },
      signIn: async (...args) => {
        calls.push(args);
        if (state.fail) throw new AuthError();
        throw new Error(`redirect:${args[1].redirectTo}`);
      },
    },
  });
  const claim = outputModule.exports.claimDesktopOAuthHandoffAction;
  for (const token of ["a".repeat(43), "expired-or-malformed"]) {
    await assert.rejects(claim(token, "/messages"), /redirect:\/messages/);
  }
  assert.equal(calls.length, 0, "an existing desktop session must not exchange the token again");
  await assert.rejects(claim("a".repeat(43), "https://evil.test"), /redirect:\/home/);
  state.session = null;
  assert.equal((await claim("invalid", "/messages")).error, "auth.desktopOAuth.invalid");
  assert.equal(calls.length, 0);
  await assert.rejects(claim("b".repeat(43), "/messages"), /redirect:\/messages/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].desktopOAuthHandoffToken, "b".repeat(43));
  state.fail = true;
  assert.equal((await claim("c".repeat(43), "/messages")).error, "auth.desktopOAuth.failed");
});
