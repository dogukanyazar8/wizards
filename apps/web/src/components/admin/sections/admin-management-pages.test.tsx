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
      iconUrl: null,
      id: "server-whispr",
      isPublic: true,
      memberCount: 128,
      messageCount: 2_048,
      name: "Whispr HQ",
      owner: { displayName: "Ada Yılmaz", id: "user-ada", username: "ada" },
      preferredLocale: "tr",
      textChannelCount: 3,
      updatedAt: "2026-07-01T12:00:00.000Z",
      voiceChannelCount: 1,
    },
  ],
};

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
    assert.match(markup, /grid-template-columns:2\.2fr 1\.9fr 1\.1fr 1fr 1fr 1\.1fr 36px/u);
    assert.match(
      markup,
      /\/admin\/users\?banned=false&amp;query=ada&amp;status=ONLINE&amp;verified=true&amp;page=3/u,
    );
  });

  it("requires a non-whitespace audit reason before a user ban request", () => {
    assert.equal(getAdminBanReasonError("  "), "Neden zorunludur.");
    assert.equal(getAdminBanReasonError("Spam"), null);
  });

  it("renders servers with activity, verification and public-state badges without invented fields", () => {
    const markup = renderToStaticMarkup(
      <AdminServers
        filters={{ query: "whispr" }}
        result={servers}
        serverHealth={{ activeServers: 9, publicServers: 7, totalServers: 12 }}
      />,
    );

    for (const label of ["Sunucular", "24s aktif", "Doğrulanmış", "Herkese açık", "Whispr HQ"]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.doesNotMatch(markup, /Büyüme/u);
    assert.doesNotMatch(markup, /Ortak/u);
    assert.match(markup, /\/admin\/servers\?query=whispr&amp;page=3/u);
  });
});
