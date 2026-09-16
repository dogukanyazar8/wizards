import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { ProfileHeroCard } from "@/components/settings/blocks/profile-hero-card";
import { AccountSurfaceContext } from "@/components/settings/sections/account/account-context";
import type { AccountSettingsState } from "@/lib/account/actions";
import type { AccountBanner } from "@/lib/account/banner";
import { getMessagesForLocale } from "@/lib/locale";
import { createQueryClient } from "@/lib/query-client";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import type { SettingsRowDef } from "@/lib/settings/tree";
import {
  SettingsValueContext,
  SettingsValueStore,
  type SettingsPatch,
} from "@/lib/settings/use-setting-value";

/** Ş7 §1 — hero kartı: ölçü, canlı değer ve **olmayan** düğme dizisi. */

const MESSAGES = getMessagesForLocale("tr");
const { hero } = SETTINGS_METRICS.blocks;

const HERO_ROW: SettingsRowDef = { block: "hero", key: "hero", type: "custom" };

const SOURCE = readFileSync(
  fileURLToPath(new URL("./profile-hero-card.tsx", import.meta.url)),
  "utf8",
);

function render(
  values: SettingsPatch = {},
  data: Record<string, string> = {},
  account: AccountSettingsState | null = null,
  banner?: AccountBanner,
): string {
  const store = new SettingsValueStore({ values, write: async () => {} });
  const queryClient = createQueryClient();
  if (account && banner) {
    queryClient.setQueryData(["account-banner", account.id], banner);
  }

  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider
      value={{
        bfcacheId: "profile-hero-test",
        back() {},
        forward() {},
        refresh() {},
        push() {},
        replace() {},
        prefetch() {},
      }}
    >
      <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
        <QueryClientProvider client={queryClient}>
          <AccountSurfaceContext.Provider
            value={{ account, onAccountUpdated: () => undefined, uploadthingEnabled: false }}
          >
            <SettingsValueContext.Provider value={store}>
              <ProfileHeroCard data={data} row={HERO_ROW} />
            </SettingsValueContext.Provider>
          </AccountSurfaceContext.Provider>
        </QueryClientProvider>
      </LocaleProvider>
    </AppRouterContext.Provider>,
  );
  queryClient.clear();
  return markup;
}

describe("ProfileHeroCard — geometri", () => {
  it("kartı kırpar ve yalnız avatarı banner üzerine taşır", () => {
    assert.match(SOURCE, /overflow-hidden rounded-\[inherit\] bg-/u);
    assert.match(SOURCE, /data-testid="settings-hero-avatar-row"/u);
    assert.match(SOURCE, /mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between/u);
  });

  it("banner adın üstüne uzarken avatarın ve metnin konumunu korur", () => {
    const markup = render();

    assert.ok(markup.includes(`height:${pxToRem(180)}`));
    assert.ok(markup.includes(`width:${pxToRem(hero.avatarSize)}`));
    assert.ok(markup.includes(`0 0 0 ${pxToRem(hero.avatarRing)} hsl(var(--surface-card))`));
    assert.ok(markup.includes(`margin-top:${pxToRem(-90)}`));
  });

  it("17 px durum noktası ve 28 px kamera düğmesi", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(hero.statusDotSize)}`));
    assert.ok(markup.includes(`width:${pxToRem(hero.cameraButtonSize)}`));
    assert.ok(
      markup.includes(`border:${pxToRem(hero.cameraButtonRing)} solid hsl(var(--surface-card))`),
    );
  });

  it("`Profilimi görüntüle` durum pilinin yanında", () => {
    const markup = render({ pp: 0 });
    const pill = markup.indexOf('data-testid="settings-hero-presence"');
    const link = markup.indexOf('data-testid="settings-hero-view-profile"');

    assert.ok(pill > -1 && link > pill, "pil önce, düğme hemen sonra gelmeli");
  });

  it("profil CTA'sı raw hard navigation üretmiyor", () => {
    const markup = render({ pp: 0 });

    assert.match(markup, /aria-disabled="true"[^>]*settings-hero-view-profile/u);
    assert.doesNotMatch(markup, /href="\/(?:home|u\/)/u);
    assert.match(SOURCE, /<UserProfilePopover/u);
    assert.match(SOURCE, /userId=\{surface\.account\.id\}/u);
    assert.doesNotMatch(SOURCE, /href=\{handle \? `\/u\//u);
  });
});

