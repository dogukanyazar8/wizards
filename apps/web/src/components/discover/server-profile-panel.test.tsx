import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ServerPublicProfileSchema,
  type ServerPublicProfile,
  type ServerPublicProfileFriend,
} from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  ServerProfilePanel,
  copyServerInviteAddress,
  handleServerProfilePanelKeyDown,
} from "@/components/discover/server-profile-panel";
import { ServerProfileMutualRow } from "@/components/discover/server-profile-mutual-row";
import { getMessagesForLocale } from "@/lib/locale";

const noop = () => undefined;

function profile(overrides: Partial<ServerPublicProfile> = {}): ServerPublicProfile {
  return ServerPublicProfileSchema.parse({
    accessLevel: "public",
    admins: [],
    bannerUrl: null,
    canManageServer: false,
    category: "oyun",
    channelCount: 5,
    channels: [
      {
        categoryId: null,
        categoryName: null,
        id: "channel-public",
        isPrivate: false,
        lastActivityAt: "2026-08-21T09:41:00.000Z",
        liveCount: 18,
        name: "genel",
        participants: [],
        readOnly: false,
        type: "text",
      },
      {
        categoryId: null,
        categoryName: null,
        id: "channel-private",
        isPrivate: true,
        lastActivityAt: null,
        liveCount: 7,
        name: "gizli",
        participants: [],
        readOnly: false,
        type: "text",
      },
    ],
    createdAt: "2024-05-10T08:00:00.000Z",
    description: "Turnuvalar ve sahne yayınları için topluluk.",
    discoverable: true,
    hasMoreChannels: true,
    iconUrl: null,
    inviteAddress: "https://whispr.app/invite/oyun",
    isPublic: true,
    joined: false,
    joinedAt: null,
    languages: ["tr"],
    memberCount: 48_200,
    muted: false,
    mutualFriendCount: 0,
    mutualFriends: [],
    name: "Oyun Kulübü Türkiye",
    notificationLevel: "all",
    onlineCount: 3_910,
    serverId: "server-1",
    shortName: "OK",
    starred: false,
    tags: ["Turnuva", "Sahne"],
    type: "COMMUNITY",
    upcomingEvent: null,
    verified: true,
    voiceActiveCount: 99,
    voiceRoomCount: 4,
    weeklyMessageCount: 820,
    ...overrides,
  });
}

function renderPanel(
  item: ServerPublicProfile,
  state: { readonly isError?: boolean; readonly isLoading?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <ServerProfilePanel
        currentUserId="viewer-1"
        isError={state.isError ?? false}
        isLoading={state.isLoading ?? false}
        isMembershipPending={false}
        onJoin={noop}
        onLeave={noop}
        onRequestClose={noop}
        onRetry={noop}
        panelServerId={item.serverId}
        placeholderCategory={item.category}
        placeholderInitials="OK"
        placeholderName={item.name}
        profile={item}
      />
    </LocaleProvider>,
  );
}

function friend(role: ServerPublicProfileFriend["role"]): ServerPublicProfileFriend {
  return {
    avatarUrl: null,
    displayName: role === "admin" ? "Selin Aksoy" : "Mert Kaya",
    id: `friend-${role}`,
    presence: role === "admin" ? "online" : "idle",
    role,
  };
}

function renderMutualRow(role: ServerPublicProfileFriend["role"]): string {
  const profilePopover = (trigger: ReactNode) => (
    <div role="button" tabIndex={0}>
      {trigger}
    </div>
  );

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <ServerProfileMutualRow
        currentUserId="viewer-1"
        friend={friend(role)}
        renderProfilePopover={profilePopover}
        serverId="server-1"
      />
    </LocaleProvider>,
  );
}

