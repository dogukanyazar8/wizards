import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

test("voice recording and preview keep one send action and stable composer height", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { ChatComposer } from "@/components/chat/message-input";
        import { LocaleProvider } from "@/components/providers/locale-provider";
        import { getMessagesForLocale } from "@/lib/locale";
        window.sentMessages = 0;
        createRoot(document.getElementById("root")).render(
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <ChatComposer conversationId="fixture" mode="dm" replyTo={null}
              conversationName="Fixture" uploadthingEnabled={true}
              onSend={() => window.sentMessages++} onCancelReply={() => {}} />
          </LocaleProvider>
        );
      `,
    },
    plugins: [
      {
        name: "composer-io-boundaries",
        setup(builder) {
          const modules = {
            "@/hooks/use-typing":
              "const typing = {startTyping(){},stopTyping(){}}; export const useTyping = () => typing;",
            "@/lib/uploadthing":
              "export const useUploadThing = () => ({startUpload:async () => {throw new Error('Upload is outside this UI test');}});",
          };
          builder.onResolve(
            { filter: /^@\/(?:hooks\/use-typing|lib\/uploadthing)$/ },
            ({ path }) => ({ path, namespace: "fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
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
  // Exercise real Chromium MediaRecorder/AudioContext with a synthetic microphone.
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1455, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://composer.invalid/**", (route) =>
      route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    await page.goto("https://composer.invalid/");
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const row = page.getByTestId("message-composer-input-row");
    const input = page.getByTestId("message-input");
    const send = page.getByTestId("message-send-button");
    await input.fill("Keep this draft");
    await expect(send).toBeEnabled();
    const idleHeight = (await row.boundingBox()).height;
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByTestId("voice-recorder-start").click();
      await expect(page.getByTestId("voice-recorder-active")).toBeVisible();
      await expect(send).toHaveCount(0);
      await input.press("Enter");
      assert.equal(await page.evaluate(() => window.sentMessages), 0);
      await expect(input).toHaveValue("Keep this draft");
      await expect.poll(async () => (await row.boundingBox()).height).toBe(idleHeight);
      await expect(page.getByTestId("voice-recorder-active")).toContainText("0:01");
      await page.getByTestId("voice-recorder-stop").click();
      await expect(page.getByTestId("voice-recorder-preview")).toBeVisible();
      await expect(page.getByTestId("voice-recorder-send")).toBeVisible();
      await expect(send).toHaveCount(0);
      await expect.poll(async () => (await row.boundingBox()).height).toBe(idleHeight);
      const audio = page.locator("audio");
      await expect.poll(() => audio.evaluate((el) => el.readyState)).toBeGreaterThanOrEqual(1);
      assert.equal(await audio.evaluate((el) => el.error), null);
      await audio.evaluate((el) => el.play());
      await page.getByTestId("voice-recorder-cancel").click();
      await expect(send).toBeEnabled();
      await expect.poll(async () => (await row.boundingBox()).height).toBe(idleHeight);
    }
    await send.click();
    assert.equal(await page.evaluate(() => window.sentMessages), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
