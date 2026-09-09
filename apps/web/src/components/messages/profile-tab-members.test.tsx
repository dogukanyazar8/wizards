import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GroupMemberPage, GroupMemberRowDTO, GroupProfilePanelDTO } from "@wizards/types";

import {
  canAddMembers,
  formatMemberStatus,
  groupProfileMembers,
  ProfileTabMembers,
} from "@/components/messages/profile-tab-members";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — §15.4 `Üyeler` sekmesi.
 *
 * Sekme kendi verisini kendi çekiyor; testler onu bir `QueryClient` önbelleğine **hazır
 * veri** koyarak sürüyor. Sahte bir `fetch` kurmak ağın ne döndüğünü test etmek olurdu,
 * sekmenin ne çizdiğini değil.
 */

const CONVERSATION_ID = "conv-1";
const NOW = new Date("2026-08-27T12:00:00.000Z");

function panel(overrides: Partial<GroupProfilePanelDTO> = {}): GroupProfilePanelDTO {
  return {
    addPolicy: "ALL",
    avatarColor: "primary",
    conversationId: CONVERSATION_ID,
    createdAt: "2026-03-02T09:00:00.000Z",
    description: "Sürüm 2.4 dağıtımını yürüten ekip.",
    historyVisibility: "ALL",
    initials: "S2",
    invite: {
      code: "s24-ekibi",
      expiresAt: "2026-09-03T12:00:00.000Z",
      url: "https://whispr.app/g/s24-ekibi",
    },
    memberCount: 5,
    muted: false,
    mutedUntil: null,
    name: "Sürüm 2.4 Ekibi",
    notifyLevel: "ALL",
    onlineCount: 3,
    ownerName: "Doğukan Yazar",
    pinnedMessages: [],
    viewerRole: "MEMBER",
    ...overrides,
  };
}

function member(overrides: Partial<GroupMemberRowDTO> = {}): GroupMemberRowDTO {
  return {
    initials: "SA",
    isSelf: false,
    lastSeenAt: null,
    name: "Selin Aksoy",
    presence: "online",
    role: "MEMBER",
    statusText: null,
    tint: "success",
    userId: "u-2",
    ...overrides,
  };
}

function page(overrides: Partial<GroupMemberPage> = {}): GroupMemberPage {
  return {
    items: [member()],
    nextCursor: null,
    total: 1,
    ...overrides,
  };
}

function seed(
  client: QueryClient,
  input: { members?: GroupMemberPage; panel?: GroupProfilePanelDTO } = {},
) {
  if (input.panel) {
    client.setQueryData([...groupProfileQueryKeys.panel(CONVERSATION_ID)], input.panel);
  }

  if (input.members) {
    client.setQueryData([...groupProfileQueryKeys.members(CONVERSATION_ID)], {
      pageParams: [null],
      pages: [input.members],
    });
  }
}

function render(
  client: QueryClient,
  props: Partial<React.ComponentProps<typeof ProfileTabMembers>> = {},
) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <ProfileTabMembers
          conversationId={CONVERSATION_ID}
          now={NOW}
          onAddMembers={() => undefined}
          onSelectMember={() => undefined}
          variant="group"
          {...props}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("üye ekleme yetkisi (SPEC §15.4)", () => {
  it("ADMINS kuralında üye ekleyemez, yönetici ekleyebilir", () => {
    assert.equal(canAddMembers("ADMINS", "MEMBER"), false);
    assert.equal(canAddMembers("ADMINS", "ADMIN"), true);
    assert.equal(canAddMembers("ADMINS", "OWNER"), true);
  });

  it("ALL kuralında herkes ekleyebilir", () => {
    assert.equal(canAddMembers("ALL", "MEMBER"), true);
  });
});