describe("ServerProfilePanel", () => {
  it("Paylaş exact davet adresini yazar; Clipboard hatasını güvenli sonuca çevirir", async () => {
    const writes: string[] = [];
    const copied = await copyServerInviteAddress("https://whispr.app/invite/oyun", {
      writeText: async (value) => {
        writes.push(value);
      },
    });
    const rejected = await copyServerInviteAddress("https://whispr.app/invite/oyun", {
      writeText: async () => {
        throw new Error("blocked");
      },
    });

    assert.equal(copied, true);
    assert.deepEqual(writes, ["https://whispr.app/invite/oyun"]);
    assert.equal(rejected, false);
    assert.equal(await copyServerInviteAddress("https://whispr.app/invite/oyun", undefined), false);
  });

  it("326 px kolon ve arka planla çakışmayan 54 px tile çizer", () => {
    const markup = renderPanel(profile());
    const tile = markup.match(/<span[^>]*data-testid="server-profile-tile"[^>]*>/u)?.[0];

    assert.ok(markup.includes('data-testid="server-profile-panel"'));
    assert.ok(markup.includes("width:20.375rem"));
    assert.ok(tile?.includes("width:3.375rem"));
    assert.ok(tile?.includes("height:3.375rem"));
    assert.ok(!tile?.includes("margin"));
    assert.ok(!tile?.includes("box-shadow"));
  });

  it("null kategoride pili gizler ve profil bloğunu primary tonuna düşürür", () => {
    const markup = renderPanel(profile({ category: null }));

    assert.ok(!markup.includes('data-testid="server-profile-category"'));
    assert.ok(markup.includes('data-testid="server-profile-summary"'));
    assert.ok(markup.includes('data-tone="primary"'));
    assert.ok(markup.includes("hsl(var(--primary)/0.07)"));
  });

  it("sesli oda kutusunda voiceRoomCount gösterir; voiceActiveCount göstermez", () => {
    const markup = renderPanel(profile({ voiceActiveCount: 99, voiceRoomCount: 4 }));

    assert.ok(markup.includes('data-testid="server-profile-stat-voice-rooms"'));
    assert.ok(markup.includes('aria-label="4 sesli oda"'));
    assert.ok(markup.includes('role="group"'));
    assert.ok(
      markup.includes("color-mix(in srgb, hsl(var(--warning)) 45%, hsl(var(--foreground)))"),
    );
    assert.ok(!markup.includes(">99<"));
  });

  it("gizli kanalı süzer ve hasMoreChannels bilgi satırını gerçek farkla çizer", () => {
    const markup = renderPanel(profile());

    assert.ok(markup.includes(">genel<"));
    assert.ok(!markup.includes(">gizli<"));
    assert.ok(markup.includes("+4 kanal daha"));
  });

  it("mutualFriends boşsa başlık ve açıklama bırakmaz", () => {
    const markup = renderPanel(profile({ mutualFriendCount: 0, mutualFriends: [] }));

    assert.ok(!markup.includes("Tanıdıkların"));
    assert.ok(!markup.includes("Ortak sunucularından tanıdığın kişiler burada da üye."));
  });

  it("arka plan yenilemesi hata verse de cached profili görünür tutar", () => {
    const markup = renderPanel(profile(), { isError: true });

    assert.ok(markup.includes('data-testid="server-profile-summary"'));
    assert.ok(!markup.includes("Profil yüklenemedi"));
  });

  it("rol pilllerini iki doğru token diliyle çizer; avatar satırında bindirme yoktur", () => {
    const admin = renderMutualRow("admin");
    const member = renderMutualRow("member");

    assert.ok(admin.includes("Yönetici"));
    assert.ok(admin.includes("hsl(var(--primary)/0.16)"));
    assert.ok(member.includes("Üye"));
    assert.ok(member.includes("hsl(var(--surface-soft))"));
    assert.ok(!admin.includes("margin-left:-"));
    assert.ok(!member.includes("margin-left:-"));
    assert.equal(admin.match(/role="button"/gu)?.length, 1);
    assert.ok(!admin.includes("<button"));
  });

  it("Esc kapatır; geniş ekran Tab için odak tuzağı kurmaz", () => {
    const keys: string[] = [];
    let closeCount = 0;
    let prevented = 0;
    let stopped = 0;
    const event = (key: string) => ({
      key,
      preventDefault: () => {
        prevented += 1;
      },
      stopPropagation: () => {
        stopped += 1;
      },
    });

    keys.push("Tab", "Escape");
    keys.forEach((key) =>
      handleServerProfilePanelKeyDown(event(key), () => {
        closeCount += 1;
      }),
    );

    assert.equal(closeCount, 1);
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
  });

  it("inviteAddress null iken Paylaş pasif ve açıklamalı", () => {
    const markup = renderPanel(profile({ inviteAddress: null }));

    assert.match(markup, /<button[^>]*data-testid="server-profile-share"[^>]*disabled/u);
    assert.ok(markup.includes('title="Davet bağlantısı kullanılamıyor"'));
  });
});
