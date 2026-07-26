import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_INVITE_COPY_FEEDBACK_MS,
  MOBILE_INVITE_SEARCH_DEBOUNCE_MS,
  formatMobileElapsedSince,
  formatMobileInviteFriendSubtitle,
  formatMobileInviteMeta,
  formatMobileInvitePendingSubtitle,
  formatMobileInviteRemaining,
  formatMobileInviteResultSubtitle,
  getMobileInviteResultEmphasis,
  getMobileInviteRowAction,
  sortMobileInviteFriends,
  splitMobileUsernameMatch,
} from "../src/invite/mobile-invite-sheet-model";
import { mobileCopy } from "../src/locale/mobile-copy";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

const metaLabels = {
  durationDays: "{count} gün",
  durationHours: "{count} sa",
  durationMinutes: "{count} dk",
  expiresIn: "{duration} sonra sona erer",
  limitedUses: "{count} kullanım",
  neverExpires: "Süresiz",
  unlimitedUses: "sınırsız kullanım",
};

const friendLabels = {
  ...metaLabels,
  alreadyMember: "Zaten üye",
  lastSeen: "{duration} önce görüldü",
  offline: "Çevrimdışı",
  online: "Çevrimiçi",
};

function friend(overrides: Partial<Parameters<typeof sortMobileInviteFriends>[0][number]> = {}) {
  return {
    avatarUrl: null,
    displayName: null,
    id: "user-1",
    isMember: false,
    lastSeenAt: null,
    pendingInviteId: null,
    status: "OFFLINE" as const,
    username: "ada",
    ...overrides,
  };
}

describe("invite sheet meta line", () => {
  it("renders the handoff meta verbatim for a 7-day unlimited link", () => {
    assert.equal(
      formatMobileInviteMeta(
        { expiresAt: "2026-08-02T12:00:00.000Z", maxUses: null },
        metaLabels,
        NOW,
      ),
      "7 gün sonra sona erer · sınırsız kullanım",
    );
  });

  it("covers every null combination of expiry and usage cap", () => {
    assert.equal(
      formatMobileInviteMeta({ expiresAt: null, maxUses: null }, metaLabels, NOW),
      "Süresiz · sınırsız kullanım",
    );
    assert.equal(
      formatMobileInviteMeta({ expiresAt: null, maxUses: 10 }, metaLabels, NOW),
      "Süresiz · 10 kullanım",
    );
    assert.equal(
      formatMobileInviteMeta(
        { expiresAt: "2026-07-26T13:00:00.000Z", maxUses: 1 },
        metaLabels,
        NOW,
      ),
      "1 sa sonra sona erer · 1 kullanım",
    );
  });

  it("treats an already-passed or unparseable expiry as no expiry at all", () => {
    assert.equal(formatMobileInviteRemaining("2026-07-26T11:00:00.000Z", metaLabels, NOW), null);
    assert.equal(formatMobileInviteRemaining("not-a-date", metaLabels, NOW), null);
    assert.equal(
      formatMobileInviteMeta(
        { expiresAt: "2026-07-26T11:00:00.000Z", maxUses: null },
        metaLabels,
        NOW,
      ),
      "Süresiz · sınırsız kullanım",
    );
  });

  it("never claims an invite expires in zero time while it is still live", () => {
    assert.equal(formatMobileInviteRemaining("2026-07-26T12:00:30.000Z", metaLabels, NOW), "1 dk");
    assert.equal(formatMobileInviteRemaining("2026-07-26T12:45:00.000Z", metaLabels, NOW), "45 dk");
    assert.equal(formatMobileInviteRemaining("2026-07-27T11:59:00.000Z", metaLabels, NOW), "23 sa");
  });
});

describe("username match highlighting", () => {
  it("splits a leading match the way the handoff tints it", () => {
    assert.deepEqual(splitMobileUsernameMatch("dogukanyazar", "dogu"), {
      match: "dogu",
      prefix: "",
      suffix: "kanyazar",
    });
  });

  it("splits a match in the middle and at the end", () => {
    assert.deepEqual(splitMobileUsernameMatch("dogu_gamer", "gam"), {
      match: "gam",
      prefix: "dogu_",
      suffix: "er",
    });
    assert.deepEqual(splitMobileUsernameMatch("aysegul_dev", "dev"), {
      match: "dev",
      prefix: "aysegul_",
      suffix: "",
    });
  });

  it("matches case-insensitively without shifting the slice offsets", () => {
    assert.deepEqual(splitMobileUsernameMatch("DoguKanYazar", "dogukan"), {
      match: "DoguKan",
      prefix: "",
      suffix: "Yazar",
    });
  });

  it("folds the Turkish dotted and dotless i pairs instead of breaking on them", () => {
    // "İ".toLowerCase() is two code points; a naive fold would slice one char short.
    assert.deepEqual(splitMobileUsernameMatch("İstanbul_dev", "istanbul"), {
      match: "İstanbul",
      prefix: "",
      suffix: "_dev",
    });
    assert.deepEqual(splitMobileUsernameMatch("IŞIK", "ışık"), {
      match: "IŞIK",
      prefix: "",
      suffix: "",
    });
    assert.deepEqual(splitMobileUsernameMatch("ışık_dev", "IŞIK"), {
      match: "ışık",
      prefix: "",
      suffix: "_dev",
    });
    // A dotted-capital search term still matches a plain "i" at its real offset.
    assert.deepEqual(splitMobileUsernameMatch("kilic", "İ"), {
      match: "i",
      prefix: "k",
      suffix: "lic",
    });
    // A dotless capital I folds to "ı", so it must not match a dotted "i".
    assert.deepEqual(splitMobileUsernameMatch("kilic", "I"), {
      match: "",
      prefix: "kilic",
      suffix: "",
    });
  });

  it("returns the whole username unhighlighted when nothing matches", () => {
    assert.deepEqual(splitMobileUsernameMatch("ada", "zzz"), {
      match: "",
      prefix: "ada",
      suffix: "",
    });
    assert.deepEqual(splitMobileUsernameMatch("ada", "   "), {
      match: "",
      prefix: "ada",
      suffix: "",
    });
  });
});

