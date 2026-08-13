import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { ChannelAdvancedSettingsFields } from "./channel-advanced-settings";
import { createChannelAdvancedSettings } from "./channel-form-model";

function render(channelType: "TEXT" | "VOICE", availableRtcRegions: readonly string[] = []) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="en" initialMessages={EN_MESSAGES}>
      <ChannelAdvancedSettingsFields
        availableRtcRegions={availableRtcRegions}
        channelType={channelType}
        onChange={() => undefined}
        value={createChannelAdvancedSettings()}
      />
    </LocaleProvider>,
  );
}

describe("channel advanced settings", () => {
  it("renders a collapsed text slow-mode control without voice-only fields", () => {
    const html = render("TEXT");

    assert.match(html, /<details[^>]+data-testid="channel-advanced-settings"/u);
    assert.match(html, />Slow mode</u);
    assert.doesNotMatch(html, />Audio bitrate</u);
    assert.doesNotMatch(html, />RTC region</u);
  });

  it("renders voice media controls and only allowlisted RTC keys", () => {
    const html = render("VOICE", ["EU_WEST"]);

    assert.match(html, />Audio bitrate</u);
    assert.match(html, />User limit</u);
    assert.match(html, />RTC region</u);
    assert.match(html, />EU_WEST</u);
    assert.match(html, />Video quality</u);
    assert.doesNotMatch(html, />Slow mode</u);
  });
});