describe("üye gruplaması", () => {
  const owner = member({ name: "Doğukan Yazar", role: "OWNER", userId: "u-1" });
  const admin = member({ name: "Selin Aksoy", role: "ADMIN", userId: "u-2" });
  const plain = member({ name: "Mert Kaya", role: "MEMBER", userId: "u-3" });

  it("yöneticiyi ve üyeyi ayırır, boş grubu atlar", () => {
    const groups = groupProfileMembers([owner, admin, plain], 3, false);

    assert.deepEqual(
      groups.map((group) => group.key),
      ["admins", "members"],
    );
    assert.equal(groups[0]?.rows.length, 2);
    assert.equal(groups[1]?.rows.length, 1);
    assert.equal(groupProfileMembers([owner], 1, false).length, 1);
  });

  /**
   * `total` bütün listeyi sayıyor, katmanı değil. Yüklenen üye satırlarını saymak son
   * sayfaya kadar eksik bir sayı basardı; `total - yönetici` her sayfada doğru.
   */
  it("üye sayacı total'dan türer, yüklenen satırdan değil", () => {
    const groups = groupProfileMembers([owner, admin, plain], 40, true);

    assert.equal(groups[0]?.count, 2);
    assert.equal(groups[1]?.count, 38);
  });

  /**
   * İlk sayfa hâlâ yöneticiyle doluyken kaç yönetici olduğu **bilinmiyor**; sayaç
   * basılmıyor. Yanlış bir sayı, sayısız bir başlıktan kötüdür.
   */
  it("yöneticiler bitmediyse sayaç çizilmez", () => {
    const groups = groupProfileMembers([owner, admin], 40, true);

    assert.equal(groups[0]?.count, null);
    assert.equal(groups.length, 1);
  });
});

describe("üye durum satırı", () => {
  const labels = {
    dnd: "Rahatsız etmeyin",
    idle: "Boşta",
    offline: "Çevrimdışı",
    online: "Çevrimiçi",
    today: "bugün",
    yesterday: "dün",
  };

  /** Kişinin kendi cümlesi çevrilmez ve süslenmez. */
  it("statusText her şeyi yener", () => {
    assert.equal(
      formatMemberStatus(
        { lastSeenAt: null, presence: "dnd", statusText: "Odak modu · 25 dk" },
        NOW,
        "tr",
        labels,
      ),
      "Odak modu · 25 dk",
    );
  });

  it("presence etiketi düşer", () => {
    assert.equal(
      formatMemberStatus(
        { lastSeenAt: null, presence: "idle", statusText: null },
        NOW,
        "tr",
        labels,
      ),
      "Boşta",
    );
  });

  it("çevrimdışıda son görülme eklenir", () => {
    const text = formatMemberStatus(
      { lastSeenAt: "2026-08-26T19:10:00.000Z", presence: "offline", statusText: null },
      NOW,
      "tr",
      labels,
    );

    assert.match(text, /^Çevrimdışı · dün /);
  });

  it("son görülme yoksa yalnız çevrimdışı", () => {
    assert.equal(
      formatMemberStatus(
        { lastSeenAt: null, presence: "offline", statusText: null },
        NOW,
        "tr",
        labels,
      ),
      "Çevrimdışı",
    );
  });
});