describe("invite row button state", () => {
  it("puts membership above every other state", () => {
    assert.equal(
      getMobileInviteRowAction({ isMember: true, pendingInviteId: "invite-1" }),
      "member",
    );
    assert.equal(
      getMobileInviteRowAction({ isMember: true, optimisticSent: true, pendingInviteId: null }),
      "member",
    );
  });

  it("derives 'sent' from the stored pending invite so it survives a re-open", () => {
    assert.equal(
      getMobileInviteRowAction({ isMember: false, pendingInviteId: "invite-1" }),
      "sent",
    );
  });

  it("shows the optimistic 'sent' only until the refetch lands", () => {
    assert.equal(
      getMobileInviteRowAction({ isMember: false, optimisticSent: true, pendingInviteId: null }),
      "sent",
    );
    assert.equal(
      getMobileInviteRowAction({ isMember: false, optimisticSent: false, pendingInviteId: null }),
      "invite",
    );
  });

  it("offers the invite action to an unrelated, non-member friend", () => {
    assert.equal(getMobileInviteRowAction({ isMember: false, pendingInviteId: null }), "invite");
  });
});

describe("friend list ordering", () => {
  it("lifts online friends, then offline, and sinks members to the bottom", () => {
    const ordered = sortMobileInviteFriends([
      friend({ id: "3", isMember: true, status: "ONLINE", username: "emre" }),
      friend({ id: "2", status: "OFFLINE", username: "berk" }),
      friend({ id: "1", status: "ONLINE", username: "ayse" }),
      friend({ id: "4", status: "DND", username: "ahmet" }),
    ]);

    assert.deepEqual(
      ordered.map((entry) => entry.username),
      ["ahmet", "ayse", "berk", "emre"],
    );
  });

  it("breaks ties with a Turkish collation, not a code-point sort", () => {
    const ordered = sortMobileInviteFriends([
      friend({ id: "2", status: "ONLINE", username: "zeynep" }),
      friend({ id: "1", status: "ONLINE", username: "çağrı" }),
      friend({ id: "3", status: "ONLINE", username: "ali" }),
    ]);

    assert.deepEqual(
      ordered.map((entry) => entry.username),
      ["ali", "çağrı", "zeynep"],
    );
  });

  it("leaves the caller's array untouched", () => {
    const input = [friend({ id: "2", username: "berk" }), friend({ id: "1", username: "ada" })];
    sortMobileInviteFriends(input);
    assert.deepEqual(
      input.map((entry) => entry.username),
      ["berk", "ada"],
    );
  });
});

describe("friend row subtitle", () => {
  it("prefers membership, then presence, then last seen", () => {
    assert.equal(
      formatMobileInviteFriendSubtitle(
        { isMember: true, lastSeenAt: null, status: "ONLINE" },
        friendLabels,
        NOW,
      ),
      "Zaten üye",
    );
    assert.equal(
      formatMobileInviteFriendSubtitle(
        { isMember: false, lastSeenAt: null, status: "IDLE" },
        friendLabels,
        NOW,
      ),
      "Çevrimiçi",
    );
    assert.equal(
      formatMobileInviteFriendSubtitle(
        { isMember: false, lastSeenAt: "2026-07-26T10:00:00.000Z", status: "OFFLINE" },
        friendLabels,
        NOW,
      ),
      "2 sa önce görüldü",
    );
  });

  it("falls back to plain offline when the account has never been seen", () => {
    assert.equal(
      formatMobileInviteFriendSubtitle(
        { isMember: false, lastSeenAt: null, status: "OFFLINE" },
        friendLabels,
        NOW,
      ),
      "Çevrimdışı",
    );
    assert.equal(
      formatMobileInviteFriendSubtitle(
        { isMember: false, lastSeenAt: "nope", status: "OFFLINE" },
        friendLabels,
        NOW,
      ),
      "Çevrimdışı",
    );
  });

  it("rounds elapsed time down to its largest whole unit", () => {
    assert.equal(formatMobileElapsedSince("2026-07-24T12:00:00.000Z", metaLabels, NOW), "2 gün");
    assert.equal(formatMobileElapsedSince("2026-07-26T11:59:50.000Z", metaLabels, NOW), "1 dk");
  });
});

