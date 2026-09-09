import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  type GroupMemberPage,
  type GroupProfilePanelDTO,
  type InviteCandidateDTO,
  type InviteCandidatePage,
} from "@wizards/types";

import {
  AddMembersModal,
  AddMembersModalBody,
  canSubmitInviteSelection,
  exceedsInviteCeiling,
  INVITE_MEMBER_STACK_MAX,
  resolveAddMembersOutcome,
  toMembersAddedToast,
} from "@/components/messages/add-members-modal";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import { inviteCandidateQueryKeys } from "@/lib/dm/invite-candidates-client";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş10 — §16 üye ekle penceresi.
 *
 * Pencere kendi verisini kendi çekiyor; testler onu bir `QueryClient` önbelleğine hazır
 * veri koyarak sürüyor (Ş7'nin emsali). Kabuk (`Modal`) portala çiziyor ve sunucu
 * tarafında hiç render edilmiyor, o yüzden gövde ayrıca dışa açık.
 */

const CONVERSATION_ID = "group-1";
const NOW = new Date("2026-08-27T12:00:00.000Z");

function panel(overrides: Partial<GroupProfilePanelDTO> = {}): GroupProfilePanelDTO {
  return {
    addPolicy: "ALL",
    avatarColor: "primary",
    conversationId: CONVERSATION_ID,
    createdAt: "2026-03-02T09:00:00.000Z",
    description: null,
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
    viewerRole: "OWNER",
    ...overrides,
  };
}

function candidate(overrides: Partial<InviteCandidateDTO> = {}): InviteCandidateDTO {
  return {
    initials: "CÖ",
    name: "Can Öztürk",
    presence: "online",
    statusText: null,
    tint: "primary",
    userId: "user-2",
    ...overrides,
  };
}

function candidatePage(overrides: Partial<InviteCandidatePage> = {}): InviteCandidatePage {
  return {
    alreadyMemberCount: 5,
    items: [candidate(), candidate({ initials: "AN", name: "Alice Nowak", userId: "user-3" })],
    nextCursor: null,
    ...overrides,
  };
}

function roster(): GroupMemberPage {
  return {
    items: ["DY", "SA", "MK", "EŞ", "TK"].map((initials, index) => ({
      initials,
      isSelf: false,
      lastSeenAt: null,
      name: `Üye ${index}`,
      presence: "offline" as const,
      role: "MEMBER" as const,
      statusText: null,
      tint: "success" as const,
      userId: `member-${index}`,
    })),
    nextCursor: null,
    total: 5,
  };
}

function seed(
  client: QueryClient,
  input: {
    candidates?: InviteCandidatePage | undefined;
    members?: GroupMemberPage | undefined;
    panel?: GroupProfilePanelDTO | undefined;
    query?: string;
  } = {},
) {
  if (input.panel) {
    client.setQueryData([...groupProfileQueryKeys.panel(CONVERSATION_ID)], input.panel);
  }

  if (input.candidates) {
    client.setQueryData([...inviteCandidateQueryKeys.list(CONVERSATION_ID, input.query ?? "")], {
      pageParams: [null],
      pages: [input.candidates],
    });
  }

  if (input.members) {
    client.setQueryData([...groupProfileQueryKeys.members(CONVERSATION_ID)], {
      pageParams: [null],
      pages: [input.members],
    });
  }
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function render(
  client: QueryClient,
  props: Partial<React.ComponentProps<typeof AddMembersModalBody>> = {},
) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <AddMembersModalBody
          conversationId={CONVERSATION_ID}
          expiry="7d"
          now={NOW}
          onClearSelection={() => undefined}
          onClose={() => undefined}
          onSelectExpiry={() => undefined}
          onToggleSelection={() => undefined}
          open
          selection={[]}
          {...props}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("250 tavanı", () => {
  it("mevcut üye + seçim tavanı aşarsa gönderilemez", () => {
    assert.equal(
      exceedsInviteCeiling({ memberCount: GROUP_DM_MAX_PARTICIPANTS - 1, selectionCount: 2 }),
      true,
    );
    assert.equal(
      canSubmitInviteSelection({ memberCount: GROUP_DM_MAX_PARTICIPANTS - 1, selectionCount: 2 }),
      false,
    );
  });

  it("tam tavanda duran seçim geçerlidir", () => {
    assert.equal(
      exceedsInviteCeiling({ memberCount: GROUP_DM_MAX_PARTICIPANTS - 1, selectionCount: 1 }),
      false,
    );
    assert.equal(
      canSubmitInviteSelection({ memberCount: GROUP_DM_MAX_PARTICIPANTS - 1, selectionCount: 1 }),
      true,
    );
  });

  it("seçim yoksa gönderilemez", () => {
    assert.equal(canSubmitInviteSelection({ memberCount: 5, selectionCount: 0 }), false);
  });

  it("alt bar tavana çarpınca sınırı söyler ve buton pasifleşir", () => {
    const client = newClient();
    seed(client, {
      candidates: candidatePage(),
      panel: panel({ memberCount: GROUP_DM_MAX_PARTICIPANTS }),
    });

    const markup = render(client, { selection: ["user-2"] });

    assert.match(markup, /Grup en çok 250 üye alabilir/);
    assert.match(markup, /data-testid="invite-submit"[^>]*disabled/);
  });
});

describe("başlık ve alt bar", () => {
  it("başlık grubu ve 5 / 250 sayacını yazar", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /Sürüm 2.4 Ekibi · 5 \/ 250 üye/);
    assert.match(markup, /Üye ekle/);
  });

  it("seçim yokken alt bar yönlendirir, buton nötr ve pasif", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /Eklemek için arkadaş seç ya da bağlantı paylaş/);
    assert.match(markup, /data-testid="invite-submit"[^>]*disabled/);
    assert.match(markup, /background:hsl\(var\(--surface-tertiary\)\)/);
    assert.match(markup, />Ekle</);
  });

  it("seçimle birlikte sayaç ve buton etiketi değişir", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client, { selection: ["user-2"] });

    assert.match(markup, /1 kişi seçildi · grup 6 üye olur/);
    assert.match(markup, /1 kişiyi ekle/);
    assert.doesNotMatch(markup, /data-testid="invite-submit"[^>]*disabled/);
  });

  it("iki kişide sayaç ve etiket çoğullaşır", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client, { selection: ["user-2", "user-3"] });

    assert.match(markup, /2 kişi seçildi · grup 7 üye olur/);
    assert.match(markup, /2 kişiyi ekle/);
  });
});

