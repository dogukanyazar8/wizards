import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

test("invite QR survives tab switches, cached reopening, and opening on friends", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [
      {
        name: "isolated-invite-api",
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/(workspace|friends)\/client$/ }, ({ path }) => ({
            path,
            namespace: "invite-test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "invite-test" }, ({ path }) => ({
            loader: "js",
            contents: path.includes("workspace")
              ? `
            export const workspaceQueryKeys = {server: id => ["workspace", "server", id]};
            export async function createServerInvite() {
              window.inviteRequests = (window.inviteRequests ?? 0) + 1;
              return {code: "qr-regression"};
            }
          `
              : `
            export const friendsQueryKeys = {list: ["friends"]};
            export async function fetchFriends() {return [];}
          `,
          }));
        },
      },
    ],
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
        import React from "react";
        import {createRoot} from "react-dom/client";
        import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
        import {ThemeProvider} from "next-themes";
        import {LocaleProvider} from "@/components/providers/locale-provider";
        import {getMessagesForLocale} from "@/lib/locale";
        import {ChannelInviteModal} from "@/components/servers/modals/channel-invite-modal";
        const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
        const root = createRoot(document.getElementById("root"));
        const detail = {server: {id: "test-server", name: "Test"}, categories: [], ungroupedChannels: []};
        window.mountInvite = (key, initialTab = "link") => root.render(
          <QueryClientProvider client={client}>
            <ThemeProvider forcedTheme="light">
              <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
                <ChannelInviteModal key={key} detail={detail} initialTab={initialTab} open onClose={() => {}} />
              </LocaleProvider>
            </ThemeProvider>
          </QueryClientProvider>
        );
      `,
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://invite.invalid/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<style>:root{--foreground:220 15% 15%;--surface-card:0 0% 100%}</style><div id="root"></div>',
      }),
    );
    await page.goto("https://invite.invalid/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const qr = page.getByTestId("server-invite-qr");
    const assertQrDrawn = async () => {
      await expect(qr).toBeVisible();
      await expect
        .poll(() =>
          qr.evaluate((canvas) => {
            const data = canvas
              .getContext("2d")
              .getImageData(0, 0, canvas.width, canvas.height).data;
            let dark = 0;
            let light = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i + 3] === 255) {
                if (data[i] < 100) dark++;
                if (data[i] > 200) light++;
              }
            }
            return dark > 0 && light > 0;
          }),
        )
        .toBe(true);
    };
    await page.evaluate(() => window.mountInvite("first"));
    await assertQrDrawn();
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("server-invite-tab-friends").click();
      await expect(qr).toHaveCount(0);
      await page.getByTestId("server-invite-tab-link").click();
      await assertQrDrawn();
    }
    await page.evaluate(() => window.mountInvite("cached"));
    await assertQrDrawn();
    await page.evaluate(() => window.mountInvite("friends-first", "friends"));
    await expect(qr).toHaveCount(0);
    await page.getByTestId("server-invite-tab-link").click();
    await assertQrDrawn();
    assert.equal(await page.evaluate(() => window.inviteRequests), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
