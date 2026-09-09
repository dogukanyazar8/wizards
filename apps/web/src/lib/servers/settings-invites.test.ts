import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INVITE_UNLIMITED_SYMBOL,
  SERVER_SETTINGS_INVITE_DEFAULT_USE_LIMIT_ID,
  buildServerInviteSummaryParts,
  buildServerSettingsInvitePayload,
  formatInviteRemaining,
  formatInviteUses,
  initialServerSettingsInviteState,
  resolveInviteChannelName,
  toServerInviteChannelOptions,
} from "./settings-invites";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

const DETAIL = {
  categories: [
    {
      channels: [
        { id: "c-welcome", name: "welcome-chat", type: "TEXT" as const },
        { id: "c-voice", name: "ses", type: "VOICE" as const },
      ],
      position: 0,
    },
    {
      channels: [{ id: "c-dev", name: "development", type: "TEXT" as const }],
      position: 1,
    },
  ],
  ungroupedChannels: [{ id: "c-loose", name: "harman", type: "TEXT" as const }],
};

describe("hedef kanal çipleri", () => {
  it("yalnız yazı kanallarını verir — ses kanalını uç 400 ile reddediyor", () => {
    assert.deepEqual(
      toServerInviteChannelOptions(DETAIL).map((channel) => channel.id),
      ["c-welcome", "c-dev", "c-loose"],
    );
  });

  it("kategori sırasını korur, kategorisiz kanalları sona ekler", () => {
    const reordered = toServerInviteChannelOptions({
      ...DETAIL,
      categories: [...DETAIL.categories].reverse(),
    });

    assert.deepEqual(
      reordered.map((channel) => channel.name),
      ["welcome-chat", "development", "harman"],
    );
  });

  it("kanal adı `channelId`'den çözülür; bilinmeyen kanal `null`", () => {
    const channels = toServerInviteChannelOptions(DETAIL);

    assert.equal(resolveInviteChannelName("c-dev", channels), "development");
    assert.equal(resolveInviteChannelName("c-silinmis", channels), null);
    assert.equal(resolveInviteChannelName(null, channels), null);
  });
});

describe("bölümün varsayılanları pencereninkinden farklı", () => {
  it("ilk yazı kanalı · 7 gün · 25 kullanım", () => {
    const state = initialServerSettingsInviteState(toServerInviteChannelOptions(DETAIL));

    assert.deepEqual(state, {
      channelId: "c-welcome",
      durationId: "7d",
      useLimitId: "25",
    });
    assert.equal(SERVER_SETTINGS_INVITE_DEFAULT_USE_LIMIT_ID, "25");
  });

  it("yazı kanalı yoksa hedef `null` kalır ve gövdeye hiç konmaz", () => {
    const state = initialServerSettingsInviteState([]);

    assert.equal(state.channelId, null);
    assert.equal("channelId" in buildServerSettingsInvitePayload(state), false);
  });
});

describe("özet ve gövde", () => {
  it("özet parçaları kanal adını ve iki çip kimliğini taşır", () => {
    const channels = toServerInviteChannelOptions(DETAIL);

    assert.deepEqual(
      buildServerInviteSummaryParts(
        { channelId: "c-dev", durationId: "7d", useLimitId: "25" },
        channels,
      ),
      { channelName: "development", durationId: "7d", useLimitId: "25" },
    );
  });

  it("gövde `CreateServerInviteSchema`'nın beklediği iki alanı saat/adet olarak verir", () => {
    assert.deepEqual(
      buildServerSettingsInvitePayload({
        channelId: "c-dev",
        durationId: "30d",
        useLimitId: "1000",
      }),
      { channelId: "c-dev", expiresInHours: 720, maxUses: 1000 },
    );
  });

  it("`Süresiz` ve `Sınırsız` `null` gider", () => {
    assert.deepEqual(
      buildServerSettingsInvitePayload({
        channelId: null,
        durationId: "never",
        useLimitId: "unlimited",
      }),
      { expiresInHours: null, maxUses: null },
    );
  });
});

describe("kullanım çipi ve kalan süre", () => {
  it("sınırlı davet `3 / 25`, sınırsız davet `12 / ∞`", () => {
    assert.equal(formatInviteUses({ limit: 25, uses: 3 }), "3 / 25");
    assert.equal(formatInviteUses({ limit: null, uses: 12 }), `12 / ${INVITE_UNLIMITED_SYMBOL}`);
  });

  it("kalan süre aşağı yuvarlanır: 6 gün 20 saat `6 gün` yazar", () => {
    assert.deepEqual(formatInviteRemaining("2026-09-01T08:00:00.000Z", NOW), {
      kind: "in",
      unit: "day",
      value: 6,
    });
  });

  it("saat ve dakika eşikleri", () => {
    assert.deepEqual(formatInviteRemaining("2026-08-25T15:30:00.000Z", NOW), {
      kind: "in",
      unit: "hour",
      value: 3,
    });
    assert.deepEqual(formatInviteRemaining("2026-08-25T12:20:00.000Z", NOW), {
      kind: "in",
      unit: "minute",
      value: 20,
    });
  });

  it("bir dakikadan az kalan davet `0 dakika` yazmaz", () => {
    assert.deepEqual(formatInviteRemaining("2026-08-25T12:00:20.000Z", NOW), {
      kind: "in",
      unit: "minute",
      value: 1,
    });
  });

  it("`null` süresiz, geçmiş tarih süresi dolmuş", () => {
    assert.deepEqual(formatInviteRemaining(null, NOW), { kind: "never" });
    assert.deepEqual(formatInviteRemaining("2026-08-24T12:00:00.000Z", NOW), { kind: "expired" });
  });
});
