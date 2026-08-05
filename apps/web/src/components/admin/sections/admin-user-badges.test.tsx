import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GRANTABLE_BADGE_IDS } from "@wizards/types";
import type { listAdminUsers } from "@/lib/admin/management";
import { AdminUsers } from "./admin-users";
import {
  EMPTY_BADGE_GRANT_DRAFT,
  getAdminBadgeGrantError,
  getAdminBadgeRevokeError,
  getAdminBadgeTitle,
} from "./admin-user-badges";

type AdminUsersResult = Awaited<ReturnType<typeof listAdminUsers>>;

const users: AdminUsersResult = {
  pagination: { limit: 20, page: 1, skip: 0, total: 1, totalPages: 1 },
  users: [
    {
      adminRole: null,
      avatarUrl: null,
      bannedAt: null,
      bannedReason: null,
      createdAt: "2026-07-01T12:00:00.000Z",
      displayName: "Ada Yılmaz",
      email: "ada@example.com",
      emailVerified: true,
      id: "user-ada",
      isBanned: false,
      lastSession: null,
      metrics: {
        appSeconds: 3600,
        cameraSeconds: 0,
        dmMessageCount: 4,
        fileUploadCount: 0,
        messageCount: 12,
        screenShareSeconds: 0,
        sessionCount: 1,
        uploadedBytes: 0,
        voiceSeconds: 120,
      },
      registeredAt: "2026-07-01T12:00:00.000Z",
      serverCount: 3,
      status: "ONLINE",
      totalChannelMessages: 12,
      username: "ada",
    },
  ],
};

describe("admin badge panel", () => {
  it("only offers the granted layer and demands what the service demands", () => {
    // 08 §2: the client mirrors the server's refusals so the form can explain
    // itself, and the selector cannot even name an earned badge.
    assert.deepEqual(GRANTABLE_BADGE_IDS, ["contributor", "event"]);

    assert.equal(getAdminBadgeGrantError(EMPTY_BADGE_GRANT_DRAFT), "Rozet seçin.");
    assert.equal(
      getAdminBadgeGrantError({ badge: "streak", expiresAt: "", reason: "olsun" }),
      "Bu rozet kazanılır, elle verilemez.",
    );
    assert.equal(
      getAdminBadgeGrantError({ badge: "event", expiresAt: "", reason: "Whispr Fest" }),
      "Etkinlik rozetinde bitiş tarihi zorunludur.",
    );
    assert.equal(
      getAdminBadgeGrantError({ badge: "contributor", expiresAt: "", reason: "  " }),
      "Neden zorunludur.",
    );
    assert.equal(
      getAdminBadgeGrantError({ badge: "contributor", expiresAt: "", reason: "PR #12" }),
      null,
    );
    assert.equal(
      getAdminBadgeGrantError({
        badge: "event",
        expiresAt: "2026-09-05T12:00",
        reason: "Whispr Fest",
      }),
      null,
    );

    assert.equal(getAdminBadgeRevokeError("   "), "Neden zorunludur.");
    assert.equal(getAdminBadgeRevokeError("yanlış hesap"), null);
  });

  it("prints the tier inside the badge title, never as a second chip", () => {
    assert.equal(getAdminBadgeTitle({ id: "staff", tier: 1 }), "Ekip");
    assert.equal(getAdminBadgeTitle({ id: "veteran", tier: 1 }), "Kıdemli");
    assert.match(getAdminBadgeTitle({ id: "veteran", tier: 3 }), /^Kıdemli · /u);
  });

  it("draws the badge entry point only for a session that may read badges", () => {
    const withBadges = renderToStaticMarkup(
      <AdminUsers canBan canReadBadges canWriteBadges filters={{}} result={users} />,
    );
    const withoutBadges = renderToStaticMarkup(<AdminUsers canBan filters={{}} result={users} />);

    assert.match(withBadges, /Ada Yılmaz rozetleri/u);
    assert.doesNotMatch(withoutBadges, /rozetleri/u);
    // The ban control is unaffected either way.
    assert.match(withoutBadges, /Ada Yılmaz banla/u);
  });
});
