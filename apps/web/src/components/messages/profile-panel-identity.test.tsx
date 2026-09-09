import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GroupProfilePanelDTO, UserProfilePanelDTO } from "@wizards/types";

import { ProfilePanelIdentity } from "@/components/messages/profile-panel-identity";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToEm, pxToRem } from "@/lib/messages/metrics";

/**
 * SPEC-MESAJLAR §15.1 — kimlik bloğu.
 *
 * En sıkı testler renk üzerine, çünkü §15.1'in iki cümlesi tam olarak orada
 * kırılıyor: "gri DS avatarı kullanılmaz" ve "karo rengi sohbet rayındaki tile
 * rengiyle aynı kaynaktan gelir". İkisi de bir gün sessizce bozulur ve kimse
 * fark etmez — bir avatarın gri olması hata gibi görünmez.
 */

function user(overrides: Partial<UserProfilePanelDTO> = {}): UserProfilePanelDTO {
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
    statusText: "Tasarım Kritiği odasında",
    tint: "primary",
    userId: "user-2",
    ...overrides,
  };
}

function group(overrides: Partial<GroupProfilePanelDTO> = {}): GroupProfilePanelDTO {
  return {
    addPolicy: "ALL",
    avatarColor: "primary",
    conversationId: "group-1",
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

function wrap(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

type IdentityProps = React.ComponentProps<typeof ProfilePanelIdentity>;
type DmProps = Extract<IdentityProps, { variant: "dm" }>;
type GroupProps = Extract<IdentityProps, { variant: "group" }>;

function renderDm(overrides: Partial<Omit<DmProps, "variant">> = {}): string {
  return wrap(
    <ProfilePanelIdentity
      onSendMessage={() => undefined}
      onStartVideoCall={() => undefined}
      onStartVoiceCall={() => undefined}
      profile={user()}
      variant="dm"
      {...overrides}
    />,
  );
}

function renderGroup(overrides: Partial<Omit<GroupProps, "variant">> = {}): string {
  return wrap(
    <ProfilePanelIdentity
      onAddMembers={() => undefined}
      onOpenSettings={() => undefined}
      onToggleMute={() => undefined}
      profile={group()}
      variant="group"
      {...overrides}
    />,
  );
}

function element(markup: string, testId: string): string {
  const start = markup.indexOf(`data-testid="${testId}"`);
  assert.notEqual(start, -1, `${testId} çizilmemiş`);

  return markup.slice(markup.lastIndexOf("<", start), markup.indexOf(">", start) + 1);
}

describe("kimlik bloğu — DM karosu (§15.1)", () => {
  /** Kural 5'in yarısı: profil başlığında gri DS avatarı **yok**. */
  it("karo renkli, DS avatarının gri fallback'i hiç geçmez", () => {
    const markup = renderDm();

    assert.match(markup, /data-testid="profile-panel-tile"/u);
    assert.ok(!markup.includes("--surface-soft)/0.72"), "gri DS avatarı çizilmiş");
  });

  it("karo zemini ve harfi kişinin tintinden gelir", () => {
    const tile = element(renderDm(), "profile-panel-tile");

    assert.ok(tile.includes("background:hsl(var(--primary)/0.18)"));
    assert.ok(tile.includes("color:hsl(var(--primary))"));
  });

  /**
   * Tint'i **sunucu** seçiyor (`resolveProfileTint`); bileşen yalnız boyuyor. Bu
   * test o ayrımın kanıtı: aynı bileşen, farklı DTO tinti, farklı renk.
   */
  it("tint DTO'dan okunur, kimlikten yeniden türetilmez", () => {
    const tile = element(renderDm({ profile: user({ tint: "warning" }) }), "profile-panel-tile");

    assert.ok(tile.includes("background:hsl(var(--warning)/0.18)"));
    assert.ok(!tile.includes("--primary"));
  });

  /** `danger` tasarımda bir tık sönük: kırmızı aynı opaklıkta ağır okunuyor. */
  it("`danger` tinti daha sönük bir zemin alır", () => {
    const tile = element(renderDm({ profile: user({ tint: "danger" }) }), "profile-panel-tile");

    assert.ok(tile.includes("background:hsl(var(--danger)/0.16)"));
  });

  it("karo 72px daire, harfler 600 24 ve `.03em`", () => {
    const tile = element(renderDm(), "profile-panel-tile");

    assert.ok(tile.includes("width:4.5rem"));
    assert.ok(tile.includes("height:4.5rem"));
    assert.ok(tile.includes("font-size:1.5rem"));
    assert.ok(tile.includes("letter-spacing:0.03em"));
    assert.ok(tile.includes("rounded-full"));
  });
});

describe("kimlik bloğu — presence (§15.1 · kural 6)", () => {
  /**
   * Tasarımın örneği çevrimiçi bir kişi olduğu için halka yeşil görünüyor.
   * Sabitlenseydi çevrimdışı birinin etrafında yeşil bir halka kalırdı — renk
   * doğrudan yalan söylerdi.
   */
  it("halka presence rengiyle sürülür, sabit success değil", () => {
    const online = element(renderDm(), "profile-panel-tile");
    assert.ok(online.includes("0 0 0 0.1875rem hsl(var(--success)/0.55)"));
    assert.ok(online.includes("0 0 0 0.5rem hsl(var(--success)/0.14)"));

    const offline = element(
      renderDm({ profile: user({ presence: "offline", statusText: null }) }),
      "profile-panel-tile",
    );
    assert.ok(offline.includes("hsl(var(--text-soft)/0.55)"));
    assert.ok(!offline.includes("--success"));
  });

  it("nokta 16px ve kenarı yüzeyin rengi", () => {
    const dot = element(renderDm(), "profile-panel-presence-dot");

    assert.ok(dot.includes("width:1rem"));
    assert.ok(dot.includes("height:1rem"));
    assert.ok(dot.includes("border:0.1875rem solid hsl(var(--surface-secondary))"));
  });

  /** Renk tek taşıyıcı olamaz: noktanın metin karşılığı var. */
  it("noktanın `sr-only` metin karşılığı var ve durumu söyler", () => {
    const markup = renderDm({ profile: user({ presence: "dnd" }) });

    assert.match(markup, /data-testid="profile-panel-presence-label"/u);
    assert.ok(markup.includes("Durum: Rahatsız etmeyin"));
  });

  it("durum pill'i presence adını ve kişinin cümlesini birleştirir", () => {
    assert.ok(renderDm().includes("Çevrimiçi · Tasarım Kritiği odasında"));
  });

  it("cümle yoksa pill yalnız presence adını yazar", () => {
    const markup = renderDm({ profile: user({ statusText: null }) });

    assert.ok(markup.includes("Çevrimiçi"));
    assert.ok(!markup.includes("·"));
  });
});

describe("kimlik bloğu — DM kimliği ve aksiyonları (§15.1)", () => {
  it("ad ve `@kullanıcıadı` çizilir", () => {
    const markup = renderDm();

    assert.ok(markup.includes("Selin Aksoy"));
    assert.ok(markup.includes("@selin"));
  });

  it("üç aksiyon: mesaj gönder + sesli + görüntülü", () => {
    const markup = renderDm();

    assert.match(markup, /data-testid="profile-panel-send-message"/u);
    assert.match(markup, /data-testid="profile-panel-voice-call"/u);
    assert.match(markup, /data-testid="profile-panel-video-call"/u);
    assert.ok(markup.includes("Mesaj gönder"));
  });

  /** İkon-only düğmeler `aria-label` taşır (kural 6). */
  it("ikon düğmeleri adlandırılmıştır", () => {
    const markup = renderDm();

    assert.ok(element(markup, "profile-panel-voice-call").includes('aria-label="Sesli ara"'));
    assert.ok(element(markup, "profile-panel-video-call").includes('aria-label="Görüntülü ara"'));
  });

  /**
   * Bağlanmamış bir aksiyon **gizlenmez**, pasif çizilir: düzen değişmeden kalır
   * ve düğmenin var olduğu bilgisi kaybolmaz.
   */
  it("bağlanmamış aksiyon pasif çizilir, kaybolmaz", () => {
    const markup = renderDm({ onStartVoiceCall: undefined });

    // `disabled=""` aranıyor, `disabled` değil: sınıf listesinde zaten
    // `disabled:opacity-45` geçiyor ve düz arama her koşulda yeşil olurdu.
    assert.ok(element(markup, "profile-panel-voice-call").includes('disabled=""'));
    assert.ok(!element(markup, "profile-panel-send-message").includes('disabled=""'));
  });

  /**
   * Ş11 parity kapısı. `dc.html` birincil düğmenin ikonunu **15**, üç ikon-only
   * düğmenin ikonunu **16** çiziyor. Bir tur boyunca ikisi de sözlüğün tek
   * `actionIconSize` kaydını okuyordu; fark 1px olduğu için gözle bulunamaz.
   *
   * Ölçü `rem`e çevriliyor, o yüzden karşılaştırma sözlükten türetiliyor —
   * sabit bir dize yazmak kök font boyutu değiştiğinde yalan söylerdi.
   */
  it("ikon-only düğmenin ikonu birincil düğmeninkinden büyüktür", () => {
    const markup = renderDm();
    const { profilePanel } = MESSAGES_METRICS;
    // `element` yalnız açılış etiketini döndürüyor; ikon düğmenin **çocuğu**.
    const button = (testId: string) => {
      const start = markup.indexOf(`data-testid="${testId}"`);
      assert.notEqual(start, -1, `${testId} çizilmemiş`);

      return markup.slice(start, markup.indexOf("</button>", start));
    };

    assert.ok(
      button("profile-panel-voice-call").includes(
        `width:${pxToRem(profilePanel.actionIconButtonIconSize)}`,
      ),
      "ikon-only düğme 16px ikonu çizmiyor",
    );
    assert.ok(
      button("profile-panel-send-message").includes(
        `width:${pxToEm(profilePanel.actionIconSize, profilePanel.actionFontSize)}`,
      ),
      "birincil düğme 15px ikonu çizmiyor",
    );
  });
});

describe("kimlik bloğu — grup kolu (§15.1)", () => {
  it("karo swatch renginde, 66px ve radius 22", () => {
    const tile = element(renderGroup(), "profile-panel-tile");

    assert.ok(tile.includes("background:hsl(var(--primary))"));
    assert.ok(tile.includes("width:4.125rem"));
    assert.ok(tile.includes("border-radius:1.375rem"));
  });

  /** Gölge karonun kendi rengini alır; sabitlenseydi turuncu grubun altında mor kalırdı. */
  it("gölge karonun rengini izler", () => {
    const primary = element(renderGroup(), "profile-panel-tile");
    assert.ok(primary.includes("0 0.875rem 1.875rem -1rem hsl(var(--primary))"));

    const warning = element(
      renderGroup({ profile: group({ avatarColor: "warning" }) }),
      "profile-panel-tile",
    );
    assert.ok(warning.includes("-1rem hsl(var(--warning))"));
  });

  it("alt satır üye ve çevrimiçi sayacını taşır", () => {
    const markup = renderGroup();

    assert.match(markup, /data-testid="profile-panel-meta"/u);
    assert.ok(markup.includes("5 üye"));
    assert.ok(markup.includes("3 çevrimiçi"));
  });

  it("rol pill'i sahibi ve yöneticiyi `Yönetici` sayar", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      const markup = renderGroup({ profile: group({ viewerRole: role }) });

      assert.ok(markup.includes("Yönetici"), `${role} yönetici sayılmamış`);
      assert.ok(element(markup, "profile-panel-role-pill").includes("--primary)/0.14"));
    }
  });

  it("üye rol pill'i sönük yüzeyde çizilir ve `Yönetici` demez", () => {
    const markup = renderGroup({ profile: group({ viewerRole: "MEMBER" }) });

    assert.ok(!markup.includes("Yönetici"));
    assert.ok(element(markup, "profile-panel-role-pill").includes("bg-[hsl(var(--surface-soft))]"));
  });

  it("üç aksiyon: üye ekle + sessize al + grup ayarları", () => {
    const markup = renderGroup();

    assert.match(markup, /data-testid="profile-panel-add-members"/u);
    assert.match(markup, /data-testid="profile-panel-mute"/u);
    assert.match(markup, /data-testid="profile-panel-group-settings"/u);
    assert.ok(markup.includes("Üye ekle"));
  });

  /** Sessizlik açıkken düğme "kaldır" der; aynı ikonun iki anlamı vardır. */
  it("sessize alma düğmesinin adı duruma göre değişir", () => {
    assert.ok(element(renderGroup(), "profile-panel-mute").includes('aria-label="Sessize al"'));
    assert.ok(
      element(renderGroup({ profile: group({ muted: true }) }), "profile-panel-mute").includes(
        'aria-label="Sessize almayı kaldır"',
      ),
    );
  });
});

describe("kimlik bloğu — ortak kabuk (§15.1)", () => {
  it("iki kol da aynı zemini, kenarı ve ölçüyü paylaşır", () => {
    for (const markup of [renderDm(), renderGroup()]) {
      const shell = element(markup, "profile-panel-identity");

      assert.ok(shell.includes("bg-[hsl(var(--surface-secondary)/0.55)]"));
      assert.ok(shell.includes("hsl(var(--border)/0.4)"));
      assert.ok(shell.includes("padding:1.375rem 1.125rem 1rem"));
      assert.ok(shell.includes("gap:0.6875rem"));
    }
  });

  it("aksiyon satırı iki kolda da aynı yüksekliği ve yarıçapı taşır", () => {
    for (const markup of [renderDm(), renderGroup()]) {
      assert.ok(element(markup, "profile-panel-actions").includes("gap:0.375rem"));
    }
  });
});
