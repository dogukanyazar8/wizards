import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UserProfilePanelDTO } from "@wizards/types";

import {
  MUTUAL_FRIEND_PREVIEW_LIMIT,
  ProfileMutualFriends,
  ProfileMutualServers,
} from "@/components/messages/profile-mutual-lists";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { buildServerHref } from "@/lib/home/href";
import { getMessagesForLocale } from "@/lib/locale";
import { profileTintForeground, profileTintSurface } from "@/lib/messages/profile-tint";

/**
 * Ş6 · §15.3.4-5 — ortak sunucular ve ortak arkadaşlar.
 *
 * Üç iddia: boş bölüm çizilmez, satır gerçek bir hedefe götürür, karo **renkli**dir.
 * Sonuncusu sessizce kaybolabilecek türden bir sapma — DS'in gri avatarı ile çizilen bir
 * satır da "çalışıyor" görünür, yalnız SPEC'in kişi tinti kuralı ölür.
 */

const TR = getMessagesForLocale("tr");

type MutualServer = UserProfilePanelDTO["mutualServers"][number];
type MutualFriend = UserProfilePanelDTO["mutualFriends"][number];

function server(overrides: Partial<MutualServer> = {}): MutualServer {
  return {
    id: "s1",
    initials: "WT",
    name: "Whispr Topluluğu",
    onlineCount: 12,
    tint: "primary",
    ...overrides,
  };
}

function friend(overrides: Partial<MutualFriend> = {}): MutualFriend {
  return {
    id: "u1",
    initials: "MK",
    name: "Mert Kaya",
    presence: "online",
    tint: "success",
    ...overrides,
  };
}

function wrap(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR}>
      {node}
    </LocaleProvider>,
  );
}

function renderServers(props: Partial<React.ComponentProps<typeof ProfileMutualServers>> = {}) {
  return wrap(<ProfileMutualServers servers={[server()]} {...props} />);
}

function renderFriends(props: Partial<React.ComponentProps<typeof ProfileMutualFriends>> = {}) {
  return wrap(<ProfileMutualFriends friends={[friend()]} total={1} {...props} />);
}

describe("ORTAK SUNUCULAR — §15.3.4", () => {
  it("satır sunucuya götüren gerçek bir bağlantı", () => {
    const markup = renderServers();

    assert.ok(markup.includes(`href="${buildServerHref("s1")}"`), markup);
    assert.match(markup, /<a[^>]*data-testid="profile-mutual-server-s1"/u);
  });

  it("başlık sayacı listenin uzunluğunu söyler", () => {
    const markup = renderServers({
      servers: [server(), server({ id: "s2", name: "Product Team" })],
    });

    assert.ok(markup.includes("Ortak sunucular"), markup);
    assert.ok(markup.includes(">2</span>"), markup);
  });

  it("karo sunucunun kendi tintini boyar", () => {
    const markup = renderServers({ servers: [server({ tint: "warning" })] });

    assert.ok(markup.includes(`background:${profileTintSurface("warning")}`), markup);
    assert.ok(markup.includes(`color:${profileTintForeground("warning")}`), markup);
  });

  /** Çıplak `12` ekran okuyucuya hiçbir şey söylemez. */
  it("çevrimiçi sayısının metin karşılığı var", () => {
    const markup = renderServers();

    assert.ok(markup.includes("12"), markup);
    assert.ok(markup.includes('class="sr-only"'), markup);
    assert.ok(markup.includes(TR["messages.rail.presence.online"] ?? "—"), markup);
  });

  it("ortak sunucu yoksa bölüm hiç çizilmez", () => {
    assert.equal(renderServers({ servers: [] }), "");
  });

  it("yüklenirken iskelet, hatada tek satır", () => {
    assert.ok(renderServers({ loading: true }).includes("animate-pulse"));
    assert.ok(
      renderServers({ failed: true }).includes('data-testid="profile-mutual-servers-error"'),
    );
  });
});

describe("ORTAK ARKADAŞLAR — §15.3.5", () => {
  it("karo kişi tintiyle renkli çizilir — gri DS avatarı değil", () => {
    const markup = renderFriends({ friends: [friend({ tint: "danger" })] });

    assert.ok(markup.includes(`background:${profileTintSurface("danger")}`), markup);
    assert.ok(markup.includes(`color:${profileTintForeground("danger")}`), markup);
    assert.ok(markup.includes('data-tint="danger"'), markup);
  });

  it("presence noktası ve metin karşılığı var", () => {
    const markup = renderFriends({ friends: [friend({ presence: "idle" })] });

    assert.ok(markup.includes("hsl(var(--warning))"), markup);
    assert.ok(markup.includes('class="sr-only"'), markup);
  });

  it("satır gerçek bir düğme ve seçimi bildirir", () => {
    const seen: string[] = [];
    const markup = wrap(
      <ProfileMutualFriends friends={[friend()]} onSelect={(id) => seen.push(id)} total={1} />,
    );

    assert.match(markup, /<button[^>]*data-testid="profile-mutual-friend-u1"[^>]*type="button"/u);
    assert.deepEqual(seen, []);
  });

  it("ortak arkadaş yoksa bölüm hiç çizilmez", () => {
    assert.equal(renderFriends({ friends: [] }), "");
  });
});

describe("ORTAK ARKADAŞLAR — fazlalık satırı", () => {
  const five = Array.from({ length: 5 }, (_, index) =>
    friend({ id: `u${index}`, name: `Kişi ${index}` }),
  );

  /**
   * Uç dört satır + bir kayıt döndürüyor; beşinci satır çizilmez. Sayı **gerçek
   * toplamdan** gelir, önizleme uzunluğundan değil: yedi ortak arkadaşı olan bir profil
   * "ve 1 kişi daha" derse yalan söylemiş olur.
   */
  it("önizleme dört satır, fazlası tek satıra iner", () => {
    const markup = wrap(<ProfileMutualFriends friends={five} total={7} />);

    assert.equal(MUTUAL_FRIEND_PREVIEW_LIMIT, 4);
    assert.equal((markup.match(/data-testid="profile-mutual-friend-/gu) ?? []).length, 4);
    assert.ok(markup.includes("ve 3 kişi daha"), markup);
  });

  it("toplam önizlemeye eşitse fazlalık satırı yok", () => {
    const markup = wrap(<ProfileMutualFriends friends={five.slice(0, 4)} total={4} />);

    assert.ok(!markup.includes('data-testid="profile-mutual-friends-more"'), markup);
  });

  it("başlık sayacı gerçek toplamı söyler", () => {
    const markup = wrap(<ProfileMutualFriends friends={five} total={7} />);

    assert.ok(markup.includes(">7</span>"), markup);
  });
});
