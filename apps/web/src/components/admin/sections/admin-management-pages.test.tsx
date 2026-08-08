import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { listAdminServers, listAdminUsers } from "@/lib/admin/management";
import { AdminServers } from "./admin-servers";
import { AdminUsers, getAdminBanReasonError } from "./admin-users";

type AdminUsersResult = Awaited<ReturnType<typeof listAdminUsers>>;
type AdminServersResult = Awaited<ReturnType<typeof listAdminServers>>;

const users: AdminUsersResult = {
  pagination: { limit: 20, page: 2, skip: 20, total: 41, totalPages: 3 },
  users: [
    {
      adminRole: "MODERATOR",
      avatarUrl: null,
      bannedAt: null,
      bannedReason: null,
      createdAt: "2026-07-01T12:00:00.000Z",
      displayName: "Ada Yılmaz",
      email: "ada@example.com",
      emailVerified: false,
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

const servers: AdminServersResult = {
  pagination: { limit: 20, page: 2, skip: 20, total: 41, totalPages: 3 },
  servers: [
    {
      channelCount: 4,
      channels: [{ id: "channel-1", messageCount: 12, name: "genel", type: "TEXT" }],
      createdAt: "2026-07-01T12:00:00.000Z",
      description: "Whispr merkezi",
      discoverable: true,
      featured: false,
      iconUrl: null,
      id: "server-whispr",
      isPublic: true,
      memberCount: 128,
      messageCount: 2_048,
      name: "Whispr HQ",
      owner: { displayName: "Ada Yılmaz", id: "user-ada", username: "ada" },
      preferredLocale: "tr",
      storedMemberCount: 126,
      textChannelCount: 3,
      type: "COMMUNITY",
      updatedAt: "2026-07-01T12:00:00.000Z",
      verified: true,
      voiceChannelCount: 1,
    },
  ],
};

const serverAuditTrail = [
  {
    action: "server.update",
    actor: { displayName: "Ada Yılmaz", id: "user-ada", username: "ada" },
    createdAt: "2026-07-02T09:30:00.000Z",
    id: "audit-1",
    targetId: "server-whispr",
  },
];

describe("admin management pages", () => {
  it("renders users with the required filters, non-suspension KPI, and stable grid", () => {
    const markup = renderToStaticMarkup(
      <AdminUsers
        canBan
        filters={{ banned: "false", query: "ada", status: "ONLINE", verified: "true" }}
        result={users}
      />,
    );

    for (const label of [
      "Kullanıcılar",
      "Doğrulanmamış",
      "Kullanıcı, kullanıcı adı veya e-posta ara",
      "Durum",
      "Doğrulama",
      "Ban durumu",
      "Ada Yılmaz",
    ]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.doesNotMatch(markup, /Askıya alınmış/u);
    assert.match(markup, /grid-template-columns:2\.2fr 1\.9fr 1\.1fr 1fr 1fr 1\.1fr 76px/u);
    assert.match(
      markup,
      /\/admin\/users\?banned=false&amp;query=ada&amp;status=ONLINE&amp;verified=true&amp;page=3/u,
    );
  });

  it("requires a non-whitespace audit reason before a user ban request", () => {
    assert.equal(getAdminBanReasonError("  "), "Neden zorunludur.");
    assert.equal(getAdminBanReasonError("Spam"), null);
  });

  it("renders servers with activity, discovery and public-state badges without invented fields", () => {
    const markup = renderToStaticMarkup(
      <AdminServers
        auditTrail={serverAuditTrail}
        canWrite={false}
        filters={{ query: "whispr" }}
        result={servers}
        serverHealth={{ activeServers: 9, publicServers: 7, totalServers: 12 }}
      />,
    );

    for (const label of ["Sunucular", "24s aktif", "Keşfedilebilir", "Herkese açık", "Whispr HQ"]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.doesNotMatch(markup, /Büyüme/u);
    assert.doesNotMatch(markup, /Ortak/u);
    assert.match(markup, /\/admin\/servers\?query=whispr&amp;page=3/u);
  });

  it("hides every write control from a reader, and shows them to server.write", () => {
    const readOnly = renderToStaticMarkup(
      <AdminServers
        auditTrail={serverAuditTrail}
        canWrite={false}
        filters={{}}
        result={servers}
        serverHealth={{ activeServers: 9, publicServers: 7, totalServers: 12 }}
      />,
    );

    for (const control of ["Yeni sunucu", "Topluluğa terfi", "Kişiselleştir", "Öne çıkar", "Sil"]) {
      assert.doesNotMatch(readOnly, new RegExp(control, "u"));
    }

    const writable = renderToStaticMarkup(
      <AdminServers
        auditTrail={serverAuditTrail}
        canWrite
        filters={{}}
        result={servers}
        serverHealth={{ activeServers: 9, publicServers: 7, totalServers: 12 }}
      />,
    );

    for (const control of [
      "Yeni sunucu",
      // The fixture is a community server, so the row offers demotion.
      "Kişiselleştir",
      "Doğrulamayı kaldır",
      "Öne çıkar",
      "Sayacı yeniden hesapla",
      "Sil",
    ]) {
      assert.match(writable, new RegExp(control, "u"));
    }
  });

  it("shows the verification badge and the counter drift the server list reports", () => {
    const markup = renderToStaticMarkup(
      <AdminServers
        auditTrail={serverAuditTrail}
        canWrite
        filters={{}}
        result={servers}
        serverHealth={{ activeServers: 9, publicServers: 7, totalServers: 12 }}
      />,
    );

    assert.match(markup, /Doğrulanmış/u);
    assert.match(markup, /Topluluk/u);
    // Live 128 against the stored 126: the drift is visible before it is repaired.
    assert.match(markup, /128 üye/u);
    assert.match(markup, /sayaç: 126/u);
  });

  it("renders the audit trail of the server writes", () => {
    const markup = renderToStaticMarkup(
      <AdminServers
        auditTrail={serverAuditTrail}
        canWrite
        filters={{}}
        result={servers}
        serverHealth={{ activeServers: 9, publicServers: 7, totalServers: 12 }}
      />,
    );

    assert.match(markup, /Son sunucu işlemleri/u);
    assert.match(markup, /@ada/u);
    assert.match(markup, /güncelledi/u);
  });
});