describe("seçim çipleri", () => {
  it("seçim yokken boş satır çizilir", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /Henüz kimse seçilmedi/);
    assert.doesNotMatch(markup, /data-testid="invite-chips"/);
  });

  it("çip gerçek buton ve aria-label taşır", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client, { selection: ["user-2"] });

    assert.match(markup, /data-testid="invite-chips"/);
    assert.match(markup, /aria-label="Can Öztürk seçimini kaldır"/);
    assert.match(markup, /data-testid="invite-chip-remove-user-2"/);
  });

  it("başka bir aramada seçilen kişi çip olarak kalır", () => {
    const client = newClient();
    // Görünen sayfada `user-2` yok; o yalnız daha önce yazılan `can` aramasının
    // önbelleğinde. Çip yine de çizilmeli — yoksa seçim sayılıyor ama kaldırılamıyor.
    seed(client, {
      candidates: candidatePage({
        items: [candidate({ initials: "DY", name: "Deniz Yıldız", userId: "user-4" })],
      }),
      panel: panel(),
    });
    seed(client, {
      candidates: candidatePage({ items: [candidate()] }),
      query: "can",
    });

    const markup = render(client, { selection: ["user-2"] });

    assert.match(markup, /data-testid="invite-chip-remove-user-2"/);
    assert.doesNotMatch(markup, /data-testid="invite-candidate-user-2"/);
  });
});

describe("aday listesi", () => {
  it("listbox çoklu seçim ilan eder ve satırlar option olur", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /role="listbox"/);
    assert.match(markup, /aria-multiselectable="true"/);
    assert.equal(markup.split('role="option"').length - 1, 2);
  });

  it("seçili aday aria-selected taşır", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client, { selection: ["user-3"] });

    assert.match(markup, /aria-selected="true"[^>]*data-testid="invite-candidate-user-3"/);
    assert.match(markup, /aria-selected="false"[^>]*data-testid="invite-candidate-user-2"/);
  });

  it("sayaç eklenebilir aday sayısını söyler", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    assert.match(render(client), /2 eklenebilir/);
  });

  it("aday kalmadıysa boş satır çizilir", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage({ items: [] }), panel: panel() });

    const markup = render(client);

    assert.match(markup, /Eklenebilecek arkadaşın yok/);
    assert.doesNotMatch(markup, /role="listbox"/);
  });

  it("ilk sayfa gelene kadar iskelet çizilir", () => {
    const client = newClient();
    seed(client, { panel: panel() });

    assert.match(render(client), /data-testid="invite-candidates-skeleton"/);
  });

  it("imleç varsa daha fazla satırı çıkar", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage({ nextCursor: "abc" }), panel: panel() });

    assert.match(render(client), /data-testid="invite-candidates-more"/);
  });
});

