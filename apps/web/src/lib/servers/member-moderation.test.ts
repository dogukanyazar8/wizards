import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SERVER_BAN_DELETE_WINDOWS,
  SERVER_MEMBER_FILTERS,
  SERVER_MODERATION_REASON_MAX_LENGTH,
  SERVER_TIMEOUT_DURATIONS,
  formatTimeoutRemaining,
  isMemberTimedOut,
  listMemberModerationActions,
  resolveTimeoutUntil,
  selectBanDeleteWindow,
  selectMemberTypeBadge,
  selectPrimaryRoleName,
  selectTimeoutDuration,
} from "./member-moderation";

/** Ş13 — §8.6 + K3'ün saf kararları. */

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

describe("üye süzgeçleri ve süre listeleri", () => {
  it("yedi çipi referanstaki sırayla taşır", () => {
    assert.deepEqual(SERVER_MEMBER_FILTERS, [
      "all",
      "member",
      "moderator",
      "admin",
      "owner",
      "online",
      "offline",
    ]);
  });

  it("K3'ün altı zaman aşımı süresini saniye olarak verir", () => {
    assert.deepEqual(
      SERVER_TIMEOUT_DURATIONS.map((option) => [option.id, option.seconds]),
      [
        ["60s", 60],
        ["5m", 300],
        ["10m", 600],
        ["1h", 3_600],
        ["1d", 86_400],
        ["1w", 604_800],
      ],
    );
  });

  it("mesaj silme penceresi `ServerBanSchema`'nın yedi günlük tavanını aşmaz", () => {
    for (const option of SERVER_BAN_DELETE_WINDOWS) {
      assert.ok(option.seconds >= 0 && option.seconds <= 604_800, option.id);
    }

    assert.equal(selectBanDeleteWindow("none").seconds, 0);
    assert.equal(selectBanDeleteWindow("7d").seconds, 604_800);
  });

  it("bilinmeyen kimlik ilk seçeneğe düşer, `undefined` dönmez", () => {
    assert.equal(selectTimeoutDuration("60s").seconds, 60);
    assert.equal(selectBanDeleteWindow("nope" as never).id, SERVER_BAN_DELETE_WINDOWS[0]!.id);
  });

  it("sebep sınırı sözleşmeyle aynı (200)", () => {
    assert.equal(SERVER_MODERATION_REASON_MAX_LENGTH, 200);
  });
});

describe("zaman aşımı bir zaman damgasıdır", () => {
  it("`null` zaman aşımı değildir", () => {
    assert.equal(isMemberTimedOut(null, NOW), false);
    assert.equal(isMemberTimedOut(undefined, NOW), false);
  });

  it("süresi geçmiş kolon zaman aşımı **değildir**", () => {
    assert.equal(isMemberTimedOut("2026-08-25T11:59:59.000Z", NOW), false);
  });

  it("sınır katı: `until === now` zaman aşımı değil", () => {
    assert.equal(isMemberTimedOut("2026-08-25T12:00:00.000Z", NOW), false);
    assert.equal(isMemberTimedOut("2026-08-25T12:00:01.000Z", NOW), true);
  });

  it("bozuk tarih zaman aşımı üretmez", () => {
    assert.equal(isMemberTimedOut("değil", NOW), false);
  });

  it("seçilen süreden ucun beklediği ISO damgasını kurar", () => {
    assert.equal(resolveTimeoutUntil(NOW, 3_600), "2026-08-25T13:00:00.000Z");
  });
});

