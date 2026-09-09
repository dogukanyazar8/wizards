import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GroupProfilePanelDTO, ProfilePanelTab, UserProfilePanelDTO } from "@wizards/types";

import {
  ConversationProfilePanel,
  ProfileIdentityError,
  resolveProfileIdentityState,
} from "@/components/messages/conversation-profile-panel";
import { MessagesSidePanel } from "@/components/messages/messages-side-panel";
import { AccountPreferenceProvider } from "@/components/providers/account-preference-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import { dmProfileQueryKeys } from "@/lib/dm/profile-client";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * SPEC-MESAJLAR §15 — profil panelinin kabuğu (K4 · K5).
 *
 * Üç eski panel (`DmDetailsPanel`, `DmGroupDetailsPanel`, `DmGroupSettingsPanel`)
 * burada birleşti. Onların testlerinden **taşınan** iddialar aşağıda ayrı bir
 * başlıkta duruyor ve nereden geldikleri yazılı; taşınmayanlar Ş7 (üyeler) ve Ş8
 * (ayarlar) sekmelerinin testlerine gitti, çünkü doğruladıkları kontrol artık
 * orada çiziliyor.
 */

const TR = getMessagesForLocale("tr");
const CONVERSATION_ID = "conv-1";

function dmProfile(overrides: Partial<UserProfilePanelDTO> = {}): UserProfilePanelDTO {
  return {
    badges: [],
    bio: null,
    blocked: false,
    friendship: null,
    handle: "selin",
    initials: "SA",
    muted: false,
    mutedUntil: null,
    mutualFriendTotal: 0,
    mutualFriends: [],
    mutualServers: [],
    name: "Selin Aksoy",
    notifyLevel: "ALL",
    presence: "online",
    privacy: { readReceipts: true, typingIndicator: true },
    statusText: null,
    tint: "primary",
    userId: "user-2",
    ...overrides,
  };
}

