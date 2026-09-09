"use client";

import React, { useRef } from "react";
import { PROFILE_PANEL_TABS, type ProfilePanelTab } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Profil panelinin sekme şeridi — SPEC-MESAJLAR §15.2.
 *
 * Şerit gerçek bir `tablist`: dört düğme aynı ekranın dört görünümünü seçiyor ve
 * ekran okuyucuya "dört bağımsız buton" olarak duyurulsalardı hangisinin açık
 * olduğu yalnız renkten anlaşılırdı. `aria-selected` + gezgin `tabIndex` bunun
 * karşılığı: `Tab` şeride **bir kez** girer, sekmeler arasında ok tuşlarıyla
 * gezilir.
 *
 * **Seçili sekme hover'da zemin değiştirmez.** SPEC bunu ayrıca kabul kriterine
 * koymuş, çünkü seçili sekmeye `hover:bg-*` eklemek en kolay yapılan hatadır ve
 * sonucu "hangi sekme açık" sorusunun fareyle birlikte kaybolmasıdır. Parlaklık
 * filtresi geri bildirimi verir, kimliği bozmaz.
 */

const { profilePanel } = MESSAGES_METRICS;

export type ProfilePanelVariant = "dm" | "group";

/**
 * §15.2: DM üç sekme çizer, grup dört. `uyeler` DM'de **hiç çizilmez** — reducer
 * onu zaten `genel`e çeviriyor (Dalga 0 Ş0.3), ama çizilmeyen bir sekme için
 * "seçilemez" demek yetmez; şerit onu hiç üretmemeli, yoksa ok tuşlarıyla gezerken
 * boş bir durağa uğranırdı.
 */
export function profilePanelTabsFor(variant: ProfilePanelVariant): readonly ProfilePanelTab[] {
  return variant === "group"
    ? PROFILE_PANEL_TABS
    : PROFILE_PANEL_TABS.filter((tab) => tab !== "uyeler");
}

export function profileTabButtonId(tab: ProfilePanelTab): string {
  return `profile-tab-${tab}`;
}

/**
 * Ok tuşu → hangi sekmeye. Saf fonksiyon: paket testleri jsdom'suz koşuyor
 * (`node --test` + `renderToStaticMarkup`), yani klavye gezinmesinin kanıtı ancak
 * kararın kendisi sorulabildiğinde ölçülebilir olur.
 *
 * Şerit **yatay**; WAI-ARIA yatay tablist için yukarı/aşağı oklarını tanımlamaz ve
 * burada da tanımlanmaz — kaydıran gövdenin okları bu şeride yakalatılsaydı panel
 * klavyeyle kaydırılamazdı. Uçlar sarar: son sekmede sağ ok başa döner.
 */
export function nextProfileTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) {
    return null;
  }

  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export type ProfilePanelTabsProps = {
  /** Şeridin sürdüğü gövdenin `id`'si — `aria-controls` oraya bağlanır. */
  bodyId: string;
  onSelect: (tab: ProfilePanelTab) => void;
  tab: ProfilePanelTab;
  variant: ProfilePanelVariant;
};

export function ProfilePanelTabs({ bodyId, onSelect, tab, variant }: ProfilePanelTabsProps) {
  const { t } = useI18n();
  const tabs = profilePanelTabsFor(variant);
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const nextIndex = nextProfileTabIndex(event.key, tabs.indexOf(tab), tabs.length);

    if (nextIndex === null) {
      return;
    }

    const nextTab = tabs[nextIndex];

    if (!nextTab) {
      return;
    }

    event.preventDefault();
    onSelect(nextTab);
    // Seçim odağı da taşır: gezgin `tabIndex` yalnız seçili düğmede 0 olduğu için
    // odak eski düğmede bırakılsaydı bir sonraki `Tab` kullanıcıyı şeridin dışına
    // değil, hiçbir yere götürürdü.
    listRef.current?.querySelector<HTMLButtonElement>(`[data-profile-tab="${nextTab}"]`)?.focus();
  };

  return (
    <div
      /*
        Şeridin kendi adı panelin adıyla aynı: sözlükte sekme kümesini adlandıran
        ayrı bir anahtar yok ve uydurulmadı (Dalga 0 sözlüğü dondurdu). Adsız bir
        `tablist` ekran okuyucuda "sekme listesi" diye geçerdi — hangi ekranın
        sekmeleri olduğu kaybolurdu.
      */
      aria-label={t(
        variant === "group" ? "messages.profile.title.group" : "messages.profile.title.user",
      )}
      className="flex shrink-0"
      data-testid="profile-panel-tabs"
      onKeyDown={handleKeyDown}
      ref={listRef}
      role="tablist"
      style={{
        gap: pxToRem(profilePanel.tabsGap),
        padding: `${pxToRem(profilePanel.tabsPaddingTop)} ${pxToRem(profilePanel.tabsPaddingX)} ${pxToRem(profilePanel.tabsPaddingBottom)}`,
      }}
    >
      {tabs.map((entry) => {
        const selected = entry === tab;

        return (
          <button
            aria-controls={bodyId}
            aria-selected={selected}
            className={cn(
              "flex-1 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              selected
                ? // Zemin **değişmiyor**: yalnız parlaklık. §15.2'nin kabul kriteri.
                  "bg-[hsl(var(--primary))] text-white hover:[filter:brightness(var(--profile-tab-hover-brightness))]"
                : "bg-transparent text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
            )}
            data-profile-tab={entry}
            data-testid={`profile-panel-tab-${entry}`}
            id={profileTabButtonId(entry)}
            key={entry}
            onClick={() => onSelect(entry)}
            role="tab"
            style={{
              borderRadius: pxToRem(profilePanel.tabRadius),
              fontSize: pxToRem(profilePanel.tabFontSize),
              fontWeight: 600,
              height: pxToRem(profilePanel.tabHeight),
              lineHeight: 1,
              ["--profile-tab-hover-brightness" as string]: String(profilePanel.tabHoverBrightness),
            }}
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {t(`messages.profile.tab.${entry}`)}
          </button>
        );
      })}
    </div>
  );
}
