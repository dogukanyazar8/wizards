import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHANNEL_NOTIFICATION_OPTIONS,
  defaultMuteMobileForLevel,
  hasChannelNotificationChange,
  selectChannelNotificationLevel,
  stepChannelNotificationLevel,
  toChannelNotificationDraft,
  toChannelNotificationPayload,
  toggleChannelNotificationMobileMute,
} from "@/lib/servers/channel-notifications";

/** Ş9 — kanal bildirimleri penceresi (SPEC-SUNUCU §6.4). */
describe("channel notification options", () => {
  it("üç seçenek SPEC sırasında ve SPEC tonlarında", () => {
    assert.deepEqual(
      CHANNEL_NOTIFICATION_OPTIONS.map((option) => [option.id, option.tone]),
      [
        ["all", "primary"],
        ["mentions", "warning"],
        ["muted", "danger"],
      ],
    );
  });

  it("`Sessiz` seçiliyken mobil anahtarı açık gelir", () => {
    assert.equal(defaultMuteMobileForLevel("muted"), true);
    assert.equal(defaultMuteMobileForLevel("all"), false);
    assert.equal(defaultMuteMobileForLevel("mentions"), false);
  });

  it("seviye değişince anahtar o seviyenin varsayılanına döner", () => {
    const fromAll = selectChannelNotificationLevel({ level: "all", muteMobile: false }, "muted");

    assert.deepEqual(fromAll, { level: "muted", muteMobile: true });

    const backToAll = selectChannelNotificationLevel(fromAll, "all");

    assert.deepEqual(backToAll, { level: "all", muteMobile: false });
  });

  it("aynı seviyeye tekrar basmak kullanıcının anahtar tercihini ezmez", () => {
    const draft = toggleChannelNotificationMobileMute({ level: "muted", muteMobile: true });

    assert.deepEqual(draft, { level: "muted", muteMobile: false });
    assert.deepEqual(selectChannelNotificationLevel(draft, "muted"), draft);
  });

  it("adapter kolonun tersini çevirir: `mobilePush` açık = anahtar kapalı", () => {
    assert.deepEqual(toChannelNotificationDraft({ level: "mentions", mobilePush: true }), {
      level: "mentions",
      muteMobile: false,
    });
    assert.deepEqual(toChannelNotificationPayload({ level: "muted", muteMobile: true }), {
      level: "muted",
      mobilePush: false,
    });
  });

  it("değişiklik yoksa kaydetmeye gerek yoktur", () => {
    const initial = { level: "all", muteMobile: false } as const;

    assert.equal(hasChannelNotificationChange(initial, { ...initial }), false);
    assert.equal(hasChannelNotificationChange(initial, { level: "all", muteMobile: true }), true);
    assert.equal(
      hasChannelNotificationChange(initial, { level: "mentions", muteMobile: false }),
      true,
    );
  });

  it("ok tuşu gezinmesi listenin iki ucunda da sarmalar", () => {
    assert.equal(stepChannelNotificationLevel("all", 1), "mentions");
    assert.equal(stepChannelNotificationLevel("mentions", 1), "muted");
    assert.equal(stepChannelNotificationLevel("muted", 1), "all");
    assert.equal(stepChannelNotificationLevel("all", -1), "muted");
  });
});
