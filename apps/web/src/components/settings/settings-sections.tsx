"use client";

import React from "react";
import dynamic from "next/dynamic";

import { SettingsLadderProvider } from "@/components/settings/settings-ladder";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import type { SettingsSectionRenderInput } from "@/components/settings/settings-window";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import type { SettingsSection, SettingsTab } from "@/lib/settings/navigation";
import type { SettingsTabDef } from "@/lib/settings/tree";

/**
 * Bölüm kayıt defteri — Ş13.
 *
 * Ş5 pencerenin `renderSection` yuvasını açtı, Ş7–Ş10 dört bölüm kökünü dışa verdi ve **hiçbiri**
 * yuvayı bağlamadı: dördü de "bağlayan şerit bu değil" notunu bırakıp devretti (07-s6 §7,
 * 08-s7 §8, 09-s8 §7/1, 10-s9 §6, 11-s10 §8). Sonuç: pencere üründe boş bir yer tutucu
 * çiziyordu ve altı bölümün hiçbiri tarayıcıda açılamıyordu. Defter o dikişi kapatır.
 *
 * Defter **hiçbir satır çizmez** ve hiçbir karar vermez; iki iş yapar:
 *
 * 1. Bölüm anahtarını bölümün köküne eşler (altı kayıt, `Record` olduğu için eksik kalan bir
 *    bölüm derleme hatasıdır — `default` dalıyla sessizce boş çizen bir `switch` değil).
 * 2. Merdiveni **bir kez** sağlar (tuzak #12): kabuğun `openSelect` / `openRisky` durumu
 *    `SettingsLadderProvider` üzerinden bölüm köprülerine iner. Bu bağ olmadan kabuğun `Esc`
 *    merdiveninin ilk basamağı (açık menü) ölü kalır — kabuk bir menünün açık olduğunu hiç
 *    öğrenmez ve `Esc` doğrudan pencereyi kapatır.
 *
 * `Ses ve Video` ile `Görünüm` bölümlerinin `renderXSection` girişi **yoktu**: Ş8 sekmeleri
 * dışa verdi ama bir kök yazmadı. Sekme dağıtıcıları bu yüzden burada duruyor; ikisi de
 * kendi köprüsünü sekme bileşeninin içinde kuruyor (`AvSettingsProvider` /
 * `AppearanceSettingsProvider`), yani defterin taşıyacağı bir durum yok.
 *
 * **F4 — bölümler tembel yüklenir.** Rota seviyesi bölme pencereyi ana paketten zaten
 * ayırıyordu, ama pencerenin **kendi** parçası altı bölümü, yirmi özel bloğu, yirmi üç temalık
 * ızgarayı, QR üreticisini ve masaüstü tanılamasını tek yığında taşıyordu: `Bildirimler`i açan
 * kullanıcı hiç görmeyeceği tema ızgarasını da indiriyordu (PROMPT §8).
 *
 * Her bölüm kendi parçasına iniyor ve gelene kadar `SettingsSkeleton` çiziliyor. `ssr: false`
 * **değil**: pencere bir rota ve ilk boyanın sunucuda çizilmesi doğru davranış; `dynamic`
 * burada yalnız yığını böler.
 */

const AboutSection = dynamic(
  () => import("@/components/settings/sections/about/about-page").then((m) => m.AboutPage),
  { loading: () => <SettingsSkeleton /> },
);
const AccountSection = dynamic(
  () =>
    import("@/components/settings/sections/account/account-section").then((m) => m.AccountSection),
  { loading: () => <SettingsSkeleton /> },
);
const DesktopSection = dynamic(
  () =>
    import("@/components/settings/sections/desktop/desktop-section").then((m) => m.DesktopSection),
  { loading: () => <SettingsSkeleton /> },
);
const NotificationsSection = dynamic(
  () =>
    import("@/components/settings/sections/notifications/notifications-section").then(
      (m) => m.NotificationsSection,
    ),
  { loading: () => <SettingsSkeleton /> },
);

