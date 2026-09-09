import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GroupProfilePanelDTO, UserProfilePanelDTO } from "@wizards/types";

import { ProfileBadgeGrid } from "@/components/messages/profile-badge-grid";
import {
  ProfileMutualFriends,
  ProfileMutualServers,
} from "@/components/messages/profile-mutual-lists";
import { ProfileRelationshipCard } from "@/components/messages/profile-relationship-card";
import { ProfileTabGeneral } from "@/components/messages/profile-tab-general";
import { AccountPreferenceProvider } from "@/components/providers/account-preference-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import { dmProfileQueryKeys } from "@/lib/dm/profile-client";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş6 · §15.3 — `Genel` sekmesinin bütünü.
 *
 * Bu dosyanın en pahalı iddiası **sıra**: tarih kartı rozet ızgarasının altında durmalı.
 * SPEC bunu ayrı bir kabul kriteri yaptı çünkü iki bölüm de "profilin üstü" gibi
 * duruyor ve yer değiştirdiklerinde hiçbir test kırılmazdı — DOM sırası testle
 * kilitlenmezse bir sonraki düzenlemede sessizce takas edilir.
 *
 * Sorgu **tohumlanmış** bir `QueryClient` üzerinden geliyor: `useQuery` önbellekteki
 * veriyi ilk render'da senkron döndürür, sunucu render'ında hiçbir istek açılmaz.
 */

const TR = getMessagesForLocale("tr");
const CONVERSATION_ID = "conv-1";

function dmProfile(overrides: Partial<UserProfilePanelDTO> = {}): UserProfilePanelDTO {
  return {
    badges: [
      { earnedAt: "2026-01-01T00:00:00.000Z", expiresAt: null, id: "verified", tier: 1 },
      { earnedAt: "2026-01-02T00:00:00.000Z", expiresAt: null, id: "voice", tier: 1 },
    ],
    bio: "Ürün tasarımcısı · arayüz ve hareket.",
    blocked: false,
    friendship: {
      durationMonths: 18,
      metViaServerName: "Whispr Topluluğu",
      since: "2025-02-14T09:00:00.000Z",
    },
    handle: "selin",
    initials: "SA",
    muted: false,
    mutedUntil: null,
    mutualFriends: [
      { id: "u1", initials: "MK", name: "Mert Kaya", presence: "online", tint: "success" },
    ],
    mutualFriendTotal: 4,
    mutualServers: [
      { id: "s1", initials: "WT", name: "Whispr Topluluğu", onlineCount: 12, tint: "primary" },
    ],
    name: "Selin Aksoy",
    notifyLevel: "ALL",
    presence: "online",
    privacy: { readReceipts: true, typingIndicator: true },
    statusText: null,
    tint: "primary",
    userId: "u9",
    ...overrides,
  };
}

function groupProfile(overrides: Partial<GroupProfilePanelDTO> = {}): GroupProfilePanelDTO {
  return {
    addPolicy: "ALL",
    avatarColor: "primary",
    conversationId: CONVERSATION_ID,
    createdAt: "2026-03-02T08:00:00.000Z",
    description: "Sürüm 2.4 dağıtımını yürüten ekip.",
    historyVisibility: "ALL",
    initials: "S2",
    invite: null,
    memberCount: 5,
    muted: false,
    mutedUntil: null,
    name: "Sürüm 2.4 Ekibi",
    notifyLevel: "ALL",
    onlineCount: 3,
    ownerName: "Doğukan Yazar",
    pinnedMessages: [
      {
        authorName: "Doğukan Yazar",
        excerpt: "Yayın kontrol listesi burada",
        messageId: "m1",
        pinnedAt: "2026-08-12T14:00:00.000Z",
        removable: true,
      },
    ],
    viewerRole: "OWNER",
    ...overrides,
  };
}

