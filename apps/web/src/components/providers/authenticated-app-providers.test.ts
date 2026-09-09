import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PROVIDERS_SOURCE = readFileSync(
  fileURLToPath(new URL("./authenticated-app-providers.tsx", import.meta.url)),
  "utf8",
);
const DESKTOP_EXPERIENCE_SOURCE = readFileSync(
  fileURLToPath(new URL("../desktop/desktop-experience.tsx", import.meta.url)),
  "utf8",
);
const SETTINGS_LAYOUT_SOURCE = readFileSync(
  fileURLToPath(new URL("../../app/settings/layout.tsx", import.meta.url)),
  "utf8",
);

describe("AuthenticatedAppProviders desktop navigation wiring", () => {
  it("mounts the SPA navigation bridge independently from optional voice providers", () => {
    const commonContent = PROVIDERS_SOURCE.indexOf("const content = (");
    const navigationBridge = PROVIDERS_SOURCE.indexOf("<DesktopNavigationBridge />");
    const voiceBranch = PROVIDERS_SOURCE.indexOf("shouldEnableVoiceFeatures ?");

    assert.ok(commonContent > -1, "common authenticated content should exist");
    assert.ok(
      navigationBridge > commonContent && navigationBridge < voiceBranch,
      "desktop navigation must not depend on voice features",
    );
    assert.doesNotMatch(
      DESKTOP_EXPERIENCE_SOURCE,
      /case "navigate":/u,
      "the voice-bound experience must not register a second navigate handler",
    );
  });

  it("keeps desktop command handling mounted on the settings route without an active call", () => {
    assert.doesNotMatch(
      SETTINGS_LAYOUT_SOURCE,
      /voiceFeatures="active"/u,
      "settings must not unmount DesktopExperience while native shortcuts remain registered",
    );
  });
});