describe("ProfileHeroCard — canlı değer", () => {
  it("ad ve kullanıcı adı satır motorunun taslağından okunuyor", () => {
    const markup = render({ pn: "Yeni Ad", pu: "yeniad" });

    assert.ok(markup.includes("Yeni Ad"));
    assert.ok(markup.includes("@yeniad"));
  });

  it("`@` öneki yalnız çizimde; değer onu taşımıyor", () => {
    const store = new SettingsValueStore({ values: { pu: "dogukan" }, write: async () => {} });

    assert.equal(store.getValue("pu"), "dogukan");
  });

  it("durum pili `pp` ile ton değiştiriyor", () => {
    assert.ok(render({ pp: 0 }).includes("hsl(var(--success))"));
    assert.ok(render({ pp: 2 }).includes("hsl(var(--danger))"));
  });

  it("özel durum boşken şerit çizilmiyor, doluyken temizle düğmesi geliyor", () => {
    assert.ok(!render({ ps: "" }).includes("settings-hero-custom-status"));

    const markup = render({ pe: "🎨", ps: "Tasarım kritiğinde", px: 1 });

    assert.ok(markup.includes("Tasarım kritiğinde"));
    assert.ok(markup.includes("🎨"));
    assert.ok(markup.includes("4 saat sonra"));
    assert.ok(markup.includes("settings-hero-clear-status"));
  });

  it("e-posta ve avatar bölüm sözlüğünden geliyor", () => {
    const markup = render({}, { avatarUrl: "", email: "dogukan@whispr.app" });

    assert.ok(markup.includes("dogukan@whispr.app"));
  });
});

describe("ProfileHeroCard — PROMPT §5", () => {
  it("`Kırp / Yakınlaştır / Sıfırla` düğme dizisi yok", () => {
    const markup = render();

    for (const label of ["Kırp", "Yakınlaştır", "Sıfırla"]) {
      assert.ok(!markup.includes(label), `${label} düğmesi hero'da olmamalı`);
    }
  });

  it("hesap yüklenmeden banner işlemlerine izin vermiyor", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="settings-hero-change-banner"'));
    assert.match(markup, /settings-hero-change-banner"[^>]*disabled/u);
    assert.match(markup, /settings-hero-remove-banner"[^>]*disabled/u);
  });

  it("kayıtlı banner odak noktalarını gösterir; yükleme kapalıyken kaldırmaya izin verir", () => {
    const account: AccountSettingsState = {
      avatarUrl: null,
      displayName: "Test",
      email: "test@example.com",
      emailVerified: false,
      id: "banner-owner",
      status: "ONLINE",
      twoFactorEnabled: false,
      username: "test",
    };
    const markup = render({}, {}, account, {
      bannerUrl: "https://cdn.example.com/banner.png",
      bannerColor: "#22A366",
      bannerOffsetX: 0,
      bannerOffsetY: 1,
    });
    assert.match(markup, /banner\.png/u);
    assert.match(markup, /0% 100% \/ cover/u);
    assert.doesNotMatch(markup, /settings-hero-remove-banner"[^>]*disabled/u);
    assert.doesNotMatch(markup, /settings-hero-change-banner"[^>]*disabled/u);
  });

  it("token dışı renk yok (tek istisna ters metin `#fff`)", () => {
    const colors = SOURCE.match(/#[0-9a-fA-F]{3,8}\b/gu) ?? [];

    assert.deepEqual([...new Set(colors)], ["#fff"]);
  });
});