describe("zaten üye yığını", () => {
  it("sayı uçtan gelir, yüzler önbellekteki rosterdan", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), members: roster(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /5 kişi zaten üye/);
    // Yığın dörtte kesilir: beşinci baş harf çizilmez.
    assert.match(markup, /DY/);
    assert.match(markup, /EŞ/);
    assert.doesNotMatch(markup, />TK</);
    assert.equal(INVITE_MEMBER_STACK_MAX, 4);
  });

  it("roster önbellekte yoksa yalnız sayı çizilir — ikinci istek atılmaz", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /5 kişi zaten üye/);
    assert.doesNotMatch(markup, />DY</);
  });
});

describe("bağlantıyla davet", () => {
  it("kutu ve süre segmenti gövdeye giriyor", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /data-testid="invite-link-box"/);
    assert.match(markup, /data-testid="invite-expiry-segment"/);
    assert.match(markup, /whispr\.app\/g\/s24-ekibi/);
  });

  it("üye rolündeki viewer segmenti görmez", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel({ viewerRole: "MEMBER" }) });

    const markup = render(client);

    assert.doesNotMatch(markup, /data-testid="invite-expiry-segment"/);
    assert.match(markup, /data-testid="invite-link-url"/);
  });
});

describe("ekleme sonucu", () => {
  it("başarıda modal kapanır, seçim düşer, toast basılır", () => {
    const outcome = resolveAddMembersOutcome({ names: ["Can Öztürk"], ok: true });

    assert.equal(outcome.closeModal, true);
    assert.equal(outcome.clearSelection, true);
    assert.deepEqual(outcome.toast, {
      kind: "membersAdded",
      params: { name: "Can Öztürk" },
      tone: "success",
    });
  });

  it("başarısızlıkta modal açık kalır ve seçim korunur", () => {
    const outcome = resolveAddMembersOutcome({ ok: false });

    assert.equal(outcome.closeModal, false);
    assert.equal(outcome.clearSelection, false);
    assert.deepEqual(outcome.toast, { kind: "actionFailed", tone: "danger" });
  });

  it("birden fazla kişide toast sayıyı taşır", () => {
    assert.deepEqual(toMembersAddedToast(["Can Öztürk", "Alice Nowak", "Deniz Yıldız"]), {
      kind: "membersAdded",
      params: { count: 2, name: "Can Öztürk" },
      tone: "success",
    });
  });

  it("iki sözlükte de tekil ve çoğul cümle var", () => {
    for (const locale of ["tr", "en"] as const) {
      const messages = getMessagesForLocale(locale);

      assert.ok("messages.toast.membersAdded" in messages, locale);
      assert.ok("messages.toast.membersAddedMany" in messages, locale);
    }
  });
});

describe("kabuk", () => {
  it("kapalıyken hiçbir şey çizilmez ve hiçbir sorgu koşmaz", () => {
    const client = newClient();

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <AddMembersModal
            conversationId={CONVERSATION_ID}
            expiry="7d"
            onClearSelection={() => undefined}
            onClose={() => undefined}
            onSelectExpiry={() => undefined}
            onToggleSelection={() => undefined}
            open={false}
            selection={[]}
          />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    assert.equal(markup, "");
    assert.equal(client.getQueryCache().getAll().length, 0);
  });

  it("arama alanı gerçek input ve etiketli", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    const markup = render(client);

    assert.match(markup, /data-testid="invite-search"/);
    assert.match(markup, /placeholder="Arkadaş ara — isim veya @kullanıcıadı"/);
    assert.match(markup, /aria-label="Arkadaş ara — isim veya @kullanıcıadı"/);
  });

  it("kapat düğmesi ikon-only ve aria-label taşır", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), panel: panel() });

    assert.match(render(client), /aria-label="Pencereyi kapat"/);
  });

  it("çıplak px ve ham hex yok", () => {
    const client = newClient();
    seed(client, { candidates: candidatePage(), members: roster(), panel: panel() });

    const markup = render(client);

    assert.doesNotMatch(markup, /#[0-9a-fA-F]{6}\b/);
    assert.doesNotMatch(markup, /\[[0-9.]+px\]/);
  });
});