function withProviders(client: QueryClient, node: React.ReactNode): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      <AccountPreferenceProvider
        locale="tr"
        preferences={{
          dateFormat: "LOCALE",
          interfaceDensity: "COMFORTABLE",
          timeFormat: "H24",
          timeZone: "Europe/Istanbul",
        }}
      >
        <QueryClientProvider client={client}>{node}</QueryClientProvider>
      </AccountPreferenceProvider>
    </LocaleProvider>,
  );
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderDm(profile: UserProfilePanelDTO | null = dmProfile()): string {
  const client = newClient();
  if (profile) {
    client.setQueryData([...dmProfileQueryKeys.profile(CONVERSATION_ID)], profile);
  }

  return withProviders(client, <ProfileTabGeneral conversationId={CONVERSATION_ID} variant="dm" />);
}

function renderGroup(profile: GroupProfilePanelDTO | null = groupProfile()): string {
  const client = newClient();
  if (profile) {
    client.setQueryData([...groupProfileQueryKeys.panel(CONVERSATION_ID)], profile);
  }

  return withProviders(
    client,
    <ProfileTabGeneral conversationId={CONVERSATION_ID} variant="group" />,
  );
}

describe("ProfileTabGeneral — DM kolu, bölüm sırası", () => {
  /** Kabul kriteri: tarih kartı rozet ızgarasının **altında**. */
  it("altı bölüm SPEC sırasında çizilir", () => {
    const markup = renderDm();
    const order = [
      'data-testid="profile-about"',
      'data-testid="profile-badges"',
      'data-testid="profile-relationship-card"',
      'data-testid="profile-mutual-servers"',
      'data-testid="profile-mutual-friends"',
    ].map((marker) => {
      const index = markup.indexOf(marker);
      assert.notEqual(index, -1, `${marker} çizilmemiş`);
      return index;
    });

    assert.deepEqual(
      [...order].sort((left, right) => left - right),
      order,
      markup,
    );
  });

  it("tarih kartı rozet ızgarasından SONRA gelir", () => {
    const markup = renderDm();

    assert.ok(
      markup.indexOf('data-testid="profile-relationship-card"') >
        markup.indexOf('data-testid="profile-badges"'),
      "tarih kartı rozetlerin üstüne kaymış",
    );
  });
});

describe("ProfileTabGeneral — boş bölüm çizilmez", () => {
  it("bio boşken `HAKKINDA` çizilmiyor", () => {
    assert.ok(!renderDm(dmProfile({ bio: null })).includes('data-testid="profile-about"'));
    assert.ok(!renderDm(dmProfile({ bio: "   " })).includes('data-testid="profile-about"'));
    assert.ok(renderDm().includes('data-testid="profile-about"'));
  });

  it("arkadaş değilken tarih kartı çizilmiyor (K7)", () => {
    const markup = renderDm(dmProfile({ friendship: null }));

    assert.ok(!markup.includes('data-testid="profile-relationship-card"'), markup);
    // Kalan bölümler etkilenmez.
    assert.ok(markup.includes('data-testid="profile-badges"'));
    assert.ok(markup.includes('data-testid="profile-mutual-servers"'));
  });

  it("ortak sunucu yokken bölüm düşer, ortak arkadaşlar kalır", () => {
    const markup = renderDm(dmProfile({ mutualServers: [] }));

    assert.ok(!markup.includes('data-testid="profile-mutual-servers"'));
    assert.ok(markup.includes('data-testid="profile-mutual-friends"'));
  });

  it("rozet yokken ızgara düşer, tarih kartı kalır", () => {
    const markup = renderDm(dmProfile({ badges: [] }));

    assert.ok(!markup.includes('data-testid="profile-badges"'));
    assert.ok(markup.includes('data-testid="profile-relationship-card"'));
  });
});

