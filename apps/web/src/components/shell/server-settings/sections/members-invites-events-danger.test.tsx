import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ServerBanEntry,
  ServerPendingInvite,
  ServerScheduledEvent,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceServerDetail,
} from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import type { ServerSettingsDraft } from "@/components/shell/server-settings/use-server-settings-draft";
import { getMessagesForLocale } from "@/lib/locale";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { listMemberModerationActions } from "@/lib/servers/member-moderation";
import {
  NO_SERVER_PERMISSIONS,
  type ServerViewerPermissions,
} from "@/lib/servers/viewer-permissions";
import { toServerInviteChannelOptions } from "@/lib/servers/settings-invites";
import { DangerSection, DangerSectionView } from "./danger-section";
import { EventsSection, EventsSectionView } from "./events-section";
import { InvitesSection, InvitesSectionView } from "./invites-section";
import { MembersSectionView } from "./members-section";

/**
 * Ş13 — §8.6 · §8.7 · §8.8 · §8.9.
 *
 * Test **ölçünün kendisini** değil, ölçünün sözlükten geldiğini doğrular (Ş8'in düzeni);
 * sözlük ile referans HTML'in eşitliği `lib/servers/parity.test.ts` işidir.
 *
 * Üç yetki kapısı **kancalardan önce** olduğu için negatif testler sağlayıcı ağacı olmadan
 * koşar: bölüm yetkisiz kullanıcıya `null` döner, boş bir kabuk değil.
 */

const MESSAGES = getMessagesForLocale("tr");
const copy = (key: string): string => MESSAGES[key] ?? "";
/**
 * `renderToStaticMarkup` kesme işaretini `&#x27;` olarak kaçırır; `QR'ı gizle` gibi metinler
 * ham sözlük değeriyle aranırsa hiç bulunamaz.
 */
