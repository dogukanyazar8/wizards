import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const providerPaths = [
  new URL("./live-voice-provider.tsx", import.meta.url),
  new URL("./e2e-voice-provider.tsx", import.meta.url),
];

describe("native desktop push-to-talk contract", () => {
  it("does not reject an authenticated native shortcut event through the retired web toggle", async () => {
    for (const providerPath of providerPaths) {
      const source = await readFile(providerPath, "utf8");
      const start = source.slice(
        source.indexOf("const startPushToTalk"),
        source.indexOf("const stopPushToTalk"),
      );
      const stop = source.slice(
        source.indexOf("const stopPushToTalk"),
        source.indexOf("const toggleDeafen"),
      );

      assert.ok(start.length > 0 && stop.length > 0, `PTT handlers missing in ${providerPath}`);
      assert.doesNotMatch(start, /desktopGlobalShortcutsEnabled|pushToTalkEnabled/);
      assert.doesNotMatch(stop, /desktopGlobalShortcutsEnabled/);
      assert.match(start, /voiceInputMode/);
    }
  });
});