const AppearanceAccessibilityTab = dynamic(
  () =>
    import("@/components/settings/sections/appearance/accessibility-tab").then(
      (m) => m.AppearanceAccessibilityTab,
    ),
  { loading: () => <SettingsSkeleton /> },
);
const AppearanceLayoutTab = dynamic(
  () =>
    import("@/components/settings/sections/appearance/layout-tab").then(
      (m) => m.AppearanceLayoutTab,
    ),
  { loading: () => <SettingsSkeleton /> },
);
const AppearanceMediaTab = dynamic(
  () =>
    import("@/components/settings/sections/appearance/media-tab").then((m) => m.AppearanceMediaTab),
  { loading: () => <SettingsSkeleton /> },
);
const AppearanceTextTab = dynamic(
  () =>
    import("@/components/settings/sections/appearance/text-tab").then((m) => m.AppearanceTextTab),
  { loading: () => <SettingsSkeleton /> },
);
const AppearanceThemeTab = dynamic(
  () =>
    import("@/components/settings/sections/appearance/theme-tab").then((m) => m.AppearanceThemeTab),
  { loading: () => <SettingsSkeleton /> },
);
const AppearanceLanguageTab = dynamic(
  () =>
    import("@/components/settings/sections/appearance/language-tab").then(
      (m) => m.AppearanceLanguageTab,
    ),
  { loading: () => <SettingsSkeleton /> },
);
const AvAudioTab = dynamic(
  () => import("@/components/settings/sections/av/audio-tab").then((m) => m.AvAudioTab),
  { loading: () => <SettingsSkeleton /> },
);
const AvCameraTab = dynamic(
  () => import("@/components/settings/sections/av/camera-tab").then((m) => m.AvCameraTab),
  { loading: () => <SettingsSkeleton /> },
);
const AvScreenShareTab = dynamic(
  () =>
    import("@/components/settings/sections/av/screen-share-tab").then((m) => m.AvScreenShareTab),
  { loading: () => <SettingsSkeleton /> },
);

/** `dynamic()` bir `ComponentType` döndürüyor; harita bu yüzden bileşen tipiyle yazılıyor. */
type SettingsTabComponent = React.ComponentType<{ readonly tab?: SettingsTabDef }>;

const AV_TABS: Readonly<Partial<Record<SettingsTab, SettingsTabComponent>>> = {
  audio: AvAudioTab,
  camera: AvCameraTab,
  "screen-share": AvScreenShareTab,
};

const APPEARANCE_TABS: Readonly<Partial<Record<SettingsTab, SettingsTabComponent>>> = {
  language: AppearanceLanguageTab,
  accessibility: AppearanceAccessibilityTab,
  layout: AppearanceLayoutTab,
  media: AppearanceMediaTab,
  text: AppearanceTextTab,
  theme: AppearanceThemeTab,
};

function renderAvSection(input: SettingsSectionRenderInput): React.ReactNode {
  const Tab = AV_TABS[input.tab.key];

  return Tab ? <Tab tab={input.tab} /> : null;
}

function renderAppearanceSection(input: SettingsSectionRenderInput): React.ReactNode {
  const Tab = APPEARANCE_TABS[input.tab.key];

  return Tab ? <Tab tab={input.tab} /> : null;
}

type SectionRenderer = (
  input: SettingsSectionRenderInput,
  bootstrap: SettingsBootstrapPayload | null,
) => React.ReactNode;

const SECTION_RENDERERS: Readonly<Record<SettingsSection, SectionRenderer>> = {
  updates: (_input, bootstrap) => <DesktopSection bootstrap={bootstrap} tab="updates" />,
  about: (_input, bootstrap) => <AboutSection bootstrap={bootstrap} />,
  account: (input, bootstrap) => <AccountSection input={input} bootstrap={bootstrap} />,
  appearance: (input) => renderAppearanceSection(input),
  av: (input) => renderAvSection(input),
  desktop: (input, bootstrap) => <DesktopSection bootstrap={bootstrap} tab={input.tab.key} />,
  notifications: (input) => <NotificationsSection tab={input.tab.key} />,
};

/**
 * `SettingsWindow`'un `renderSection` yuvasına takılan tek fonksiyon.
 *
 * `key` bölüm **ve** sekmeden kuruluyor: bölüm köklerinin çoğu kendi değer kutusunu ilk
 * render'da (`useState(() => …)`) kuruyor ve sekme değiştiğinde ağacın yeniden bağlanmasını
 * istemiyoruz — ama bölüm değiştiğinde kutunun gerçekten yenilenmesi gerekiyor. React'in
 * kimliği bölümden geldiği için `key` yalnız bölüm anahtarını taşır; sekme prop'tur.
 */
export function renderSettingsSection(
  input: SettingsSectionRenderInput,
  bootstrap: SettingsBootstrapPayload | null = null,
): React.ReactNode {
  const render = SECTION_RENDERERS[input.section.key];

  return (
    <SettingsLadderProvider
      value={{
        openRisky: input.openRisky,
        openSelect: input.openSelect,
        toggleRisky: input.toggleRisky,
        toggleSelect: input.toggleSelect,
      }}
    >
      <React.Fragment key={input.section.key}>{render(input, bootstrap)}</React.Fragment>
    </SettingsLadderProvider>
  );
}
