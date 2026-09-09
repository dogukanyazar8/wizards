import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  ConversationPrivacy,
  GroupMemberPage,
  GroupProfilePanelDTO,
  UserProfilePanelDTO,
} from "@wizards/types";

import { MESSAGING_PRIVACY_QUERY_KEY } from "@/components/messages/privacy-settings-card";
import {
  DANGER_TOAST_KIND,
  ProfileTabSettings,
  dangerToast,
  notifyFailureToast,
  optimisticPatch,
  resolveViewerMemberId,
  successToast,
  withAddPolicy,
  withNotifyLevel,
  withPrivacyFlag,
} from "@/components/messages/profile-tab-settings";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { setConversationNotifyLevelRequest } from "@/lib/dm/client";
import { groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import { dmProfileQueryKeys } from "@/lib/dm/profile-client";
import { getMessagesForLocale } from "@/lib/locale";

const CONVERSATION_ID = "conversation-1";

const PRIVACY: ConversationPrivacy = { readReceipts: true, typingIndicator: true };

function dmPanel(overrides: Partial<UserProfilePanelDTO> = {}): UserProfilePanelDTO {
  return {
    badges: [],
    bio: null,
    blocked: false,
    friendship: null,
    handle: "selin",
    initials: "SA",
    muted: false,
    mutedUntil: null,
    mutualFriends: [],
    mutualFriendTotal: 0,
    mutualServers: [],
    name: "Selin Aksoy",
    notifyLevel: "ALL",
    presence: "online",
    privacy: PRIVACY,
    statusText: null,
    tint: "primary",
    userId: "user-2",
    ...overrides,
  };
}

function groupPanel(overrides: Partial<GroupProfilePanelDTO> = {}): GroupProfilePanelDTO {
  return {
    addPolicy: "ALL",
    avatarColor: "primary",
    conversationId: CONVERSATION_ID,
    createdAt: "2026-03-02T09:00:00.000Z",
    description: null,
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
    pinnedMessages: [],
    viewerRole: "OWNER",
    ...overrides,
  };
}

function memberPage(overrides: Partial<GroupMemberPage> = {}): GroupMemberPage {
  return { items: [], nextCursor: null, total: 0, ...overrides };
}

function render(
  props: Partial<React.ComponentProps<typeof ProfileTabSettings>> = {},
  seed: (client: QueryClient) => void = () => undefined,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(MESSAGING_PRIVACY_QUERY_KEY, PRIVACY);
  seed(client);

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <QueryClientProvider client={client}>
        <ProfileTabSettings conversationId={CONVERSATION_ID} variant="dm" {...props} />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

function renderDm(overrides: Partial<UserProfilePanelDTO> = {}) {
  return render({ variant: "dm" }, (client) => {
    client.setQueryData(dmProfileQueryKeys.profile(CONVERSATION_ID), dmPanel(overrides));
  });
}

function renderGroup(overrides: Partial<GroupProfilePanelDTO> = {}) {
  return render({ variant: "group" }, (client) => {
    client.setQueryData(groupProfileQueryKeys.panel(CONVERSATION_ID), groupPanel(overrides));
  });
}

describe("Ayarlar sekmesi — bölümler (SPEC §15.5)", () => {
  it("DM: bildirim + gizlilik + iki DM satırı; grup segmenti yok", () => {
    const markup = renderDm();

    assert.ok(markup.includes('data-testid="profile-tab-settings"'));
    assert.ok(markup.includes("BİLDİRİM AYARLARI") || markup.includes("Bildirim ayarları"));
    assert.ok(markup.includes('data-testid="profile-notify-group"'));
    assert.ok(markup.includes('data-testid="profile-privacy-card"'));
    assert.ok(!markup.includes('data-testid="profile-add-policy"'));
    assert.ok(markup.includes('data-testid="profile-danger-block"'));
    assert.ok(markup.includes('data-testid="profile-danger-report"'));
  });

  it("grup: segment çizilir, DM satırları çizilmez", () => {
    const markup = renderGroup();

    assert.ok(markup.includes('data-testid="profile-add-policy"'));
    assert.ok(!markup.includes('data-testid="profile-danger-block"'));
    assert.ok(markup.includes('data-testid="profile-danger-clearHistory"'));
    assert.ok(markup.includes('data-testid="profile-danger-deleteGroup"'));
  });

  it("radyo grubu ve segment görünür bölüm etiketlerine bağlı", () => {
    const markup = renderGroup();
    const groups = [...markup.matchAll(/aria-labelledby="([^"]+)"/gu)].map((match) => match[1]);

    assert.equal(groups.length, 2);

    for (const id of groups) {
      assert.ok(markup.includes(`id="${id}"`), `${id} kimliği ağaçta yok`);
    }
  });

  it("panel yüklenirken iskelet, hata olduğunda tek satır", () => {
    const loading = render({ variant: "group" });

    assert.ok(loading.includes('data-testid="profile-settings-skeleton"'));
    assert.ok(!loading.includes('data-testid="profile-tab-settings"'));
  });

  it("seçili bildirim seviyesi panelden okunur", () => {
    const markup = renderDm({ notifyLevel: "NONE", muted: true });

    assert.match(markup, /data-testid="profile-notify-NONE"[^>]*tabindex="0"/u);
  });
});

describe("`KİMLER ÜYE EKLEYEBİLİR` segmenti", () => {
  it("yönetici değiştirebilir", () => {
    const markup = renderGroup({ viewerRole: "ADMIN" });

    assert.ok(markup.includes('data-testid="profile-add-policy"'));
    assert.ok(!markup.includes('aria-readonly="true"'));
  });

  it("üye rolünde salt okunur görünür, gizlenmez", () => {
    const markup = renderGroup({ viewerRole: "MEMBER" });

    assert.ok(markup.includes('data-testid="profile-add-policy"'));
    assert.ok(markup.includes('aria-readonly="true"'));
    assert.equal(markup.match(/data-testid="profile-add-policy-[A-Z]+"/gu)?.length, 2);
    assert.equal(
      markup.match(/data-testid="profile-add-policy-[A-Z]+"[^>]*disabled=""/gu)?.length,
      2,
    );
  });

  it("gerçek radiogroup + iki radio", () => {
    const markup = renderGroup();
    const radios = markup.match(/role="radio"/gu)?.length ?? 0;

    // Üç bildirim kartı + iki segment düğmesi.
    assert.equal(radios, 5);
    assert.equal(markup.match(/role="radiogroup"/gu)?.length, 2);
  });
});

describe("`Kapalı` ile `muted` tek istekte yazılır (tuzak 5)", () => {
  it("uç tek `PATCH` alır ve gövde yalnız `notifyLevel` taşır", async () => {
    const calls: { body: unknown; method: string | undefined; url: string }[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        method: init?.method,
        url: String(input),
      });

      return new Response(JSON.stringify({ notifyLevel: "NONE" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }) as typeof fetch;

    try {
      await setConversationNotifyLevelRequest(CONVERSATION_ID, "NONE");
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "PATCH");
    assert.equal(calls[0]?.url, `/api/v1/dm/${CONVERSATION_ID}/notify`);
    assert.deepEqual(calls[0]?.body, { notifyLevel: "NONE" });
  });

  it("iyimser yama iki alanı birlikte taşır", () => {
    assert.deepEqual(withNotifyLevel(dmPanel(), "NONE").muted, true);
    assert.deepEqual(
      withNotifyLevel(dmPanel({ muted: true, notifyLevel: "NONE" }), "ALL").muted,
      false,
    );
    assert.equal(withNotifyLevel(groupPanel(), "MENTIONS").notifyLevel, "MENTIONS");
    assert.equal(withNotifyLevel(groupPanel(), "MENTIONS").muted, false);
  });
});

describe("iyimser yazma ve geri sarma", () => {
  it("hata eski değeri geri koyar", () => {
    const client = new QueryClient();
    const key = dmProfileQueryKeys.profile(CONVERSATION_ID);
    client.setQueryData(key, dmPanel({ notifyLevel: "MENTIONS" }));

    const patch = optimisticPatch<UserProfilePanelDTO>(client, key, (current) =>
      withNotifyLevel(current, "NONE"),
    );

    assert.equal(client.getQueryData<UserProfilePanelDTO>(key)?.notifyLevel, "NONE");
    assert.equal(client.getQueryData<UserProfilePanelDTO>(key)?.muted, true);

    patch.restore();

    assert.equal(client.getQueryData<UserProfilePanelDTO>(key)?.notifyLevel, "MENTIONS");
    assert.equal(client.getQueryData<UserProfilePanelDTO>(key)?.muted, false);
  });

  it("önbellekte kayıt yoksa geri sarma iyimser değeri kalıcı bırakmaz", () => {
    const client = new QueryClient();
    const patch = optimisticPatch<ConversationPrivacy>(
      client,
      MESSAGING_PRIVACY_QUERY_KEY,
      (current) => withPrivacyFlag(current, "readReceipts", false),
    );

    client.setQueryData(MESSAGING_PRIVACY_QUERY_KEY, {
      readReceipts: false,
      typingIndicator: true,
    });
    patch.restore();

    assert.equal(client.getQueryData(MESSAGING_PRIVACY_QUERY_KEY), undefined);
  });

  it("gizlilik yaması yalnız adlandırılan anahtarı değiştirir", () => {
    assert.deepEqual(withPrivacyFlag(PRIVACY, "typingIndicator", false), {
      readReceipts: true,
      typingIndicator: false,
    });
    assert.deepEqual(withPrivacyFlag(PRIVACY, "readReceipts", false), {
      readReceipts: false,
      typingIndicator: true,
    });
  });

  it("üye ekleme kuralı yaması diğer alanlara dokunmaz", () => {
    const patched = withAddPolicy(groupPanel(), "ADMINS");

    assert.equal(patched.addPolicy, "ADMINS");
    assert.equal(patched.name, "Sürüm 2.4 Ekibi");
    assert.equal(patched.viewerRole, "OWNER");
  });
});

describe("toast kayıtları", () => {
  it("her yıkıcı eylemin bir başarı kaydı var", () => {
    assert.deepEqual(DANGER_TOAST_KIND, {
      block: "userBlocked",
      clearHistory: "historyCleared",
      deleteGroup: "groupDeleted",
      leaveGroup: "groupLeft",
      report: "reportSent",
    });
  });

  it("başarı ve hata aynı şeridi farklı tonda kullanır", () => {
    assert.deepEqual(successToast("groupDeleted"), { kind: "groupDeleted", tone: "success" });
    assert.deepEqual(successToast("userBlocked", { name: "Selin" }), {
      kind: "userBlocked",
      params: { name: "Selin" },
      tone: "success",
    });
    assert.deepEqual(dangerToast(), { kind: "actionFailed", tone: "danger" });
  });

  /**
   * Hata şeridi bir başarı cümlesini kırmızıya boyamaz. `Sohbet geçmişi temizlendi`
   * kırmızı yazılırsa olmamış bir şeyi olmuş gibi söyler; `actionFailed` kendi
   * cümlesini taşır ve kontrol zaten eski değerine sarılmıştır.
   */
  it("hata toast'ı başarı kaydını kırmızıya boyamaz", () => {
    for (const level of ["NONE", "ALL", "MENTIONS"] as const) {
      assert.deepEqual(notifyFailureToast(level), { kind: "actionFailed", tone: "danger" });
    }

    for (const kind of Object.values(DANGER_TOAST_KIND)) {
      assert.notEqual(dangerToast().kind, kind, `${kind} hata tonunda basılıyor`);
    }
  });
});

describe("`Gruptan ayrıl` — kendi satırını bulma", () => {
  it("ilk sayfada bulur ve ikinci istek atmaz", async () => {
    let calls = 0;
    const userId = await resolveViewerMemberId(CONVERSATION_ID, {
      fetchPage: async () => {
        calls += 1;
        return memberPage({
          items: [
            {
              initials: "SA",
              isSelf: false,
              lastSeenAt: null,
              name: "Selin",
              presence: "online",
              role: "MEMBER",
              statusText: null,
              tint: "primary",
              userId: "user-2",
            },
            {
              initials: "DY",
              isSelf: true,
              lastSeenAt: null,
              name: "Doğukan",
              presence: "online",
              role: "OWNER",
              statusText: null,
              tint: "success",
              userId: "user-1",
            },
          ],
          total: 2,
        });
      },
    });

    assert.equal(userId, "user-1");
    assert.equal(calls, 1);
  });

  it("imleç varsa sonraki sayfaya geçer", async () => {
    const pages: GroupMemberPage[] = [
      memberPage({ nextCursor: "cursor-2", total: 2 }),
      memberPage({
        items: [
          {
            initials: "DY",
            isSelf: true,
            lastSeenAt: null,
            name: "Doğukan",
            presence: "online",
            role: "MEMBER",
            statusText: null,
            tint: "success",
            userId: "user-9",
          },
        ],
        total: 2,
      }),
    ];
    const seen: (string | null | undefined)[] = [];

    const userId = await resolveViewerMemberId(CONVERSATION_ID, {
      fetchPage: async (_conversationId, cursor) => {
        seen.push(cursor);
        return pages[seen.length - 1] ?? memberPage();
      },
    });

    assert.equal(userId, "user-9");
    assert.deepEqual(seen, [undefined, "cursor-2"]);
  });

  it("önbellekteki sayfa varsa hiç istek atmaz", async () => {
    let calls = 0;
    const userId = await resolveViewerMemberId(CONVERSATION_ID, {
      fetchPage: async () => {
        calls += 1;
        return memberPage();
      },
      seed: memberPage({
        items: [
          {
            initials: "DY",
            isSelf: true,
            lastSeenAt: null,
            name: "Doğukan",
            presence: "idle",
            role: "ADMIN",
            statusText: null,
            tint: "warning",
            userId: "user-7",
          },
        ],
        total: 1,
      }),
    });

    assert.equal(userId, "user-7");
    assert.equal(calls, 0);
  });

  it("kendi satırı yoksa null döner ve sonsuz dönmez", async () => {
    let calls = 0;
    const userId = await resolveViewerMemberId(CONVERSATION_ID, {
      fetchPage: async () => {
        calls += 1;
        return memberPage({ nextCursor: "always", total: 400 });
      },
      maxPages: 3,
    });

    assert.equal(userId, null);
    assert.equal(calls, 3);
  });
});
