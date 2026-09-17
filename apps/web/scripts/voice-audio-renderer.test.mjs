import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/compiled/babel/core");
const compiler = require("babel-plugin-react-compiler").default;

for (const compiled of [false, true]) {
  test(`remote microphone lifecycle with React Compiler ${compiled ? "enabled" : "disabled"}`, async () => {
    const bundle = await build({
      absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
      entryPoints: ["scripts/fixtures/voice-audio-renderer.mjs"],
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: compiled
        ? [
            {
              name: "production-react-compiler",
              setup(builder) {
                builder.onLoad({ filter: /voice-audio-renderer\.tsx$/ }, async ({ path }) => {
                  const result = transformSync(await readFile(path, "utf8"), {
                    filename: path,
                    configFile: false,
                    babelrc: false,
                    parserOpts: { plugins: ["typescript", "jsx"] },
                    plugins: [[compiler, { target: "19", panicThreshold: "all_errors" }]],
                  });
                  return { contents: result.code, loader: "tsx" };
                });
              },
            },
          ]
        : [],
    });
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent('<div id="root"></div>');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const baseline = await page.evaluate(() => window.voiceAudioTest.state().listeners);
      await page.evaluate(() => window.voiceAudioTest.mount());
      await page.evaluate(() => window.voiceAudioTest.join());
      assert.equal(await page.locator("audio").count(), 0);

      // The first render has no tracks. A later subscription must mount an audio
      // element without a new room object, output device, or callback prop.
      await page.evaluate(() => window.voiceAudioTest.publish("TR_first"));
      await page.waitForFunction(() => document.querySelectorAll("audio").length === 1);
      await page.waitForFunction(() => {
        const audio = document.querySelector("audio");
        return (
          audio.srcObject?.getAudioTracks().length === 1 && !audio.paused && audio.currentTime > 0
        );
      });
      await page.evaluate(() => window.voiceAudioTest.publishExcluded());
      assert.equal(
        await page.locator("audio").count(),
        1,
        "no local mic feedback or duplicate screen audio",
      );

      await page.evaluate(() => window.voiceAudioTest.unpublish("TR_first"));
      await page.waitForFunction(() => document.querySelectorAll("audio").length === 0);
      assert.equal(
        (await page.evaluate(() => window.voiceAudioTest.state())).attachments[0].count,
        0,
      );
      await page.evaluate(() => window.voiceAudioTest.publish("TR_second"));
      await page.waitForFunction(() => document.querySelectorAll("audio").length === 1);
      await page.evaluate(() => window.voiceAudioTest.leave());
      await page.waitForFunction(() => document.querySelectorAll("audio").length === 0);
      await page.evaluate(() => window.voiceAudioTest.unmount());
      const final = await page.evaluate(() => window.voiceAudioTest.state());
      assert.equal(final.listeners, baseline, "room listeners cleaned up");
      assert.ok(
        final.attachments.every(({ count }) => count === 0),
        "all tracks detached",
      );
      assert.equal(final.outputErrors, 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
