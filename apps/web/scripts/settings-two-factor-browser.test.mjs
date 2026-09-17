import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

// Exercise the real account section, query cache and forms. Only server actions
// and unrelated HTTP reads are isolated; no database or real credentials.
test("settings two-factor activation, recovery download/renewal and disable", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
        import React, {useState} from "react";
        import {createRoot} from "react-dom/client";
        import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
        import {LocaleProvider} from "@/components/providers/locale-provider";
        import {getMessagesForLocale} from "@/lib/locale";
        import {AccountSection} from "@/components/settings/sections/account/account-section";
        import {findSettingsSection} from "@/lib/settings/tree";
        import {settingsQueryKeys} from "@/lib/settings/client";
        import {SETTINGS_TEST_BOOTSTRAP, SETTINGS_TEST_LAYOUT} from "@/lib/settings/read-test-fixtures";
        const queryClient = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
        queryClient.setQueryData(settingsQueryKeys.bootstrap, SETTINGS_TEST_BOOTSTRAP);
        queryClient.setQueryData(settingsQueryKeys.layout, SETTINGS_TEST_LAYOUT);
        window.queryClient = queryClient;
        window.enabled = false;
        window.renewCalls = 0;
        window.serverAction = async (name, ...args) => {
          switch(name) {
            case "getAccountContactAction": return {phone:null,hasPassword:true,googleAvailable:true,twoFactorEnabled:window.enabled};
            case "getProfileDetailsAction": return {bio:null,customStatus:null,customStatusEmoji:null,customStatusExpiresAt:null};
            case "getRecoveryCodeStatusAction": return {success:true,total:10,unused:10};
            case "beginTwoFactorSetupAction": return {success:true,manualEntryKey:"ABCD EFGH IJKL MNOP",otpauthUri:"otpauth://totp/Whispr:fixture?secret=ABCDEFGHIJKLMNOP&issuer=Whispr"};
            case "confirmTwoFactorSetupAction": window.enabled = true; return {success:true,recoveryCodes:["AAAA-1111","BBBB-2222"]};
            case "regenerateRecoveryCodesAction":
              window.renewCalls++; window.lastRenewInput=args[0];
              if(window.delayRenew) await new Promise(resolve => window.finishRenew = resolve);
              if(window.failRenew) return {success:false,error:"settings.account.twoFactor.errors.invalidCode"};
              return {success:true,recoveryCodes:["CCCC-3333","DDDD-4444"]};
            case "disableTwoFactorAction": window.enabled=false; return {success:true};
            default: throw new Error("Unexpected server action: " + name);
          }
        };
        const section = findSettingsSection("account");
        function Fixture() {
          const [openRisky,setOpenRisky] = useState(null);
          return <AccountSection input={{section,tab:section.tabs.find(t=>t.key==="security"),openRisky,openSelect:null,
            toggleRisky:key=>setOpenRisky(previous=>previous===key?null:key),toggleSelect(){}}}/>;
        }
        const app = createRoot(document.getElementById("root"));
        let generation = 0;
        window.mount = () => app.render(<React.StrictMode><QueryClientProvider client={queryClient}>
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <Fixture key={++generation}/>
          </LocaleProvider>
        </QueryClientProvider></React.StrictMode>);
        window.mount();
      `,
    },
    plugins: [
      {
        name: "server-boundaries",
        setup(builder) {
          builder.onLoad(
            { filter: /[\\/]lib[\\/](account|auth|locale|appearance)[\\/].*actions\.ts$/ },
            async ({ path }) => {
              const source = await readFile(path, "utf8");
              if (!source.startsWith('"use server"')) return;
              const names = [...source.matchAll(/export async function (\w+)/g)].map(
                (match) => match[1],
              );
              return {
                contents: names
                  .map(
                    (name) =>
                      `export const ${name} = (...args) => window.serverAction("${name}", ...args);`,
                  )
                  .join("\n"),
                loader: "js",
              };
            },
          );
          builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "router",
            namespace: "fixture",
          }));
          builder.onResolve(
            { filter: /^@\/components\/settings\/blocks\/profile-hero-card$/ },
            () => ({ path: "hero", namespace: "fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents:
              path === "hero"
                ? "export const ProfileHeroCard = () => null;"
                : "const router={push(){},replace(){}}; export const useRouter=()=>router; export const usePathname=()=>null; export const useSearchParams=()=>new URLSearchParams();",
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' })
        : route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"error":"fixture: unrelated read unavailable"}',
          }),
    );
    await page.goto("https://settings.invalid");
    await page.addScriptTag({ content: bundle.outputFiles[0].text, type: "module" });
    const recoveryAction = (index) => page.getByTestId(`setting-actions-s2-${index}`);
    await expect(recoveryAction(0)).toBeDisabled();
    await page.getByRole("button", { name: "Kur", exact: true }).click();
    await expect(page.getByTestId("settings-two-factor-manual-key")).toHaveText(
      "ABCD EFGH IJKL MNOP",
    );
    await page.getByTestId("settings-two-factor-setup-code").fill("123456");
    await page.getByTestId("settings-two-factor-confirm").click();
    await expect(page.getByTestId("settings-recovery-codes")).toHaveText("AAAA-1111BBBB-2222");
    await expect(page.getByText("Aktif", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kur", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "2FA'yı kapat", exact: true })).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await recoveryAction(1).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), "whispr-recovery-codes.txt");
    assert.equal(await readFile(await download.path(), "utf8"), "AAAA-1111\nBBBB-2222\n");
    await page.getByTestId("settings-recovery-close").click();
    await recoveryAction(0).click();
    await expect(page.getByTestId("settings-recovery-codes")).toBeVisible();
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(
          window.queryClient
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data),
        ).includes("AAAA-1111"),
      ),
      false,
    );

    // Closing/reopening settings keeps the enabled flag but discards plaintext.
    await page.evaluate(() => window.mount());
    await expect(page.getByText("Aktif", { exact: true })).toBeVisible();
    await recoveryAction(0).click();
    await expect(page.getByTestId("settings-recovery-note")).toContainText("tekrar görüntülenemez");
    await expect(page.getByTestId("settings-recovery-codes")).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.renewCalls), 0);
    await recoveryAction(1).click();
    assert.equal(await page.evaluate(() => window.renewCalls), 0);
    await recoveryAction(2).click();
    await expect(page.getByTestId("settings-recovery-confirm")).toBeDisabled();
    await page.getByTestId("settings-recovery-password").fill("fixture-password");
    await page.getByTestId("settings-recovery-code").fill("OLD-RECOVERY-CODE");
    await page.evaluate(() => {
      window.failRenew = true;
    });
    await page.getByTestId("settings-recovery-confirm").click();
    await expect(page.getByTestId("settings-recovery-error")).toBeVisible();
    await expect(page.getByTestId("settings-recovery-code")).toHaveValue("OLD-RECOVERY-CODE");
    await page.evaluate(() => {
      window.failRenew = false;
      window.delayRenew = true;
    });
    await page.getByTestId("settings-recovery-confirm").click();
    await expect(page.getByTestId("settings-recovery-confirm")).toBeDisabled();
    await page.evaluate(() => window.finishRenew());
    await expect(page.getByTestId("settings-recovery-codes")).toHaveText("CCCC-3333DDDD-4444");
    assert.deepEqual(await page.evaluate(() => window.lastRenewInput), {
      password: "fixture-password",
      code: "OLD-RECOVERY-CODE",
    });
    assert.equal(await page.evaluate(() => window.renewCalls), 2);
    await page.getByRole("button", { name: "2FA'yı kapat", exact: true }).click();
    await page.getByTestId("settings-two-factor-password").fill("fixture-password");
    await page.getByTestId("settings-two-factor-code").fill("123456");
    await page.getByTestId("settings-two-factor-disable").click();
    await expect(page.getByRole("button", { name: "Kur", exact: true })).toBeVisible();
    await expect(page.getByText("Aktif", { exact: true })).toHaveCount(0);
    await expect(recoveryAction(0)).toBeDisabled();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
