import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FriendRow, type FriendRowActor } from "@/components/friends/friend-row";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

function actor(overrides: Partial<FriendRowActor> = {}): FriendRowActor {
  return {
    avatarUrl: null,
    handle: "@selin",
    id: "user-2",
    name: "Selin Aksoy",
    status: "ONLINE",
    statusText: "Tasarım Kritiği odasında",
    statusTone: "muted",
    ...overrides,
  };
}

function render(overrides: Partial<React.ComponentProps<typeof FriendRow>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <FriendRow
        friend={actor()}
        menuOpen={false}
        onMessage={() => undefined}
        onOpenMenu={() => undefined}
        onVideoCall={() => undefined}
        onVoiceCall={() => undefined}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("arkadaş satırı — çevrimiçi", () => {
  it("ad, kullanıcı adı ve durumu çizer", () => {
    const markup = render();

    assert.ok(markup.includes("Selin Aksoy"));
    assert.ok(markup.includes("@selin"));
    assert.ok(markup.includes("Tasarım Kritiği odasında"));
  });

  it("Mesaj ve iki arama düğmesini taşır", () => {
    const markup = render();

    assert.match(markup, /data-testid="friend-row-message"/);
    assert.match(markup, /data-testid="friend-row-voice-call"/);
    assert.match(markup, /data-testid="friend-row-video-call"/);
  });

  it("arama düğmeleri okunabilir etiket taşır", () => {
    const markup = render();

    assert.match(markup, /aria-label="Sesli ara"/);
    assert.match(markup, /aria-label="Görüntülü ara"/);
  });
});

describe("arkadaş satırı — çevrimdışı", () => {
  /**
   * Kimsenin açmayacağı bir çağrı başlatan iki düğme, tıklanınca hiçbir şey
   * olmayan iki düğmedir.
   */
  it("arama düğmeleri çizilmez", () => {
    const markup = render({ friend: actor({ status: "OFFLINE", statusText: "3 gün önce" }) });

    assert.doesNotMatch(markup, /data-testid="friend-row-voice-call"/);
    assert.doesNotMatch(markup, /data-testid="friend-row-video-call"/);
    assert.match(markup, /data-testid="friend-row-message"/);
  });

  it("kullanıcı adı gösterilmez, son görülme gösterilir", () => {
    const markup = render({ friend: actor({ status: "OFFLINE", statusText: "3 gün önce" }) });

    assert.equal(markup.includes("@selin"), false);
    assert.ok(markup.includes("3 gün önce"));
  });

  it("satır çevrimdışı olarak işaretlenir", () => {
    assert.match(render({ friend: actor({ status: "OFFLINE" }) }), /data-offline="true"/);
  });
});

describe("arkadaş satırı — durum tonu", () => {
  it("rahatsız etmeyin danger, boşta warning, çevrimiçi muted", () => {
    assert.match(
      render({ friend: actor({ statusTone: "danger" }) }),
      /text-\[hsl\(var\(--danger\)\)\]/,
    );
    assert.match(
      render({ friend: actor({ statusTone: "warning" }) }),
      /text-\[hsl\(var\(--warning\)\)\]/,
    );
    assert.match(
      render({ friend: actor({ statusTone: "muted" }) }),
      /text-\[hsl\(var\(--text-muted\)\)\]/,
    );
  });

  it("durum metni yoksa alt satır çizilmez", () => {
    assert.doesNotMatch(
      render({ friend: actor({ statusText: null }) }),
      /data-testid="friend-row-status"/,
    );
  });
});

describe("arkadaş satırı — eylem şeridi", () => {
  /**
   * `--act` 0 iken şerit yalnız hover'da görünür; `group-focus-within` klavye
   * odağını da kapsar. Yalnız hover'a bağlanan bir şerit, klavye kullanıcısı
   * için hiç var olmaz.
   */
  it("klavye odağında da görünür", () => {
    assert.match(render(), /group-focus-within:opacity-100/);
    assert.match(render(), /group-hover:opacity-100/);
  });

  it("menü tetikleyicisi açıklığı bildirir", () => {
    assert.match(render(), /aria-expanded="false"/);
    assert.match(render({ menuOpen: true }), /aria-expanded="true"/);
    assert.match(render(), /aria-haspopup="menu"/);
  });
});