describe("search result presentation", () => {
  it("elevates the first row and every row with a shared server", () => {
    assert.equal(getMobileInviteResultEmphasis({ index: 0, mutualServerCount: 0 }), "filled");
    assert.equal(getMobileInviteResultEmphasis({ index: 3, mutualServerCount: 2 }), "filled");
    assert.equal(getMobileInviteResultEmphasis({ index: 1, mutualServerCount: 0 }), "soft");
  });

  it("renders the three subtitle shapes the handoff shows", () => {
    const labels = {
      alreadyMember: "Zaten üye",
      mutualServers: "{count} ortak sunucu",
      noMutualServers: "Ortak sunucu yok",
    };

    assert.equal(
      formatMobileInviteResultSubtitle(
        { displayName: "Doğukan Yazar", isMember: false, mutualServerCount: 2 },
        labels,
      ),
      "Doğukan Yazar · 2 ortak sunucu",
    );
    assert.equal(
      formatMobileInviteResultSubtitle(
        { displayName: null, isMember: false, mutualServerCount: 0 },
        labels,
      ),
      "Ortak sunucu yok",
    );
    assert.equal(
      formatMobileInviteResultSubtitle(
        { displayName: "Doğuhan", isMember: true, mutualServerCount: 4 },
        labels,
      ),
      "Zaten üye",
    );
  });
});

describe("pending invite subtitle", () => {
  const labels = { pendingStatus: "{time} gönderildi · yanıt bekleniyor" };

  it("opens the line with a Turkish-capitalised relative time", () => {
    assert.equal(
      formatMobileInvitePendingSubtitle(
        { createdAt: "2026-07-25T12:00:00.000Z" },
        labels,
        "tr",
        NOW,
      ),
      "Dün gönderildi · yanıt bekleniyor",
    );
  });

  it("capitalises a leading dotless i as İ in Turkish", () => {
    assert.equal(
      formatMobileInvitePendingSubtitle(
        { createdAt: "2026-07-26T11:58:00.000Z" },
        { pendingStatus: "{time}" },
        "tr",
        NOW,
      ).startsWith("2"),
      true,
    );
  });

  it("uses the English relative time when the account is in English", () => {
    assert.equal(
      formatMobileInvitePendingSubtitle(
        { createdAt: "2026-07-25T12:00:00.000Z" },
        { pendingStatus: "{time} · awaiting reply" },
        "en",
        NOW,
      ),
      "Yesterday · awaiting reply",
    );
  });
});

describe("invite sheet timings", () => {
  it("keeps the copy confirmation and search debounce at their reviewed values", () => {
    assert.equal(MOBILE_INVITE_COPY_FEEDBACK_MS, 2_000);
    assert.equal(MOBILE_INVITE_SEARCH_DEBOUNCE_MS, 300);
  });
});

describe("invite sheet copy", () => {
  it("ships every invite-sheet string in both locales", () => {
    const inviteKeys = Object.keys(mobileCopy.tr).filter((key) => key.startsWith("inviteSheet"));
    assert.ok(inviteKeys.length > 0, "invite sheet copy is missing entirely");

    for (const key of inviteKeys) {
      const turkish = mobileCopy.tr[key as keyof typeof mobileCopy.tr];
      const english = mobileCopy.en[key as keyof typeof mobileCopy.en];
      assert.equal(typeof turkish, "string", `${key} is missing a Turkish string`);
      assert.equal(typeof english, "string", `${key} is missing an English string`);
      assert.ok((turkish as string).length > 0, `${key} is empty in Turkish`);
      assert.ok((english as string).length > 0, `${key} is empty in English`);
    }
  });

  it("formats the handoff meta line from the shipped Turkish copy", () => {
    const labels = mobileCopy.tr;
    assert.equal(
      formatMobileInviteMeta(
        { expiresAt: "2026-08-02T12:00:00.000Z", maxUses: null },
        {
          durationDays: labels.inviteSheetDurationDays,
          durationHours: labels.inviteSheetDurationHours,
          durationMinutes: labels.inviteSheetDurationMinutes,
          expiresIn: labels.inviteSheetMetaExpiresIn,
          limitedUses: labels.inviteSheetMetaLimitedUses,
          neverExpires: labels.inviteSheetMetaNeverExpires,
          unlimitedUses: labels.inviteSheetMetaUnlimitedUses,
        },
        NOW,
      ),
      "7 gün sonra sona erer · sınırsız kullanım",
    );
  });
});
