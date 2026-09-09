import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreateServerInviteSchema } from "@wizards/types";

import {
  SERVER_INVITE_DEFAULT_DURATION_ID,
  SERVER_INVITE_DEFAULT_USE_LIMIT_ID,
  SERVER_INVITE_DURATIONS,
  SERVER_INVITE_INITIAL_STATE,
  SERVER_INVITE_USE_LIMITS,
  buildServerInvitePayload,
  buildServerInviteUrl,
  filterInviteFriends,
  selectInviteDuration,
  selectInviteNoticeKey,
  selectInviteUseLimit,
  toServerInviteDisplayUrl,
  type InviteFriendCandidate,
} from "@/lib/servers/invite-form";

/** Ş9 — davet penceresi (SPEC-SUNUCU §6.3). */
describe("server invite form", () => {
  it("SPEC §6.3'ün altı süre çipini sırayla taşır", () => {
    assert.deepEqual(
      SERVER_INVITE_DURATIONS.map((option) => option.hours),
      [1, 12, 24, 168, 720, null],
    );
  });

  it("SPEC §6.3'ün altı kullanım çipini sırayla taşır", () => {
    assert.deepEqual(
      SERVER_INVITE_USE_LIMITS.map((option) => option.maxUses),
      [1, 5, 25, 100, 1000, null],
    );
  });

  it("her çip `CreateServerInviteSchema`'nın kabul aralığında kalır", () => {
    for (const duration of SERVER_INVITE_DURATIONS) {
      for (const useLimit of SERVER_INVITE_USE_LIMITS) {
        const parsed = CreateServerInviteSchema.safeParse({
          expiresInHours: duration.hours,
          maxUses: useLimit.maxUses,
        });

        assert.equal(parsed.success, true, `${duration.id} · ${useLimit.id}`);
      }
    }
  });

  it("pencere varsayılanı 7 gün · Sınırsız", () => {
    assert.equal(SERVER_INVITE_DEFAULT_DURATION_ID, "7d");
    assert.equal(SERVER_INVITE_DEFAULT_USE_LIMIT_ID, "unlimited");
    assert.equal(selectInviteDuration(SERVER_INVITE_INITIAL_STATE.durationId).hours, 168);
    assert.equal(selectInviteUseLimit(SERVER_INVITE_INITIAL_STATE.useLimitId).maxUses, null);
  });

  it("gövde yalnız verilen alanları taşır — `channelId` atlanırsa gönderilmez", () => {
    const payload = buildServerInvitePayload(SERVER_INVITE_INITIAL_STATE);

    assert.deepEqual(payload, { expiresInHours: 168, maxUses: null });
    assert.equal("channelId" in payload, false);
    assert.equal("targetUserId" in payload, false);
  });

  it("hedef ve kanal verildiğinde ikisi de gövdeye girer", () => {
    const payload = buildServerInvitePayload(
      { durationId: "1h", useLimitId: "25" },
      { channelId: "chan-1", targetUserId: "user-9" },
    );

    assert.deepEqual(payload, {
      channelId: "chan-1",
      expiresInHours: 1,
      maxUses: 25,
      targetUserId: "user-9",
    });
    assert.equal(CreateServerInviteSchema.safeParse(payload).success, true);
  });

  it("`channelId: null` bilinçli bir değerdir, atlanan alandan ayrılır", () => {
    const payload = buildServerInvitePayload(SERVER_INVITE_INITIAL_STATE, { channelId: null });

    assert.equal("channelId" in payload, true);
    assert.equal(payload.channelId, null);
  });

  it("bağlantı ürünün `/invite/[code]` rotasını kullanır ve kaynağın kuyruk eğik çizgisini yutar", () => {
    assert.equal(
      buildServerInviteUrl("https://whispr.app/", "mobile-test-9fd2"),
      "https://whispr.app/invite/mobile-test-9fd2",
    );
    assert.equal(
      toServerInviteDisplayUrl("https://whispr.app/invite/mobile-test-9fd2"),
      "whispr.app/invite/mobile-test-9fd2",
    );
  });

  it("bilgi kutusu süresiz davette sona erme cümlesi kurmaz", () => {
    assert.equal(selectInviteNoticeKey("7d", true), "server.modal.invite.notice.expiring");
    assert.equal(selectInviteNoticeKey("never", true), "server.modal.invite.notice.never");
  });

  it("kopyalanmadan önce 'kopyalandı' denmez", () => {
    assert.equal(selectInviteNoticeKey("7d", false), "server.modal.invite.notice.readyExpiring");
    assert.equal(selectInviteNoticeKey("never", false), "server.modal.invite.notice.readyNever");
  });

  it("arkadaş araması ad ve kullanıcı adında, Türkçe küçültmeyle eşleşir", () => {
    const friends: readonly InviteFriendCandidate[] = [
      { avatarUrl: null, displayName: "Ayşe Kaya", id: "1", username: "aysek" },
      { avatarUrl: null, displayName: "Mert Demir", id: "2", username: "mertd" },
      { avatarUrl: null, displayName: "Işıl Yılmaz", id: "3", username: "isil" },
    ];

    assert.deepEqual(
      filterInviteFriends(friends, "AYŞ").map((friend) => friend.id),
      ["1"],
    );
    assert.deepEqual(
      filterInviteFriends(friends, "mertd").map((friend) => friend.id),
      ["2"],
    );
    assert.equal(filterInviteFriends(friends, "   ").length, 3);
    assert.equal(filterInviteFriends(friends, "zzz").length, 0);
  });
});