const escaped = (key: string): string =>
  copy(key).replace(/&/gu, "&amp;").replace(/'/gu, "&#x27;").replace(/"/gu, "&quot;");
const NOW = Date.parse("2026-08-25T12:00:00.000Z");

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

function role(overrides: Partial<WorkspaceRole> & Pick<WorkspaceRole, "id">): WorkspaceRole {
  return {
    color: 0,
    isDefault: false,
    managed: false,
    mentionable: false,
    name: overrides.id,
    permissions: [],
    position: 0,
    ...overrides,
  };
}

function member(
  overrides: Partial<WorkspaceMember> & Pick<WorkspaceMember, "id" | "userId">,
): WorkspaceMember {
  return {
    accessLevel: "MEMBER",
    avatarUrl: null,
    communicationDisabledUntil: null,
    customStatus: null,
    displayName: overrides.id,
    roles: [],
    status: "ONLINE",
    username: overrides.id,
    ...overrides,
  };
}

const OWNER = member({
  accessLevel: "OWNER",
  displayName: "DY",
  id: "m-owner",
  userId: "u-owner",
  username: "me",
});
const ADMIN = member({
  accessLevel: "ADMIN",
  displayName: "dogukan",
  id: "m-admin",
  userId: "u-admin",
  username: "dogukan",
});
const MEMBER = member({
  displayName: "Ayşe Kaya",
  id: "m-ayse",
  roles: [{ color: 0, id: "r-mod", name: "Moderatör" }],
  status: "OFFLINE",
  userId: "u-ayse",
  username: "aysek",
});

const DETAIL = {
  categories: [
    {
      channels: [
        { id: "c-welcome", name: "welcome-chat", type: "TEXT" },
        { id: "c-voice", name: "ses", type: "VOICE" },
      ],
      id: "cat-1",
      name: "GENEL",
      position: 0,
    },
  ],
  invites: [],
  memberPage: { limit: 100, nextCursor: null },
  members: [OWNER, ADMIN, MEMBER],
  roles: [
    role({ id: "r-everyone", isDefault: true, name: "@everyone" }),
    role({ id: "r-mod", name: "Moderatör", position: 5 }),
  ],
  server: {
    allowFileUploads: true,
    allowGifs: true,
    allowMemberAdds: true,
    deletedMessageNoticeMinutes: 60,
    description: null,
    discoverable: false,
    iconColor: null,
    iconUrl: null,
    id: "s-1",
    inviteCode: null,
    isAdmin: true,
    isOwner: true,
    isPublic: false,
    memberCount: 3,
    mentionCount: 0,
    messageCharacterLimit: 2000,
    name: "Mobile Test",
    shortName: "MT",
    slowModeDelay: 0,
    starred: false,
    tags: [],
    type: "PERSONAL",
    unreadCount: 0,
    accessLevel: "OWNER",
    defaultChannelId: null,
  },
  ungroupedChannels: [],
} as unknown as WorkspaceServerDetail;

const DRAFT: ServerSettingsDraft = {
  allowFileUploads: true,
  allowGifs: true,
  allowMemberAdds: true,
  deletedMessageNoticeMinutes: 60,
  description: "",
  discoverable: false,
  iconColor: null,
  iconUrl: null,
  isPublic: false,
  messageCharacterLimit: 2000,
  name: "Mobile Test",
  shortName: "MT",
  slowModeDelay: 0,
  tags: [],
};

const ALL_PERMISSIONS: ServerViewerPermissions = { all: true, keys: new Set() };

function sectionProps(
  overrides: Partial<ServerSettingsSectionProps> = {},
): ServerSettingsSectionProps {
  return {
    counts: { channels: 1, events: 0, invites: 0, members: 3, none: null, roles: 2 },
    currentUserId: "u-owner",
    detail: DETAIL,
    draft: DRAFT,
    flush: () => undefined,
    onOpenDeleteServer: () => undefined,
    patch: () => undefined,
    patchDeferred: () => undefined,
    permissions: ALL_PERMISSIONS,
    uploadthingEnabled: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §8.6 Üyeler ve Moderasyon
// ---------------------------------------------------------------------------

function renderMembers(overrides: Partial<React.ComponentProps<typeof MembersSectionView>> = {}) {
  return render(
    <MembersSectionView
      allowMemberAdds
      bans={[]}
      bansExpanded={false}
      canAssignRoles
      canManageServer
      counts={{ filtered: 3, total: 3 }}
      filter="all"
      members={[OWNER, ADMIN, MEMBER]}
      moderationActions={(row) =>
        listMemberModerationActions(
          { canBan: true, canKick: true, canTimeout: true, userId: "u-owner" },
          {
            accessLevel: row.accessLevel,
            communicationDisabledUntil: row.communicationDisabledUntil,
            userId: row.userId,
          },
          NOW,
        )
      }
      nowMs={NOW}
      onBan={() => undefined}
      onFilterChange={() => undefined}
      onKick={() => undefined}
      onQueryChange={() => undefined}
      onRemoveTimeout={() => undefined}
      onTimeout={() => undefined}
      onToggleAllowMemberAdds={() => undefined}
      onToggleBans={() => undefined}
      onToggleMenu={() => undefined}
      onToggleRoleMenu={() => undefined}
      onUnban={() => undefined}
      openMenuMemberId={null}
      openRoleMenuMemberId={null}
      query=""
      roles={DETAIL.roles}
      {...overrides}
    />,
  );
}

describe("§8.6 Üyeler ve Moderasyon", () => {
  it("arama kutusu, yedi süzgeç çipi ve canlı sayaç çizer", () => {
    const html = renderMembers();

    assert.ok(html.includes(copy("server.settings.members.search.placeholder")));
    assert.ok(html.includes("3 / 3 üye"));

    for (const key of ["all", "member", "moderator", "admin", "owner", "online", "offline"]) {
      assert.ok(html.includes(copy(`server.settings.members.filter.${key}`)), `çip eksik: ${key}`);
    }

    assert.match(html, /role="radiogroup"/u);
  });

  it("tek rol düzenleyici gösterir ve varsayılan rolü rozetlere dahil etmez", () => {
    const html = renderMembers({
      members: [
        member({
          id: "m",
          userId: "u",
          roles: [
            { id: "r-everyone", name: "@everyone", color: 0 },
            { id: "r-mod", name: "Moderatör", color: 0 },
            { id: "r-custom", name: "Tasarımcı", color: 0 },
          ],
        }),
      ],
    });
    assert.equal((html.match(/aria-haspopup="dialog"/gu) ?? []).length, 1);
    assert.ok(html.includes("Roller (2)"));
    assert.ok(html.includes("Moderatör"));
    assert.ok(html.includes("Tasarımcı"));
    assert.equal(html.includes("@everyone"), false);
  });

  it("yetkisiz hedefte rol düzenleme ve moderasyon eylemleri etkin değildir", () => {
    const html = renderMembers({
      members: [MEMBER],
      canEditMember: () => false,
      moderationActions: () => [],
      canBan: false,
    });
    assert.equal(html.includes('aria-haspopup="dialog"'), false);
    assert.equal(html.includes('data-testid="server-settings-member-menu-'), false);
    assert.match(html, /aria-disabled="true"[^>]*disabled=""/u);
    assert.equal(html.includes("Yasaklılar"), false);
  });

  it("sayaç süzülmüş ve toplam sayıyı ayrı taşır", () => {
    const html = renderMembers({ counts: { filtered: 1, total: 12 } });

    assert.ok(html.includes("1 / 12 üye"));
  });

  it("sahibin çıkarma düğmesi pasif ve nedenini yazar", () => {
    const html = renderMembers();

    assert.match(html, /aria-disabled="true"/u);
    assert.ok(html.includes("cursor:not-allowed"));
    assert.ok(
      html.includes(`opacity:${SERVER_METRICS.settingsSections.membersKickDisabledOpacity}`),
    );
    assert.ok(html.includes(copy("server.settings.members.kick.ownerDisabled")));
  });

  it("sahibin satırında moderasyon menüsü düğmesi hiç yok", () => {
    const html = renderMembers();

    assert.ok(html.includes('data-testid="server-settings-member-menu-m-admin"'));
    assert.equal(html.includes('data-testid="server-settings-member-menu-m-owner"'), false);
  });

  it("zaman aşımındaki üye warning çipi taşır", () => {
    const timedOut = member({
      communicationDisabledUntil: "2026-08-25T14:00:00.000Z",
      displayName: "Mert",
      id: "m-mert",
      userId: "u-mert",
      username: "mertd",
    });
    const html = renderMembers({ members: [OWNER, timedOut] });

    assert.ok(html.includes('data-testid="server-settings-member-timeout-m-mert"'));
    assert.ok(html.includes("Zaman aşımında · 02:00:00"));
  });

  it("zaman aşımı olmayan üyede çip yok", () => {
    const html = renderMembers({ members: [ADMIN] });

    assert.equal(html.includes("Zaman aşımında"), false);
  });

  it("moderasyon menüsü altı süreyi ve yasaklamayı listeler", () => {
    const html = renderMembers({ openMenuMemberId: "m-admin" });

    for (const id of ["60s", "5m", "10m", "1h", "1d", "1w"]) {
      assert.ok(html.includes(copy(`server.settings.members.timeout.${id}`)), id);
    }

    assert.ok(html.includes(copy("server.settings.members.menu.ban")));
    assert.match(html, /role="menu"/u);
  });

  it("zaman aşımındaki üyenin menüsünde `ver` değil `kaldır` durur", () => {
    const timedOut = member({
      communicationDisabledUntil: "2026-08-25T14:00:00.000Z",
      id: "m-mert",
      userId: "u-mert",
    });
    const html = renderMembers({ members: [timedOut], openMenuMemberId: "m-mert" });

    assert.ok(html.includes(copy("server.settings.members.menu.removeTimeout")));
    assert.equal(html.includes(copy("server.settings.members.timeout.60s")), false);
  });

  it("SPEC'in `bir sonraki fazda eklenecek` bilgi notu kalmadı (K3)", () => {
    const html = renderMembers();

    assert.equal(html.includes("bir sonraki fazda"), false);
  });

  it("yasaklılar listesi katlanır ve sayısını yazar", () => {
    const ban: ServerBanEntry = {
      avatarUrl: null,
      bannedAt: "2026-08-20T09:00:00.000Z",
      bannedByDisplayName: "DY",
      bannedByUserId: "u-owner",
      displayName: "Spam Hesap",
      reason: "spam",
      userId: "u-spam",
      username: "spam",
    };
    const collapsed = renderMembers({ bans: [ban] });

    assert.ok(collapsed.includes("Yasaklılar (1)"));
    assert.match(collapsed, /aria-expanded="false"/u);
    assert.equal(collapsed.includes("Spam Hesap"), false);

    const expanded = renderMembers({ bans: [ban], bansExpanded: true });

    assert.ok(expanded.includes("Spam Hesap"));
    assert.ok(expanded.includes(copy("server.settings.members.banned.unban")));
    assert.ok(expanded.includes("Sebep: spam"));
  });

  it("sebepsiz ban boş metin değil, `Sebep girilmedi` yazar", () => {
    const html = renderMembers({
      bans: [
        {
          avatarUrl: null,
          bannedAt: "2026-08-20T09:00:00.000Z",
          bannedByDisplayName: null,
          bannedByUserId: "u-owner",
          displayName: "Anon",
          reason: null,
          userId: "u-anon",
          username: "anon",
        },
      ],
      bansExpanded: true,
    });

    assert.ok(html.includes(copy("server.settings.members.banned.noReason")));
  });

  it("satır ölçüsünü sözlükten alır", () => {
    const { settingsSections } = SERVER_METRICS;
    const html = renderMembers();

    assert.ok(html.includes(`border-radius:${pxToRem(settingsSections.membersRowRadius)}`));
    assert.ok(html.includes(`width:${pxToRem(settingsSections.membersAvatarSize)}`));
    assert.ok(html.includes(`width:${pxToRem(settingsSections.membersPresenceDotSize)}`));
  });

  it("`Üyeler kullanıcı ekleyebilir` anahtarı `MANAGE_SERVER` yoksa çizilmez", () => {
    const html = renderMembers({ canManageServer: false });

    assert.equal(html.includes(copy("server.settings.members.allowAdds.title")), false);
  });
});

// ---------------------------------------------------------------------------
// §8.7 Davetler
// ---------------------------------------------------------------------------

const INVITE: WorkspaceInvite = {
  channelId: "c-welcome",
  code: "whspr-a7k2",
  createdAt: "2026-08-19T12:00:00.000Z",
  createdByDisplayName: "DY",
  expiresAt: "2026-08-31T12:00:00.000Z",
  id: "i-1",
  maxUses: 25,
  uses: 3,
} as WorkspaceInvite;

function renderInvites(overrides: Partial<React.ComponentProps<typeof InvitesSectionView>> = {}) {
  return render(
    <InvitesSectionView
      channels={toServerInviteChannelOptions(DETAIL)}
      copiedInviteId={null}
      creating={false}
      error={null}
      invites={[INVITE]}
      nowMs={NOW}
      onChange={() => undefined}
      onCopy={() => undefined}
      onCreate={() => undefined}
      onInviteFriend={() => undefined}
      onRevoke={() => undefined}
      onTogglePending={() => undefined}
      onToggleQr={() => undefined}
      openQrInviteId={null}
      pendingExpanded={false}
      pendingInvites={[]}
      state={{ channelId: "c-welcome", durationId: "7d", useLimitId: "25" }}
      {...overrides}
    />,
  );
}

describe("§8.7 Davetler", () => {
  it("üç çip grubunu etiketleriyle çizer", () => {
    const html = renderInvites();

    assert.ok(html.includes(copy("server.settings.invites.field.channel")));
    assert.ok(html.includes(copy("server.settings.invites.field.duration")));
    assert.ok(html.includes(copy("server.settings.invites.field.uses")));
    assert.ok(html.includes("# welcome-chat"));
    // Ses kanalı hedef olamaz.
    assert.equal(html.includes("# ses"), false);
  });

  it("canlı özet seçili üç değeri birleştirir", () => {
    const html = renderInvites();

    assert.ok(html.includes("# welcome-chat · 7 gün · 25 kullanım"));
  });

  it("özet `Sınırsız` seçildiğinde sayı yazmaz", () => {
    const html = renderInvites({
      state: { channelId: "c-welcome", durationId: "never", useLimitId: "unlimited" },
    });

    assert.ok(html.includes(copy("server.settings.invites.summary.unlimited")));
  });

  it("mevcut davet satırı kod, kanal çipi, kullanım çipi ve iki eylemi taşır", () => {
    const html = renderInvites();

    assert.ok(html.includes("whspr-a7k2"));
    assert.ok(html.includes("3 / 25"));
    assert.ok(html.includes(copy("server.settings.invites.copy")));
    assert.ok(html.includes(copy("server.settings.invites.revoke")));
  });

  it("sınırsız davet kullanım çipinde `∞` yazar", () => {
    const html = renderInvites({
      invites: [{ ...INVITE, expiresAt: null, id: "i-2", maxUses: null, uses: 12 }],
    });

    assert.ok(html.includes("12 / ∞"));
    assert.ok(html.includes(copy("server.settings.invites.expiry.never")));
  });

  it("K3: kesikli `yakında` çipleri gitti, üç gerçek yüzey geldi", () => {
    const html = renderInvites();

    assert.equal(html.includes("Mobil eşitliği için sonraki özellikler"), false);
    assert.ok(html.includes('data-testid="server-settings-invite-qr-i-1"'));
    assert.ok(html.includes('data-testid="server-settings-invite-friends"'));
    assert.ok(html.includes('data-testid="server-settings-invites-pending-toggle"'));
  });

  it("QR paneli yalnız açık satırda ve sözlükteki kutu ölçüsüyle çizilir", () => {
    assert.equal(
      renderInvites().includes('data-testid="server-settings-invite-qr-panel-i-1"'),
      false,
    );

    const open = renderInvites({ openQrInviteId: "i-1" });

    assert.ok(open.includes('data-testid="server-settings-invite-qr-panel-i-1"'));
    assert.ok(open.includes(`width:${pxToRem(SERVER_METRICS.inviteModal.qrBoxSize)}`));
    assert.ok(open.includes(escaped("server.settings.invites.qr.hide")));
  });

  it("bekleyen davetler katlanır ve hedef kullanıcıyı yazar", () => {
    const pending = {
      ...INVITE,
      id: "i-p",
      targetUser: { avatarUrl: null, displayName: "Elif Soy", id: "u-elif", username: "elifs" },
    } as ServerPendingInvite;

    assert.ok(renderInvites({ pendingInvites: [pending] }).includes("Bekleyen davetler (1)"));

    const expanded = renderInvites({ pendingExpanded: true, pendingInvites: [pending] });

    assert.ok(expanded.includes("Elif Soy"));
    assert.ok(expanded.includes('data-testid="server-settings-pending-revoke-i-p"'));
  });

  it("davet yoksa boş durum yazar", () => {
    const html = renderInvites({ invites: [] });

    assert.ok(html.includes(copy("server.settings.invites.empty")));
  });

  it("`MANAGE_INVITES` yoksa bölüm hiç render edilmez", () => {
    const html = renderToStaticMarkup(
      <InvitesSection {...sectionProps({ permissions: NO_SERVER_PERMISSIONS })} />,
    );

    assert.equal(html, "");
  });
});

// ---------------------------------------------------------------------------
// §8.8 Etkinlikler
// ---------------------------------------------------------------------------

const EVENT = {
  attendeeCount: 0,
  channelId: "c-live",
  channelName: "live-room",
  description: "Yeni sesli oda motorunu birlikte deniyoruz.",
  entityType: "VOICE",
  externalLocation: null,
  id: "e-1",
  interestedCount: 14,
  name: "Sürüm 2.4 canlı demo",
  scheduledEndAt: "2026-08-18T18:00:00.000Z",
  scheduledStartAt: "2026-08-18T17:00:00.000Z",
  serverId: "s-1",
  status: "SCHEDULED",
  viewerInterested: false,
} as ServerScheduledEvent;

function renderEvents(overrides: Partial<React.ComponentProps<typeof EventsSectionView>> = {}) {
  return render(
    <EventsSectionView
      canManage
      error={null}
      events={[EVENT]}
      onCancel={() => undefined}
      onCreate={() => undefined}
      onEdit={() => undefined}
      onTabChange={() => undefined}
      tab="upcoming"
      {...overrides}
    />,
  );
}

describe("§8.8 Etkinlikler", () => {
  it("iki sekmeyi ve oluşturma düğmesini çizer", () => {
    const html = renderEvents();

    assert.ok(html.includes(copy("server.settings.events.tab.upcoming")));
    assert.ok(html.includes(copy("server.settings.events.tab.cancelled")));
    assert.ok(html.includes('data-testid="server-settings-events-create"'));
    assert.match(html, /role="tablist"/u);
  });

  it("kart tarih kutusunu, üç çipi ve iki eylemi taşır", () => {
    const { settingsSections } = SERVER_METRICS;
    const html = renderEvents();

    assert.ok(html.includes("Sürüm 2.4 canlı demo"));
    assert.ok(html.includes("live-room"));
    assert.ok(html.includes("14 ilgilenen"));
    assert.ok(html.includes(`width:${pxToRem(settingsSections.eventsDateBoxWidth)}`));
    assert.ok(html.includes(`height:${pxToRem(settingsSections.eventsDateBoxHeight)}`));
    assert.ok(html.includes('data-testid="server-settings-event-edit-e-1"'));
    assert.ok(html.includes('data-testid="server-settings-event-cancel-e-1"'));
  });

  it("iptal edilmiş etkinlik ikinci sekmede, rozetli ve düğmesiz", () => {
    const cancelled = { ...EVENT, status: "CANCELLED" } as ServerScheduledEvent;
    const html = renderEvents({ events: [cancelled], tab: "cancelled" });

    assert.ok(html.includes(copy("server.settings.events.cancelledBadge")));
    assert.equal(html.includes('data-testid="server-settings-event-edit-e-1"'), false);
    assert.equal(html.includes('data-testid="server-settings-event-cancel-e-1"'), false);
  });

  it("`İptal edilen` sekmesi boşken kesikli boş durum çizer", () => {
    const html = renderEvents({ tab: "cancelled" });

    assert.ok(html.includes('data-testid="server-settings-events-empty"'));
    assert.ok(html.includes(copy("server.settings.events.empty.cancelled")));
    assert.ok(html.includes("border-style:dashed") || html.includes("border-dashed"));
  });

  it("`MANAGE_EVENTS` yoksa bölüm hiç render edilmez", () => {
    const html = renderToStaticMarkup(
      <EventsSection {...sectionProps({ permissions: NO_SERVER_PERMISSIONS })} />,
    );

    assert.equal(html, "");
  });
});

// ---------------------------------------------------------------------------
// §8.9 Tehlike bölgesi
// ---------------------------------------------------------------------------

function renderDanger(overrides: Partial<React.ComponentProps<typeof DangerSectionView>> = {}) {
  return render(
    <DangerSectionView
      candidateRoleName={() => "Admin"}
      candidates={[
        {
          accessLevel: "ADMIN",
          avatarUrl: null,
          displayName: "dogukan",
          userId: "u-admin",
          username: "dogukan",
        },
      ]}
      confirmation=""
      deleting={false}
      error={null}
      onConfirmationChange={() => undefined}
      onDelete={() => undefined}
      onSelectTarget={() => undefined}
      onToggleAcknowledged={() => undefined}
      onTransfer={() => undefined}
      serverName="Mobile Test"
      transfer={{ acknowledged: false, targetUserId: null }}
      transferring={false}
      {...overrides}
    />,
  );
}

describe("§8.9 Tehlike bölgesi", () => {
  it("**sahip olmayana hiç render edilmez** (00 §5 negatif testi)", () => {
    const html = renderToStaticMarkup(
      <DangerSection
        {...sectionProps({
          currentUserId: "u-admin",
          detail: {
            ...DETAIL,
            server: { ...DETAIL.server, isOwner: false },
          } as WorkspaceServerDetail,
        })}
      />,
    );

    assert.equal(html, "");
  });

  it("yönetici bile olsa çizilmez — pasifleştirme yeterli değil", () => {
    const html = renderToStaticMarkup(
      <DangerSection
        {...sectionProps({
          currentUserId: "u-admin",
          detail: {
            ...DETAIL,
            server: { ...DETAIL.server, isAdmin: true, isOwner: false },
          } as WorkspaceServerDetail,
          permissions: ALL_PERMISSIONS,
        })}
      />,
    );

    assert.equal(html, "");
    assert.equal(html.includes(copy("server.settings.danger.delete.submit")), false);
    assert.equal(html.includes(copy("server.settings.danger.transfer.submit")), false);
  });

  it("iki kartı warning ve danger tonuyla çizer", () => {
    const { settingsSections } = SERVER_METRICS;
    const html = renderDanger();

    assert.ok(
      html.includes(`background:hsl(var(--warning)/${settingsSections.dangerCardBackgroundAlpha})`),
    );
    assert.ok(
      html.includes(`background:hsl(var(--danger)/${settingsSections.dangerCardBackgroundAlpha})`),
    );
    assert.ok(html.includes(copy("server.settings.ownerOnly")));
  });

  it("aday listesi radyo grubudur ve sahip listede yoktur", () => {
    const html = renderDanger();

    assert.match(html, /role="radiogroup"/u);
    assert.match(html, /role="radio"/u);
    assert.ok(html.includes("dogukan"));
    assert.equal(html.includes(">DY<"), false);
  });

  it("alt satır üç durumu sırayla söyler ve düğme ancak ikisi tamamken aktif", () => {
    const none = renderDanger();

    assert.ok(none.includes(copy("server.settings.danger.transfer.note.selectMember")));
    assert.ok(none.includes("background:hsl(var(--surface-tertiary))"));

    const picked = renderDanger({ transfer: { acknowledged: false, targetUserId: "u-admin" } });

    assert.ok(picked.includes(copy("server.settings.danger.transfer.note.acknowledge")));

    const ready = renderDanger({ transfer: { acknowledged: true, targetUserId: "u-admin" } });

    assert.ok(ready.includes("Sahiplik dogukan kullanıcısına geçecek."));
    assert.ok(ready.includes("background:hsl(var(--warning))"));
    assert.ok(ready.includes("cursor:pointer"));
  });

  it("devredilecek üye yoksa liste yerine neden yazar", () => {
    const html = renderDanger({ candidates: [] });

    assert.ok(html.includes(copy("server.settings.danger.transfer.empty")));
  });

  it("silme düğmesi metin birebir eşleşene kadar pasif", () => {
    const idle = renderDanger();

    assert.ok(idle.includes("cursor:not-allowed"));
    assert.ok(idle.includes("border:1px solid hsl(var(--border))"));

    const wrong = renderDanger({ confirmation: "mobile test" });

    assert.ok(wrong.includes("cursor:not-allowed"));

    const exact = renderDanger({ confirmation: "Mobile Test" });

    assert.ok(exact.includes("background:hsl(var(--danger))"));
    assert.ok(exact.includes("border:1px solid hsl(var(--danger))"));
    assert.ok(exact.includes("box-shadow:0 12px 26px -16px hsl(var(--danger))"));
  });

  it("silme kutusunun yer tutucusu sunucu adıdır", () => {
    const html = renderDanger();

    assert.ok(html.includes('placeholder="Mobile Test"'));
  });

  it("ölçüsünü sözlükten alır", () => {
    const { settingsSections } = SERVER_METRICS;
    const html = renderDanger();

    assert.ok(html.includes(`height:${pxToRem(settingsSections.deleteButtonHeight)}`));
    assert.ok(html.includes(`width:${pxToRem(settingsSections.transferRadioSize)}`));
    assert.ok(html.includes(`border-radius:${pxToRem(settingsSections.dangerCardRadius)}`));
  });
});

// ---------------------------------------------------------------------------
// Renk sözleşmesi
// ---------------------------------------------------------------------------

describe("renk yalnız token", () => {
  it("dört bölümün hiçbiri hex ya da rgb() yazmaz", () => {
    const html = [
      renderMembers({ bansExpanded: true, openMenuMemberId: "m-admin" }),
      renderInvites({ openQrInviteId: "i-1", pendingExpanded: true }),
      renderEvents(),
      renderDanger({ transfer: { acknowledged: true, targetUserId: "u-admin" } }),
    ].join("");

    assert.equal(/#[0-9a-fA-F]{3,8}\b/u.test(html.replace(/&#x27;/gu, "")), false);
    assert.equal(/rgba?\(/u.test(html), false);
  });
});
