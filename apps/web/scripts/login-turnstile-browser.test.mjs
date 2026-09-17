import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

test("auth forms expose required challenges and renew consumed tokens for retries", async () => {
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
        import { RegisterClient } from "@/app/(auth)/register/register-client";
        import { ForgotPasswordClient } from "@/app/(auth)/forgot-password/forgot-password-client";
        import { ResetPasswordClient } from "@/app/(auth)/reset-password/reset-password-client";
        import { LocaleProvider } from "@/components/providers/locale-provider";
        import { AuthSurfaceProvider } from "@/components/auth/auth-surface";
        import { getMessagesForLocale } from "@/lib/locale";
        window.__WHISPR_DESKTOP__ = {shell:"desktop"};
        const screens = {
          '/register': <RegisterClient callbackUrl="/channels" />,
          '/forgot-password': <ForgotPasswordClient />,
          '/reset-password': <ResetPasswordClient token="fixture-reset-token" />,
        };
        createRoot(document.getElementById("root")).render(
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <AuthSurfaceProvider surface="desktop">{screens[location.pathname] ?? <LoginClient callbackUrl="/channels" />}</AuthSurfaceProvider>
          </LocaleProvider>
        );
      `,
    },
    plugins: [
      {
        name: "login-fixture-boundaries",
        setup(builder) {
          const modules = {
            "@/lib/auth/actions": `export const loginAction = async data => {
                const token=data.get('turnstileToken');
                (window.loginTokens ??= []).push(token);
                if(window.loginNetworkFailure) throw new Error('fixture network failure');
                return window.loginOutcome ?? {success:false,status:'credentials',attemptsLeft:3};
              };
              const submit = async data => {
                window.submittedToken = data.get('turnstileToken');
                (window.formTokens ??= []).push(window.submittedToken);
                return window.formOutcome ?? {success:true};
              };
              export const registerAction = submit;
              export const forgotPasswordAction = submit;
              export const resetPasswordAction = submit;`,
            "next-auth/react": "export const signIn = async () => {};",
            "next/navigation":
              "const router = {replace(path){window.redirectPath=path},push(){}}; export const useRouter = () => router; export const unstable_rethrow = error => { if(error?.digest?.startsWith('NEXT_REDIRECT')) throw error; };",
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
      if (url.includes("username-availability")) {
        return route.fulfill({ json: { available: true, suggestions: [] } });
      }
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/v0/api.js")) {
        return route.fulfill({
          contentType: "application/javascript",
          body: `
          window.turnstile = {
            render(container, options) {
              const index = window.turnstileRenders = (window.turnstileRenders ?? 0) + 1;
              const token = index === 1 ? "fixture-token" : "fixture-token-" + index;
              (window.previousChallenges ??= []).push(options);
              window.challengeOptions = options;
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = "Complete security challenge";
              button.hidden = true;
              window.beginChallenge = () => {
                options["before-interactive-callback"]();
                button.hidden = false;
              };
              button.onclick = () => {
                button.hidden = true;
                options.callback(token);
                options["after-interactive-callback"]();
              };
              container.appendChild(button);
              if (location.search === "?invisible=1") {
                queueMicrotask(() => options.callback(token));
              }
              return "fixture-widget";
            },
            remove() { document.querySelector(".auth-reference-turnstile-mount")?.replaceChildren(); }
          };
        `,
        });
      }
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    for (const screen of ["login", "register"]) {
      await page.goto(`https://login.invalid/${screen}`);
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const submit = page.locator('form button[type="submit"]');
      await page.locator('input[type="email"]').fill("fixture@example.test");
      await page.locator('input[type="password"]').fill("Fixture-only-password1!");
      if (screen === "register") {
        await page.locator('input[name="displayName"]').fill("Fixture User");
        await page.locator('input[name="username"]').fill("fixture_user");
        await page.getByRole("checkbox").focus();
        await page.keyboard.press("Space");
        await expect(page.getByRole("checkbox")).toBeChecked();
      } else {
        for (const provider of ["Microsoft", "Apple"]) {
          const button = page.getByRole("button", { name: new RegExp(provider) });
          await expect(button).toBeDisabled();
          await expect(button).toHaveCSS("cursor", "default");
        }
      }
      await expect(submit).toBeDisabled();
      await expect(page.locator('.auth-turnstile-tile[data-state="pending"]')).toBeVisible();
      await expect(page.locator(".auth-turnstile")).not.toContainText("İnsan olduğun doğrulandı");
      const challenge = page.getByRole("button", { name: "Complete security challenge" });
      await expect(challenge).toBeHidden();
      assert.equal(
        await page.evaluate(() => window.challengeOptions.appearance),
        "interaction-only",
      );
      await page.evaluate(() => window.beginChallenge());
      await expect(page.locator(".auth-turnstile")).toHaveCount(0);
      await expect(challenge).toBeInViewport();
      await challenge.click();
      await expect(submit).toBeEnabled();
      await expect(page.locator('.auth-turnstile-tile[data-state="verified"]')).toBeVisible();
      await expect(page.locator(".auth-turnstile")).toContainText("İnsan olduğun doğrulandı");
      await page.evaluate(() => window.challengeOptions["expired-callback"]());
      await expect(submit).toBeDisabled();
      await expect(page.locator('.auth-turnstile-tile[data-state="pending"]')).toBeVisible();
      for (const callback of ["error-callback", "timeout-callback", "unsupported-callback"]) {
        await page.evaluate((name) => window.challengeOptions[name](), callback);
        await expect(submit).toBeDisabled();
        await expect(page.getByRole("alert")).toContainText(
          "Güvenlik doğrulaması şu anda kullanılamıyor",
        );
        await page.evaluate(() => window.beginChallenge());
        await challenge.click();
        await expect(submit).toBeEnabled();
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
      if (screen === "register") {
        await submit.click();
        await expect.poll(() => page.evaluate(() => window.submittedToken)).toBe("fixture-token");
        await expect
          .poll(() => page.evaluate(() => window.redirectPath))
          .toBe("/verify-email?next=%2Fchannels");
      } else {
        await page.evaluate(() => {
          window.oauthWindows = [];
          window.open = (...args) => {
            window.oauthWindows.push(args);
            return null;
          };
        });
        const google = page.getByRole("button", { name: /Google/ });
        await google.evaluate((button) => {
          for (let index = 0; index < 5; index++) button.click();
        });
        assert.equal(await page.evaluate(() => window.oauthWindows.length), 1);
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            (value) => document.documentElement.setAttribute("data-auth-theme", value),
            theme,
          );
          for (const width of [1280, 540, 390]) {
            await page.setViewportSize({ width, height: 800 });
            // Wait for the shared button's theme transition before comparing colors.
            await expect
              .poll(() =>
                dialog.evaluate(
                  (element) =>
                    getComputedStyle(element.querySelector(".auth-block-icon")).color ===
                    getComputedStyle(element.querySelector(".auth-btn-primary")).backgroundColor,
                ),
              )
              .toBe(true);
            const geometry = await dialog.evaluate((element) => {
              const button = element.querySelector(".auth-btn-primary");
              const icon = button.querySelector("svg").getBoundingClientRect();
              const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
              let text;
              while (walker.nextNode()) {
                if (walker.currentNode.textContent.trim()) {
                  text = walker.currentNode;
                  break;
                }
              }
              const range = document.createRange();
              range.selectNodeContents(text);
              const label = range.getBoundingClientRect();
              const card = element.querySelector("section").getBoundingClientRect();
              return {
                iconY: icon.y + icon.height / 2,
                labelY: label.y + label.height / 2,
                iconRight: icon.right,
                labelLeft: label.left,
                spinnerColor: getComputedStyle(element.querySelector(".auth-block-icon")).color,
                primaryColor: getComputedStyle(button).backgroundColor,
                cardLeft: card.left,
                cardRight: card.right,
                viewport: innerWidth,
              };
            });
            assert.ok(
              Math.abs(geometry.iconY - geometry.labelY) < 3,
              "retry icon and label must share a row",
            );
            assert.ok(geometry.iconRight < geometry.labelLeft, "retry icon must precede its label");
            assert.equal(
              geometry.spinnerColor,
              geometry.primaryColor,
              "pending must use the primary color",
            );
            assert.ok(geometry.cardLeft >= 0 && geometry.cardRight <= geometry.viewport);
            if (process.env.AUTH_PENDING_SCREENSHOT_DIR) {
              await mkdir(process.env.AUTH_PENDING_SCREENSHOT_DIR, { recursive: true });
              await dialog.locator("section").screenshot({
                path: join(
                  process.env.AUTH_PENDING_SCREENSHOT_DIR,
                  `pending-${width}-${theme}.png`,
                ),
              });
            }
          }
        }
        await dialog.locator(".auth-btn-primary").click();
        const windows = await page.evaluate(() => window.oauthWindows);
        assert.equal(windows.length, 2);
        assert.deepEqual(windows[0], windows[1]);
        assert.equal(windows[0][1], "_blank");
        assert.equal(windows[0][2], "noopener,noreferrer");
        const start = new URL(windows[0][0]);
        assert.equal(start.pathname, "/desktop/oauth/start");
        assert.equal(start.searchParams.get("callbackUrl"), "/channels");
        assert.ok(start.searchParams.get("request"));
        await dialog.getByRole("button", { name: "İptal et", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(google).toBeEnabled();
        await google.click();
        const freshRequest = await page.evaluate(() =>
          new URL(window.oauthWindows.at(-1)[0]).searchParams.get("request"),
        );
        assert.notEqual(freshRequest, start.searchParams.get("request"));
        await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await page.setViewportSize({ width: 1280, height: 1000 });
      }
    }
    for (const screen of ["login", "register"]) {
      await page.goto(`https://login.invalid/${screen}?invisible=1`);
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await expect(page.locator('.auth-turnstile-tile[data-state="verified"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Complete security challenge" })).toBeHidden();
      await expect(page.locator(".auth-turnstile")).toHaveCount(1);
      if (process.env.AUTH_VERIFICATION_SCREENSHOT_DIR) {
        await mkdir(process.env.AUTH_VERIFICATION_SCREENSHOT_DIR, { recursive: true });
        await page.locator(".auth-turnstile").screenshot({
          path: join(process.env.AUTH_VERIFICATION_SCREENSHOT_DIR, `${screen}-invisible.png`),
        });
      }
      await page.evaluate(() => window.challengeOptions["expired-callback"]());
      await expect(page.locator('.auth-turnstile-tile[data-state="pending"]')).toBeVisible();
      await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    }
    for (const scenario of ["credentials-managed", "credentials-invisible", "network"]) {
      const invisible = scenario !== "credentials-managed";
      await page.goto(`https://login.invalid/login${invisible ? "?invisible=1" : ""}`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.locator('input[name="email"]').fill("wrong@example.test");
      await page.locator('input[name="password"]').fill("Wrong-password1!");
      const submit = page.locator('form button[type="submit"]');
      const token = page.locator('input[name="turnstileToken"]');
      const complete = async () => {
        if (!invisible) {
          await page.evaluate(() => window.beginChallenge());
          await page.getByRole("button", { name: "Complete security challenge" }).click();
        }
        await expect(submit).toBeEnabled();
      };
      await complete();
      if (scenario === "network")
        await page.evaluate(() => {
          window.loginNetworkFailure = true;
        });
      await submit.click();
      await expect.poll(() => page.evaluate(() => window.turnstileRenders)).toBe(2);
      await expect(page.locator('input[name="email"]')).toHaveValue("wrong@example.test");
      await expect(page.locator('input[name="password"]')).toHaveValue("Wrong-password1!");
      // Late callbacks from the removed challenge cannot revive its consumed token.
      await page.evaluate(() => window.previousChallenges[0].callback("stale-token"));
      if (!invisible) {
        await expect(token).toHaveValue("");
        await expect(submit).toBeDisabled();
      } else await expect(token).toHaveValue("fixture-token-2");
      await complete();
      await page.locator('input[name="email"]').fill("correct@example.test");
      await page.locator('input[name="password"]').fill("Correct-password1!");
      await page.evaluate(() => {
        window.loginNetworkFailure = false;
        window.loginOutcome = { success: true };
      });
      await submit.click();
      await expect.poll(() => page.evaluate(() => window.redirectPath)).toBe("/channels");
      assert.deepEqual(await page.evaluate(() => window.loginTokens), [
        "fixture-token",
        "fixture-token-2",
      ]);
    }
    for (const [screen, destination] of [
      ["register", "/verify-email?next=%2Fchannels"],
      ["forgot-password", "/forgot-password/sent"],
      ["reset-password", "/reset-password/done"],
    ]) {
      await page.goto(`https://login.invalid/${screen}`);
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      if (screen !== "reset-password")
        await page.locator('input[name="email"]').fill("fixture@example.test");
      if (screen !== "forgot-password")
        await page.locator('input[name="password"]').fill("Fixture-only-password1!");
      if (screen === "reset-password")
        await page.locator('input[name="confirmPassword"]').fill("Fixture-only-password1!");
      if (screen === "register") {
        await page.locator('input[name="displayName"]').fill("Fixture User");
        await page.locator('input[name="username"]').fill("fixture_user");
        await page.getByRole("checkbox").focus();
        await page.keyboard.press("Space");
        await expect(page.getByRole("checkbox")).toBeChecked();
      }
      await page.evaluate(() => {
        window.formOutcome = { success: false, status: "network" };
      });
      const submit = page.locator('form button[type="submit"]');
      await expect(submit).toBeDisabled();
      await page.evaluate(() => window.beginChallenge());
      const challenge = page.getByRole("button", { name: "Complete security challenge" });
      await expect(challenge).toBeInViewport();
      await challenge.click();
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect.poll(() => page.evaluate(() => window.turnstileRenders)).toBe(2);
      await expect(submit).toBeDisabled();
      await page.evaluate(() => window.beginChallenge());
      await expect(challenge).toBeInViewport();
      await challenge.click();
      await expect(page.locator('input[name="turnstileToken"]')).toHaveValue("fixture-token-2");
      await page.evaluate(() => {
        window.formOutcome = { success: true };
      });
      await submit.click();
      await expect.poll(() => page.evaluate(() => window.redirectPath)).toBe(destination);
      assert.deepEqual(await page.evaluate(() => window.formTokens), [
        "fixture-token",
        "fixture-token-2",
      ]);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
