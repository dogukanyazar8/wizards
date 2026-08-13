import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getAccountSettingsSurface } from "./account-settings-surface";

describe("web account settings surface", () => {
  it("shows the Phase 5 server-backed account controls", () => {
    assert.deepEqual(getAccountSettingsSurface(), {
      preferences: ["language", "timeZone", "dateFormat", "timeFormat", "interfaceDensity"],
      privacy: ["profileVisibility", "presenceVisibility", "dmPolicy", "friendRequestPolicy"],
      security: ["email", "twoFactor", "recoveryCodes", "sessions"],
      data: ["export", "delete"],
    });
  });

  it("renders Phase 5 account controls", () => {
    const source = readFileSync(new URL("./settings-panel.tsx", import.meta.url), "utf8");

    assert.match(source, /settings\.account\.privacy\.dmPolicy\.title/);
    assert.match(source, /settings\.account\.privacy\.friendRequests\.title/);
    assert.match(source, /settings\.account\.privacy\.profile\.title/);
    assert.match(source, /settings\.account\.privacy\.online\.title/);
    assert.match(source, /settings\.account\.preferences\.language\.title/);
    assert.match(source, /settings\.account\.preferences\.timeZone\.title/);
    assert.match(source, /settings\.account\.preferences\.dateFormat\.title/);
    assert.match(source, /settings\.account\.preferences\.timeFormat\.title/);
    assert.match(source, /settings\.account\.preferences\.accessibility\.title/);
    assert.match(source, /role="combobox"/);
    assert.match(source, /ACCOUNT_FORMAT_PREVIEW_INSTANT/);
    assert.match(source, /<ActiveSessionsCard/);
    assert.match(source, /<AccountDataControls/);
  });
});
