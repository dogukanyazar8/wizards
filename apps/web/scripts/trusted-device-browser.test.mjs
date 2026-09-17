import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

test("authenticator, recovery and Google screens submit explicit remember-device consent", async () => {
  const bundle = await build({
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {LocaleProvider} from "@/components/providers/locale-provider";
      import {getMessagesForLocale} from "@/lib/locale";
      import {TwoFactorClient} from "@/app/(auth)/login/two-factor/two-factor-client";
      import {BackupCodeClient} from "@/app/(auth)/login/backup-code/backup-code-client";
      import {OAuthTwoFactorClient} from "@/app/(auth)/oauth-two-factor/oauth-two-factor-client";
      import {storeTwoFactorChallenge} from "@/app/(auth)/login/challenge-transport";
      const root=createRoot(document.getElementById("root"));let generation=0;
      window.mount=(kind)=>{
        window.submitted=null;
        storeTwoFactorChallenge({challengeId:"a".repeat(32),email:"user@example.test"});
        const screen=kind==="totp"?<TwoFactorClient callbackUrl="/messages"/>:kind==="backup"?<BackupCodeClient callbackUrl="/messages"/>:
          <OAuthTwoFactorClient callbackUrl="/messages" challengeToken={"a".repeat(32)} provider="google"/>;
        root.render(<LocaleProvider key={++generation} initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>{screen}</LocaleProvider>);
      };
    `,
    },
    plugins: [
      {
        name: "boundaries",
        setup(builder) {
          const modules = {
            "next/navigation":
              "const router={replace(path){window.redirected=path;}}; export const useRouter=()=>router; export const useSearchParams=()=>new URLSearchParams();",
            "next-auth/react": "export const signIn=async()=>{};",
            "@/lib/auth/two-factor-login-actions":
              "const submit=async form=>{window.submitted=Object.fromEntries(form);return {success:true};}; export const submitTwoFactorCodeAction=submit; export const submitBackupCodeAction=submit;",
          };
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
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      if (route.request().isNavigationRequest())
        return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
      if (route.request().url().endsWith("/api/v1/auth/oauth-two-factor")) {
        await page.evaluate((input) => {
          window.submitted = input;
        }, route.request().postDataJSON());
        return route.fulfill({ json: { success: true, provider: "google" } });
      }
      return route.abort();
    });
    await page.goto("https://auth.invalid");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    for (const kind of ["totp", "backup", "google"]) {
      for (const checked of [false, true]) {
        await page.evaluate((kind) => window.mount(kind), kind);
        const checkbox = page.getByRole("checkbox", { name: "Bu cihazı 30 gün hatırla" });
        await expect(checkbox).not.toBeChecked();
        if (checked) await checkbox.check();
        await page
          .locator('input[autocomplete="one-time-code"]')
          .fill(kind === "backup" ? "7QF42KDX9M" : "123456");
        await page.locator('button[type="submit"]').click();
        await expect.poll(() => page.evaluate(() => window.submitted)).not.toBeNull();
        const submitted = await page.evaluate(() => window.submitted);
        assert.equal(submitted.rememberDevice, kind === "google" ? checked : String(checked));
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