describe("ProfileTabGeneral — grup kolu", () => {
  it("başlık `GRUP AÇIKLAMASI`, rozet ve ortak listeler yok, sabitlenenler var", () => {
    const markup = renderGroup();

    assert.ok(markup.includes(TR["messages.profile.section.groupDescription"] ?? "—"), markup);
    assert.ok(!markup.includes(TR["messages.profile.section.about"] ?? "—"), markup);
    assert.ok(!markup.includes('data-testid="profile-badges"'));
    assert.ok(!markup.includes('data-testid="profile-mutual-servers"'));
    assert.ok(!markup.includes('data-testid="profile-mutual-friends"'));
    assert.ok(markup.includes('data-testid="profile-pinned"'), markup);
  });

  it("tarih kartı kuruluş + kurucu satırını çizer", () => {
    const markup = renderGroup();

    assert.ok(markup.includes("tarihinde kuruldu"), markup);
    assert.ok(markup.includes("Kurucu: Doğukan Yazar"), markup);
  });

  it("sabitlenen yoksa bölüm düşer, tarih kartı kalır", () => {
    const markup = renderGroup(groupProfile({ pinnedMessages: [] }));

    assert.ok(!markup.includes('data-testid="profile-pinned"'));
    assert.ok(markup.includes('data-testid="profile-relationship-card"'));
  });

  /** DM kolunun sorgusu grup kolunda **hiç** kurulmaz — sekme kendi verisini çeker. */
  it("grup kolunda DM profil sorgusu koşmaz", () => {
    const client = newClient();
    client.setQueryData([...groupProfileQueryKeys.panel(CONVERSATION_ID)], groupProfile());

    withProviders(client, <ProfileTabGeneral conversationId={CONVERSATION_ID} variant="group" />);

    assert.equal(
      client.getQueryCache().find({ queryKey: [...dmProfileQueryKeys.profile(CONVERSATION_ID)] }),
      undefined,
    );
  });
});

describe("ProfileTabGeneral — yükleniyor", () => {
  it("veri gelmeden her bölüm kendi iskeletini gösterir", () => {
    const markup = renderDm(null);

    assert.ok(markup.includes('data-testid="profile-tab-general"'));
    assert.ok(markup.includes('data-testid="profile-about"'));
    assert.ok(markup.includes('data-testid="profile-badges"'));
    assert.ok(markup.includes('data-testid="profile-relationship-skeleton"'));
    assert.ok(markup.includes('data-testid="profile-mutual-servers"'));
  });
});

/**
 * Bölümler birbirini beklemez ve birbirini düşürmez. Bugün DM kolunda tek uç var
 * (Ş1: "One read; the panel does not fan out to six endpoints"), yani pratikte dördü
 * birlikte gecikir; sınanan şey **bileşim**: bir bölüm hata verirken diğerleri
 * çizilmeye devam ediyor mu.
 */
describe("ProfileTabGeneral — bölümler bağımsız", () => {
  it("bir bölüm hata verince kalanı çizilir", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        <AccountPreferenceProvider
          locale="tr"
          preferences={{
            dateFormat: "LOCALE",
            interfaceDensity: "COMFORTABLE",
            timeFormat: "H24",
            timeZone: "Europe/Istanbul",
          }}
        >
          <ProfileBadgeGrid badges={dmProfile().badges} />
          <ProfileRelationshipCard facts={null} failed />
          <ProfileMutualServers servers={dmProfile().mutualServers} />
          <ProfileMutualFriends friends={dmProfile().mutualFriends} total={4} />
        </AccountPreferenceProvider>
      </LocaleProvider>,
    );

    assert.ok(markup.includes('data-testid="profile-relationship-error"'), markup);
    assert.ok(markup.includes('data-testid="profile-badges"'));
    assert.ok(markup.includes('data-testid="profile-mutual-servers"'));
    assert.ok(markup.includes('data-testid="profile-mutual-friends"'));
  });

  it("yalnız bir bölüm gecikirken diğerleri veriyi çizer", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        <ProfileMutualServers loading servers={[]} />
        <ProfileMutualFriends friends={dmProfile().mutualFriends} total={1} />
      </LocaleProvider>,
    );

    assert.ok(markup.includes("animate-pulse"), markup);
    assert.ok(markup.includes("Mert Kaya"), markup);
  });
});
