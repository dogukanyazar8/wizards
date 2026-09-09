import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHANNEL_SLOW_MODE_DELAYS } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { ChannelAdvancedSettingsFields } from "./channel-advanced-settings";
import { type ChannelAdvancedSettings, createChannelAdvancedSettings } from "./channel-form-model";

/**
 * Ş8: kontrol `<details>` + dört `<select>` iken SPEC §6.2'nin dört kartına taşındı.
 * Testin sorduğu şey değişmedi — hangi alanlar hangi kanal türünde çizilir ve RTC bölgesi
 * beyaz listeyi aşabiliyor mu — ama artık `role="radio"` çipleri üzerinden sorulur.
 */
function render(
  channelType: "TEXT" | "VOICE",
  availableRtcRegions: readonly string[] = [],
  value: ChannelAdvancedSettings = createChannelAdvancedSettings(),
) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="en" initialMessages={EN_MESSAGES}>
      <ChannelAdvancedSettingsFields
        availableRtcRegions={availableRtcRegions}
        channelType={channelType}
        onChange={() => undefined}
        value={value}
      />
    </LocaleProvider>,
  );
}

describe("channel advanced settings", () => {
  it("renders the text slow-mode card without voice-only fields", () => {
    const html = render("TEXT");

    assert.match(html, /data-testid="channel-advanced-settings"/u);
    assert.match(html, /data-testid="channel-slow-mode"/u);
    assert.match(html, />Slow mode</u);
    assert.doesNotMatch(html, />Audio bitrate</u);
    assert.doesNotMatch(html, />RTC region</u);
  });

  it("draws every slow-mode step from the contract, not from a local list", () => {
    const html = render("TEXT");

    assert.equal(html.match(/role="radio"/gu)?.length, CHANNEL_SLOW_MODE_DELAYS.length);
    assert.match(html, />Off</u);
    assert.match(html, />30s</u);
    assert.match(html, />60m</u);
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

  it("keeps an out-of-list region visible and flags it instead of dropping it", () => {
    // Eskiden `<select>` bunu ekstra bir `<option>` ile çiziyordu; kayıtlı ama artık
    // yayımlanmayan bir bölge sessizce kaybolursa kullanıcı neyi kaydettiğini göremez.
    const html = render("VOICE", ["EU_WEST"], {
      ...createChannelAdvancedSettings(),
      rtcRegion: "US_EAST",
    });

    assert.match(html, />US_EAST</u);
    assert.match(html, /data-testid="channel-rtc-region-error"/u);
  });

  it("says why the region list is empty when the deployment publishes none", () => {
    const html = render("VOICE");

    assert.match(html, /publishes no regions/u);
    assert.doesNotMatch(html, /data-testid="channel-rtc-region-error"/u);
  });
});