describe("sekme gövdesi", () => {
  /**
   * Kural 7'nin tembel sekmesi bir `enabled` bayrağında değil, bileşen sınırında: DM'de
   * `Üyeler` sekmesi hiç yok, dolayısıyla sorgusu da **hiç kurulmuyor**.
   */
  it("DM'de hiçbir şey çizmez ve hiçbir sorgu kurmaz", () => {
    const client = newClient();
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <ProfileTabMembers conversationId={CONVERSATION_ID} variant="dm" />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    assert.equal(markup, "");
    assert.equal(client.getQueryCache().getAll().length, 0);
  });

  it("grupta iki sorguyu paralel kurar", () => {
    const client = newClient();

    render(client);

    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey.join("/"))
      .sort();

    assert.deepEqual(keys, [
      groupProfileQueryKeys.members(CONVERSATION_ID).join("/"),
      groupProfileQueryKeys.panel(CONVERSATION_ID).join("/"),
    ]);
  });

  /**
   * Sunucu zaten reddediyor; buton **çizilmiyor**. Pasif bir buton, kullanıcının
   * yapabileceği bir şey olduğunu söyler.
   */
  it("ADMINS kuralında üyeye Üye ekle butonu çizilmez", () => {
    const client = newClient();
    seed(client, { members: page(), panel: panel({ addPolicy: "ADMINS", viewerRole: "MEMBER" }) });

    assert.doesNotMatch(render(client), /data-testid="profile-members-add"/);
  });

  it("ALL kuralında üyeye de çizilir", () => {
    const client = newClient();
    seed(client, { members: page(), panel: panel({ addPolicy: "ALL", viewerRole: "MEMBER" }) });

    const markup = render(client);

    assert.match(markup, /data-testid="profile-members-add"/);
    assert.match(markup, /Üye ekle/);
  });

  it("Sen pill'i yalnız kendi satırında", () => {
    const client = newClient();
    seed(client, {
      members: page({
        items: [
          member({ isSelf: true, name: "Doğukan Yazar", role: "OWNER", userId: "u-1" }),
          member(),
        ],
        total: 2,
      }),
      panel: panel(),
    });

    const markup = render(client);

    assert.equal(markup.match(/data-testid="profile-member-self"/g)?.length, 1);
  });

  it("yönetici ve üye başlıklarını sayacıyla çizer", () => {
    const client = newClient();
    seed(client, {
      members: page({
        items: [member({ role: "OWNER", userId: "u-1" }), member(), member({ userId: "u-3" })],
        total: 3,
      }),
      panel: panel(),
    });

    const markup = render(client);

    assert.match(markup, /data-testid="profile-members-group-admins"/);
    assert.match(markup, /data-testid="profile-members-group-members"/);
    assert.ok(
      markup.indexOf("profile-members-group-admins") <
        markup.indexOf("profile-members-group-members"),
    );
  });

  /**
   * Ş2/Ş3'ün ortak uyarısı: kısa bir sayfa listenin sonu **değil**. "Daha fazla" satırı
   * imlece bakıyor, öğe sayısına değil — sıfır öğeli ama imleçli bir sayfa hâlâ devam eder.
   */
  it("boş sayfa ama dolu imleç: Daha fazla satırı kalır", () => {
    const client = newClient();
    seed(client, {
      members: page({ items: [], nextCursor: "cursor-2", total: 40 }),
      panel: panel(),
    });

    assert.match(render(client), /data-testid="profile-members-more"/);
  });

  it("imleç boşsa Daha fazla satırı yok", () => {
    const client = newClient();
    seed(client, { members: page(), panel: panel() });

    assert.doesNotMatch(render(client), /data-testid="profile-members-more"/);
  });

  it("veri gelmeden her bölüm kendi iskeletini gösterir", () => {
    const client = newClient();
    const markup = render(client);

    assert.match(markup, /data-testid="profile-members-header-skeleton"/);
    assert.match(markup, /data-testid="profile-members-skeleton"/);
  });

  /** Satır gerçek `button` — ama yalnız gidilecek bir yer varken. */
  it("seçim kancası varken satır button, yokken değil", () => {
    const withHandler = newClient();
    seed(withHandler, { members: page(), panel: panel() });
    assert.match(render(withHandler), /<button[^>]+data-testid="profile-member-row"/);

    const withoutHandler = newClient();
    seed(withoutHandler, { members: page(), panel: panel() });
    const markup = render(withoutHandler, { onSelectMember: undefined });

    assert.match(markup, /<div[^>]+data-testid="profile-member-row"/);
    assert.doesNotMatch(markup, /<button[^>]+data-testid="profile-member-row"/);
  });
});
