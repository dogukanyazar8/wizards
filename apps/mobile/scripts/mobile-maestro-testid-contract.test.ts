import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  MOBILE_AUTOMATED_GATES,
  MOBILE_MANUAL_QA_CHECKS,
} from "../src/quality/mobile-quality-gate";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const flowSource = readFileSync(
  path.join(repositoryRoot, ".maestro", "phase0-navigation.yml"),
  "utf8",
);
const darkModeFlowPath = path.join(repositoryRoot, ".maestro", "phase1-dark-mode.yml");
const darkModeFlowSource = existsSync(darkModeFlowPath)
  ? readFileSync(darkModeFlowPath, "utf8")
  : "";

const testIdSources: Record<string, { file: string; needle: string }> = {
  "mobile-bottom-tab-messages": {
    file: "src/navigation/mobile-bottom-tab-bar.tsx",
    needle: "mobile-bottom-tab-${tabId}",
  },
  "mobile-bottom-tab-overview": {
    file: "src/navigation/mobile-bottom-tab-bar.tsx",
    needle: "mobile-bottom-tab-${tabId}",
  },
  "mobile-channel-chat-screen": {
    file: "src/app/screens/channel-screen.tsx",
    needle: 'testID="mobile-channel-chat-screen"',
  },
  "mobile-dm-chat-screen": {
    file: "src/app/screens/dm-screen.tsx",
    needle: 'testID="mobile-dm-chat-screen"',
  },
  "mobile-dm-conversation-row": {
    file: "src/app/screens/dm-screen.tsx",
    needle: 'testID="mobile-dm-conversation-row"',
  },
  "mobile-dm-inbox-screen": {
    file: "src/app/screens/dm-screen.tsx",
    needle: 'testID="mobile-dm-inbox-screen"',
  },
  "mobile-settings-screen": {
    file: "src/app/screens/settings-screen.tsx",
    needle: 'testID="mobile-settings-screen"',
  },
  "mobile-workspace-channel-text": {
    file: "src/app/screens/home-screen.tsx",
    needle: "mobile-workspace-channel-${channel.type.toLowerCase()}",
  },
};

describe("Phase 0 Maestro testID contract", () => {
  it("binds every navigation-flow testID to a production source", () => {
    const flowIds = [...flowSource.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]);
    const uniqueFlowIds = [...new Set(flowIds)].sort();

    assert.deepEqual(uniqueFlowIds, Object.keys(testIdSources).sort());
    for (const testId of uniqueFlowIds) {
      const sourceContract = testIdSources[testId];
      assert.ok(sourceContract, `No production source contract exists for ${testId}`);
      const source = readFileSync(path.join(process.cwd(), sourceContract.file), "utf8");
      assert.ok(
        source.includes(sourceContract.needle),
        `${testId} is missing from ${sourceContract.file}`,
      );
    }
  });

  it("keeps Android back and deep-link device verification in the quality gate", () => {
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-navigation"));

    const manualIds = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.id));
    assert.ok(manualIds.has("android-hardware-back-navigation"));
    assert.ok(manualIds.has("android-navigation-deep-links"));
  });

  it("binds the Phase 1 appearance control and dark-mode Maestro flow", () => {
    const settingsSource = readFileSync(
      path.join(process.cwd(), "src/app/screens/settings-screen.tsx"),
      "utf8",
    );
    const destinationContracts = {
      "mobile-dm-inbox-screen": "src/app/screens/dm-screen.tsx",
      "mobile-notifications-screen": "src/app/screens/notifications-screen.tsx",
      "mobile-overview-screen": "src/app/screens/home-screen.tsx",
      "mobile-settings-screen": "src/app/screens/settings-screen.tsx",
      "mobile-voice-screen": "src/app/screens/voice-screen.tsx",
    } as const;

    assert.match(settingsSource, /testID="mobile-settings-appearance-control"/);
    assert.ok(darkModeFlowSource, ".maestro/phase1-dark-mode.yml must exist");
    assert.match(darkModeFlowSource, /id:\s*"mobile-settings-appearance-control"/);
    assert.match(darkModeFlowSource, /text:\s*"Koyu\|Dark"/);
    assert.match(darkModeFlowSource, /checked:\s*true/);
    for (const tabId of ["overview", "messages", "notifications", "voice", "settings"]) {
      assert.match(darkModeFlowSource, new RegExp(`id:\\s*"mobile-bottom-tab-${tabId}"`));
    }
    for (const [testId, sourcePath] of Object.entries(destinationContracts)) {
      assert.match(darkModeFlowSource, new RegExp(`id:\\s*"${testId}"`));
      assert.match(readFileSync(path.join(process.cwd(), sourcePath), "utf8"), new RegExp(testId));
    }
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-dark-mode"));
  });
});
