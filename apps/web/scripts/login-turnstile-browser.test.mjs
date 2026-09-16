import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

test("desktop login exposes an interactive challenge and keeps errors and expiry fail-closed", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": '"fixture-site-key"',
      "process.env": "{}",
    },
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { LoginClient } from "@/app/(auth)/login/login-client";
        import { LocaleProvider } from "@/components/providers/locale-provider";
        import { AuthSurfaceProvider } from "@/components/auth/auth-surface";
        import { getMessagesForLocale } from "@/lib/locale";
        window.__WHISPR_DESKTOP__ = {shell:"desktop"};
        createRoot(document.getElementById("root")).render(
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <AuthSurfaceProvider surface="desktop"><LoginClient callbackUrl="/channels" /></AuthSurfaceProvider>
          </LocaleProvider>
        );
      `,
    },
    plugins: [
      {
        name: "login-fixture-boundaries",
        setup(builder) {
          const modules = {
            "@/lib/auth/actions":
              "export const loginAction = async () => { throw new Error('Unexpected credential submission'); };",
            "next-auth/react": "export const signIn = async () => {};",
            "next/navigation":
              "const router = {replace(){},push(){}}; export const useRouter = () => router;",
          };
          builder.onResolve(
            { filter: /^(?:@\/lib\/auth\/actions|next-auth\/react|next\/navigation)$/ },
            ({ path }) => ({ path, namespace: "login-fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "login-fixture" }, ({ path }) => ({
            contents: modules[path],
          }));
        },
      },
    ],
  });
  const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
  const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), {
    from: cssPath,
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/v0/api.js")) {
        return route.fulfill({
          contentType: "application/javascript",
          body: `
          window.turnstile = {
            render(container, options) {
              window.challengeOptions = options;
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = "Complete security challenge";
              button.onclick = () => options.callback("fixture-token");
              container.appendChild(button);
              return "fixture-widget";
            },
            remove() { document.querySelector(".auth-reference-turnstile-mount")?.replaceChildren(); }
          };
        `,
        });
      }
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("https://login.invalid/");
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const submit = page.getByRole("button", { name: "Giriş yap", exact: true });
    await page.locator('input[type="email"]').fill("fixture@example.test");
    await page.locator('input[autocomplete="current-password"]').fill("Fixture-only-password1!");
    await expect(submit).toBeDisabled();
    const challenge = page.getByRole("button", { name: "Complete security challenge" });
    await expect(challenge).toBeInViewport();
    await challenge.click();
    await expect(submit).toBeEnabled();
    await page.evaluate(() => window.challengeOptions["expired-callback"]());
    await expect(submit).toBeDisabled();
    for (const callback of ["error-callback", "timeout-callback", "unsupported-callback"]) {
      await page.evaluate((name) => window.challengeOptions[name](), callback);
      await expect(submit).toBeDisabled();
      await expect(page.getByRole("alert")).toContainText(
        "Güvenlik doğrulaması şu anda kullanılamıyor",
      );
      await challenge.click();
      await expect(submit).toBeEnabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