function groupProfile(overrides: Partial<GroupProfilePanelDTO> = {}): GroupProfilePanelDTO {
  return {
    addPolicy: "ALL",
    avatarColor: "primary",
    conversationId: CONVERSATION_ID,
    createdAt: "2026-03-02T08:00:00.000Z",
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

type RenderOptions = {
  overlay?: boolean;
  profile?: GroupProfilePanelDTO | UserProfilePanelDTO | null;
  tab?: ProfilePanelTab;
  variant?: "dm" | "group";
};

function render({
  overlay = false,
  profile,
  tab = "genel",
  variant = "dm",
}: RenderOptions = {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const seeded =
    profile === undefined ? (variant === "dm" ? dmProfile() : groupProfile()) : profile;

  if (seeded) {
    client.setQueryData(
      variant === "dm"
        ? [...dmProfileQueryKeys.profile(CONVERSATION_ID)]
        : [...groupProfileQueryKeys.panel(CONVERSATION_ID)],
      seeded,
    );
  }

  return withProviders(
    client,
    <ConversationProfilePanel
      conversationId={CONVERSATION_ID}
      onClose={() => undefined}
      onSelectTab={() => undefined}
      overlay={overlay}
      tab={tab}
      variant={variant}
    />,
  );
}

function rootTag(markup: string): string {
  const start = markup.indexOf('data-testid="conversation-profile-panel"');
  assert.notEqual(start, -1, "panel çizilmemiş");

  return markup.slice(markup.lastIndexOf("<", start), markup.indexOf(">", start) + 1);
}

function bodyTag(markup: string): string {
  const start = markup.indexOf('data-testid="conversation-profile-panel-body"');
  assert.notEqual(start, -1, "gövde çizilmemiş");

  return markup.slice(markup.lastIndexOf("<", start), markup.indexOf(">", start) + 1);
}

describe("profil paneli — genişlik ve kabuk (§15 · K5)", () => {
  /**
   * Tuzak 10. `sidePanel.width` tek sabit sanılıp 330'a çekilseydi thread ve arama
   * panelleri de daralırdı; iki genişlik ayrı kayıt ve bu test ikisini birden ölçer.
   */
  it("profil 330, thread/arama 340'ta kalır", () => {
    assert.ok(rootTag(render()).includes("width:20.625rem"));

    const shared = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        <MessagesSidePanel onClose={() => undefined} title="Thread">
          <p>gövde</p>
        </MessagesSidePanel>
      </LocaleProvider>,
    );

    assert.ok(shared.includes("width:21.25rem"));
    assert.ok(shared.includes('data-variant="default"'));
  });

  it("varyant DOM'da işaretli, böylece ölçü kaza eseri değişmez", () => {
    assert.ok(rootTag(render()).includes('data-variant="profile"'));
  });

  /** Kabuk ortak: `Esc`, focus tuzağı ve odak dönüşü bir kez yazıldı (K5). */
  it("ortak panel kabuğunu kullanır, kendi başlığını kurmaz", () => {
    const markup = render();

    assert.ok(rootTag(markup).includes('data-messages-side-panel="true"'));
    assert.match(markup, /data-testid="messages-side-panel-close"/u);
    assert.match(markup, /data-testid="messages-side-panel-title"[^>]*tabindex="-1"/u);
  });

  it("başlık varyanta göre `Kullanıcı profili` / `Grup profili`", () => {
    assert.ok(render().includes("Kullanıcı profili"));
    assert.ok(render({ variant: "group" }).includes("Grup profili"));
  });

  it("yerleşikken `complementary`, dar görünümde `dialog`", () => {
    assert.ok(rootTag(render()).includes('role="complementary"'));

    const overlay = rootTag(render({ overlay: true }));
    assert.ok(overlay.includes('role="dialog"'));
    assert.ok(overlay.includes('aria-modal="true"'));
  });
});

describe("profil paneli — gövde (§15.2)", () => {
  it("gövde ölçüleri sözlükten: gap 16, padding 4/16/20", () => {
    const body = bodyTag(render());

    assert.ok(body.includes("gap:1rem"));
    assert.ok(body.includes("padding:0.25rem 1rem 1.25rem"));
  });

  /**
   * `overscroll-behavior: contain` olmadan panelin sonuna gelen kaydırma **mesaj
   * listesine** zincirlenir: kullanıcı paneli kaydırmayı bitirdiğinde sohbet
   * kendiliğinden kayar.
   */
  it("gövde kendi kaydırma kutusu ve zincirlemeyi kesiyor", () => {
    const body = bodyTag(render());

    assert.ok(body.includes("overflow-y-auto"));
    assert.ok(body.includes("[overscroll-behavior:contain]"));
    assert.ok(body.includes("[scrollbar-width:thin]"));
    assert.ok(body.includes("[scrollbar-color:hsl(var(--border))_transparent]"));
  });

  it("gövde gerçek bir `tabpanel` ve seçili sekmeye adını borçlu", () => {
    const body = bodyTag(render({ tab: "medya" }));

    assert.ok(body.includes('role="tabpanel"'));
    assert.ok(body.includes('id="conversation-profile-panel-body"'));
    assert.ok(body.includes('aria-labelledby="profile-tab-medya"'));
  });

  /** Sekme değişince gövde başa döner (§10) — kutu değişmiyor, işareti değişiyor. */
  it("gövde hangi sekmede olduğunu taşır", () => {
    assert.ok(bodyTag(render({ tab: "genel" })).includes('data-profile-tab="genel"'));
    assert.ok(bodyTag(render({ tab: "ayarlar" })).includes('data-profile-tab="ayarlar"'));
  });
});

describe("profil paneli — tembel sekme gövdeleri (kural 7)", () => {
  /**
   * Kural bileşen sınırında: seçili olmayan sekme hiç render edilmiyor, dolayısıyla
   * sorgusu da kurulmuyor. Dördünü birden çizip üçünü `display:none` ile saklamak
   * paneli her açılışta dört uca birden çıkarırdı.
   */
  it("yalnız seçili sekmenin gövdesi çizilir", () => {
    const genel = render({ variant: "group", tab: "genel" });
    assert.match(genel, /data-testid="profile-tab-general"/u);
    assert.doesNotMatch(genel, /data-testid="profile-tab-settings"/u);
    assert.doesNotMatch(genel, /data-testid="profile-members-/u);
    assert.doesNotMatch(genel, /data-testid="profile-media-section"/u);

    const uyeler = render({ variant: "group", tab: "uyeler" });
    assert.match(uyeler, /data-testid="profile-members-/u);
    assert.doesNotMatch(uyeler, /data-testid="profile-tab-general"/u);

    const medya = render({ variant: "group", tab: "medya" });
    assert.match(medya, /data-testid="profile-media-section"/u);
    assert.doesNotMatch(medya, /data-testid="profile-tab-general"/u);

    const ayarlar = render({ variant: "group", tab: "ayarlar" });
    assert.match(ayarlar, /data-testid="profile-tab-settings"/u);
    assert.doesNotMatch(ayarlar, /data-testid="profile-tab-general"/u);
  });
});

describe("profil paneli — sekme gövdesi sözleşmesi (Ş6/Ş7/Ş8)", () => {
  /**
   * Ş7'nin `Üye ekle` düğmesi **yetkiye** göre çiziliyor, kancanın varlığına göre
   * değil — yani kancayı iletmeyi unutmak DOM'da hiçbir iz bırakmaz, düğme sessizce
   * ölü bir buton olur. Markup'a bakan bir test bunu asla yakalayamaz, o yüzden
   * sözleşme kaynaktan taranıyor (emsal: `settings-a11y.test.tsx`).
   */
  it("dört kanca da gövdeye iletilir", () => {
    const source = readFileSync(
      new URL("./conversation-profile-panel.tsx", import.meta.url),
      "utf8",
    );
    const call = source.slice(
      source.indexOf("<Body"),
      source.indexOf("/>", source.indexOf("<Body")),
    );

    for (const prop of [
      "conversationId=",
      "onAddMembers=",
      "onSelectMember=",
      "onToast=",
      "variant=",
    ]) {
      assert.ok(call.includes(prop), `${prop} gövdeye iletilmiyor`);
    }
  });

  /** Yetkisi olan bir sahip düğmeyi görür; kanca da onun altında duruyor. */
  it("üyeler sekmesi `Üye ekle` düğmesini çizer", () => {
    assert.match(render({ variant: "group", tab: "uyeler" }), /data-testid="profile-members-add"/u);
  });
});

describe("profil paneli — sekmeler (§15.2)", () => {
  it("DM üç sekme, grup dört", () => {
    const dm = render();
    assert.match(dm, /data-testid="profile-panel-tab-genel"/u);
    assert.doesNotMatch(dm, /data-testid="profile-panel-tab-uyeler"/u);

    assert.match(render({ variant: "group" }), /data-testid="profile-panel-tab-uyeler"/u);
  });

  /**
   * Reducer `uyeler`i DM'de zaten `genel`e çeviriyor; panel ikinci bir kez çevirir,
   * çünkü onu reducer'sız çizen bir çağıran boş bir gövdeye bakardı.
   */
  it("DM'de `uyeler` istenirse `genel`e düşer", () => {
    const markup = render({ tab: "uyeler" });

    assert.match(markup, /data-testid="profile-tab-general"/u);
    assert.doesNotMatch(markup, /data-testid="profile-members-/u);
    assert.ok(bodyTag(markup).includes('aria-labelledby="profile-tab-genel"'));
  });
});

describe("profil paneli — kimlik bloğunun hâlleri (§15.1 · kural 7)", () => {
  it("veri gelmeden iskelet, geldikten sonra kimlik bloğu", () => {
    assert.match(render({ profile: null }), /data-testid="profile-panel-identity-skeleton"/u);

    const loaded = render();
    assert.match(loaded, /data-testid="profile-panel-identity"/u);
    assert.doesNotMatch(loaded, /data-testid="profile-panel-identity-skeleton"/u);
  });

  it("DM kolu kimlik karosunu, grup kolu rol pill'ini çizer", () => {
    assert.match(render(), /data-testid="profile-panel-send-message"/u);
    assert.match(render({ variant: "group" }), /data-testid="profile-panel-role-pill"/u);
  });

  /** Kimlik bloğu geciktiğinde sekme şeridi ve gövde beklemez. */
  it("kimlik yüklenirken sekmeler ve gövde yine çizilir", () => {
    const markup = render({ profile: null });

    assert.match(markup, /data-testid="profile-panel-tabs"/u);
    assert.match(markup, /data-testid="conversation-profile-panel-body"/u);
  });

  /**
   * Ş11 parity kapısı. Kabuk üç yüzeyin ortak evi ve kapat düğmesinin adı bir tur
   * boyunca üçünde de `Paneli kapat`tı; sözlükteki `messages.profile.close`
   * ("Profili kapat") ölü duruyordu. Ekran okuyucu için "hangi panel" bilgisi
   * düğmenin adında; üç panel aynı adı taşıyamaz.
   */
  it("kapat düğmesi panelin kendi adını taşır", () => {
    assert.ok(render().includes('aria-label="Profili kapat"'));
    assert.ok(!render().includes('aria-label="Paneli kapat"'));
  });
});

describe("profil paneli — eski üç panelden taşınan davranışlar (K4)", () => {
  /**
   * `dm-group-settings-panel.test.tsx` bunu "2f ayrı rota değil, aynı yüzey"
   * diye doğruluyordu ve ayarlar paneli grup ayrıntı panelinin **içine**
   * `children` olarak gömülüydü. Aynı iddia artık şudur: ayarlar bir sekmedir,
   * bir gezinme değil.
   */
  it("grup ayarları ayrı bir rota değil, aynı panelin bir sekmesi", () => {
    const markup = render({ variant: "group", tab: "ayarlar" });

    assert.match(markup, /data-testid="profile-panel-tab-ayarlar"/u);
    assert.match(markup, /data-testid="profile-tab-settings"/u);
    // Sekme bir `button`; bir `a href` olsaydı ayrı bir sayfaya çıkardı.
    assert.doesNotMatch(markup, /<a[^>]*data-testid="profile-panel-tab-ayarlar"/u);
  });

  /**
   * `dm-details-panel` 1:1 kolunu `participant` prop'uyla koruyordu: karşı taraf
   * yoksa panel hiç çizilmezdi. Koruma artık iki katmanlı — sayfa paneli konu
   * yokken hiç bağlamıyor, panel de DM'de üyeler sekmesini hiç üretmiyor.
   */
  it("1:1 panelinde üye listesi hiçbir yoldan açılmaz", () => {
    for (const tab of ["genel", "uyeler", "medya", "ayarlar"] as const) {
      assert.doesNotMatch(
        render({ tab }),
        /data-testid="profile-members-/u,
        `${tab} sekmesinde üye listesi sızdı`,
      );
    }
  });

  /**
   * Eski grup paneli üye sayacını kendi başlığında yazıyordu
   * (`dm-group-details-panel.test.tsx` "counts every member"). Sayaç artık kimlik
   * bloğunun alt satırı ve **aynı** iddia orada ölçülüyor.
   */
  it("grup üye sayacı kimlik bloğunda", () => {
    const markup = render({ variant: "group" });

    assert.match(markup, /data-testid="profile-panel-meta"/u);
    assert.ok(markup.includes("5 üye"));
  });
});

describe("profil paneli — kimlik hâli makinesi", () => {
  /**
   * Hata hâli DOM'dan **sorulamıyor**: paket testleri sunucu render'ı yapıyor ve
   * React Query orada her sorguyu iyimser biçimde `pending` sayıyor, önbelleğe
   * elle bir hata durumu yazılsa bile. O yüzden karar saf fonksiyondan, çizim
   * bileşenin kendisinden ölçülüyor.
   */
  it("veri varsa hata olsa bile `ready` kalır", () => {
    assert.equal(resolveProfileIdentityState({ hasProfile: true, isError: false }), "ready");
    assert.equal(resolveProfileIdentityState({ hasProfile: true, isError: true }), "ready");
  });

  it("veri yoksa hata `error`, sessizlik `loading`", () => {
    assert.equal(resolveProfileIdentityState({ hasProfile: false, isError: true }), "error");
    assert.equal(resolveProfileIdentityState({ hasProfile: false, isError: false }), "loading");
  });

  it("hata satırı sözlükten okur ve tek satır kalır", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        <ProfileIdentityError />
      </LocaleProvider>,
    );

    assert.match(markup, /data-testid="profile-panel-error"/u);
    assert.ok(markup.includes("Profil yüklenemedi"));
  });

  /** Sohbet kimliği yoksa sorgu hiç kurulmaz; panel iskeletle ayakta kalır. */
  it("kimliksiz sohbette uç çağrılmaz", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const markup = withProviders(
      client,
      <ConversationProfilePanel
        conversationId=""
        onClose={() => undefined}
        onSelectTab={() => undefined}
        tab="genel"
        variant="dm"
      />,
    );

    assert.match(markup, /data-testid="profile-panel-identity-skeleton"/u);
    assert.doesNotMatch(markup, /data-testid="profile-panel-error"/u);
  });
});