describe("kalan süre yukarı yuvarlanır", () => {
  it("gün · saat · dakika · saniye eşiklerini seçer", () => {
    assert.deepEqual(formatTimeoutRemaining("2026-08-27T12:00:00.000Z", NOW), {
      unit: "day",
      value: 2,
    });
    assert.deepEqual(formatTimeoutRemaining("2026-08-25T14:00:00.000Z", NOW), {
      unit: "hour",
      value: 2,
    });
    assert.deepEqual(formatTimeoutRemaining("2026-08-25T12:05:00.000Z", NOW), {
      unit: "minute",
      value: 5,
    });
    assert.deepEqual(formatTimeoutRemaining("2026-08-25T12:00:30.000Z", NOW), {
      unit: "second",
      value: 30,
    });
  });

  it("61 saniye `1 dakika` yazar — aşağı yuvarlansa çip bitmeden söner", () => {
    assert.deepEqual(formatTimeoutRemaining("2026-08-25T12:01:01.000Z", NOW), {
      unit: "minute",
      value: 2,
    });
  });

  it("zaman aşımı yoksa `null`", () => {
    assert.equal(formatTimeoutRemaining(null, NOW), null);
    assert.equal(formatTimeoutRemaining("2026-08-25T11:00:00.000Z", NOW), null);
  });
});

describe("moderasyon menüsünün üç kapısı", () => {
  const viewer = { canBan: true, canKick: true, canTimeout: true, userId: "u-mod" };

  it("sahibe hiçbir eylem uygulanamaz", () => {
    assert.deepEqual(
      listMemberModerationActions(
        viewer,
        { accessLevel: "OWNER", communicationDisabledUntil: null, userId: "u-owner" },
        NOW,
      ),
      [],
    );
  });

  it("aktör kendini hedefleyemez", () => {
    assert.deepEqual(
      listMemberModerationActions(
        viewer,
        { accessLevel: "ADMIN", communicationDisabledUntil: null, userId: "u-mod" },
        NOW,
      ),
      [],
    );
  });

  it("biti olmayan izleyici o satırı hiç görmez", () => {
    assert.deepEqual(
      listMemberModerationActions(
        { canBan: false, canKick: false, canTimeout: false, userId: "u-mod" },
        { accessLevel: "MEMBER", communicationDisabledUntil: null, userId: "u-1" },
        NOW,
      ),
      [],
    );
    assert.deepEqual(
      listMemberModerationActions(
        { canBan: true, canKick: false, canTimeout: false, userId: "u-mod" },
        { accessLevel: "MEMBER", communicationDisabledUntil: null, userId: "u-1" },
        NOW,
      ),
      ["ban"],
    );
  });

  it("zaman aşımındaki üyede `ver` değil `kaldır` görünür", () => {
    assert.deepEqual(
      listMemberModerationActions(
        viewer,
        {
          accessLevel: "MEMBER",
          communicationDisabledUntil: "2026-08-25T13:00:00.000Z",
          userId: "u-1",
        },
        NOW,
      ),
      ["removeTimeout", "kick", "ban"],
    );
  });

  it("süresi geçmiş kolon `kaldır` üretmez — kaldıracak bir şey yok", () => {
    assert.deepEqual(
      listMemberModerationActions(
        viewer,
        {
          accessLevel: "MEMBER",
          communicationDisabledUntil: "2026-08-25T11:00:00.000Z",
          userId: "u-1",
        },
        NOW,
      ),
      ["timeout", "kick", "ban"],
    );
  });
});

describe("satırın rozeti ve rol adı", () => {
  it("erişim seviyesinden tür rozetini seçer", () => {
    assert.equal(selectMemberTypeBadge("OWNER"), "owner");
    assert.equal(selectMemberTypeBadge("ADMIN"), "admin");
    assert.equal(selectMemberTypeBadge("MEMBER"), "member");
  });

  it("rol düğmesi en yüksek konumlu rolü yazar", () => {
    const roles = [
      { id: "r-1", isDefault: false, name: "Üye", position: 1 },
      { id: "r-2", isDefault: false, name: "Moderatör", position: 5 },
    ];

    assert.equal(selectPrimaryRoleName(["r-1", "r-2"], roles), "Moderatör");
  });

  it("`@everyone` satırda yazılmaz — herkesin taşıdığı rol bilgi taşımaz", () => {
    const roles = [{ id: "r-0", isDefault: true, name: "@everyone", position: 0 }];

    assert.equal(selectPrimaryRoleName(["r-0"], roles), null);
  });
});
