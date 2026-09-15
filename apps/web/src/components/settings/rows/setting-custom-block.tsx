"use client";

import React, { type ComponentType, useRef } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingsRow } from "./settings-row";

import { AboutCardBlock } from "@/components/settings/blocks/about-card-block";
import { ActiveSessionsBlock } from "@/components/settings/blocks/active-sessions-block";
import { BadgeGridBlock } from "@/components/settings/blocks/badge-grid-block";
import { CameraPreviewBlock } from "@/components/settings/blocks/camera-preview-block";
import { ContributorsBlock } from "@/components/settings/blocks/contributors-block";
import { DiagnosticsBlock } from "@/components/settings/blocks/diagnostics-block";
import { ExceptionsBlock } from "@/components/settings/blocks/exceptions-block";
import { MessagePreviewBlock } from "@/components/settings/blocks/message-preview-block";
import { ConnectionsBlock } from "@/components/settings/blocks/connections-block";
import { MicLevelMeterBlock } from "@/components/settings/blocks/mic-level-meter-block";
import { ProfileHeroCard } from "@/components/settings/blocks/profile-hero-card";
import { ProfileEmojiBlock } from "@/components/settings/blocks/profile-emoji-block";
import { SecurityEventsBlock } from "@/components/settings/blocks/security-events-block";
import { PermissionsBlock } from "@/components/settings/blocks/permissions-block";
import { ShortcutsBlock } from "@/components/settings/blocks/shortcuts-block";
import { NotifSummaryBlock } from "@/components/settings/blocks/notif-summary-block";
import { SimpleThemeBlock } from "@/components/settings/blocks/simple-theme-block";
import { ThemeGridBlock } from "@/components/settings/blocks/theme-grid-block";
import { VersionGridBlock } from "@/components/settings/blocks/version-grid-block";
import { WhatsNewBlock } from "@/components/settings/blocks/whats-new-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import type { SettingsBlockKey, SettingsRowDef } from "@/lib/settings/tree";
import { useSettingsSearchHighlight } from "@/components/settings/settings-search-highlight";

/**
 * Özel blok kayıt defteri — Ş6 §7.
 *
 * Yirmi blok satır motoruna sığmaz (tema ızgarası, rozet ızgarası, mikrofon ölçeri, tanılama…).
 * Defter onları **anahtardan** çözer; Ş7–Ş10 kendi bloğunu kendi satırına yazar ve dört şerit
 * paralel çalışırken aynı dosyada çakışmaz — her şerit yalnız kendi anahtarlarının satırını
 * değiştirir.
 *
 * Ş6 defteri **boş yer tutucularla** kurar: her blok bir iskelet çizer ve `data-block`
 * niteliğini bırakır. Yer tutucu bir yalan değil, bir sözleşme — `renderSettingsTab` bugün 169
 * satırın tamamını çizebiliyor ve hangi bloğun sahibi gelmediği ekranda **görünür** kalıyor.
 *
 * `fullWidth` bloklar kendi içinde kırpar (tuzak #6): hero kartının banner'ı ile tema ızgarası
 * grup kabının yarıçapına oturmak zorunda, ama kırpma **onların** kabında olur, grubun kabında
 * değil — grup kırpsa 22 açılır menü kesilirdi.
 */

const { row } = SETTINGS_METRICS;

export type SettingsBlockProps = {
  /** Ş7–Ş10 `descriptionData` / `titleData` / `badgeData` alanlarını buradan okur. */
  readonly data: Readonly<Record<string, string>>;
  readonly row: SettingsRowDef;
};

/**
 * Satırın **içinde** duran iki blok — K13'ün "satır motoruna sığmayan iki parça"sı.
 *
 * Liste ters yönde tutuluyor çünkü ayrım ölçü sözlüğünden okunabiliyor: on sekiz bloğun
 * kaydında kendi satır/hücre dolgusu var (`rowPaddingX`, `cellPaddingX`, `columns`), yani
 * kabın tamamını kendileri döşüyor ve satır dolgusu eklenirse dolgu iki kez uygulanır.
 * `mic` (96 px etiket + 14 segmentli ölçer) ve `camera` (220 px önizleme) ise tek bir kontrol
 * gibi davranır ve satırın sağ ekseninde durur.
 */
export const SETTINGS_INLINE_BLOCKS: readonly SettingsBlockKey[] = [
  "camera",
  "mic",
  "profileEmoji",
];

export function isFullWidthSettingsBlock(key: SettingsBlockKey): boolean {
  return !SETTINGS_INLINE_BLOCKS.includes(key);
}

/**
 * Yirmi yuva. Anahtar sırası `SettingsBlockKey` birleşimiyle aynı; blokların ölçüsü
 * `SETTINGS_METRICS.blocks` altında kayıtlı.
 *
 * Yer tutucular **silindi**: Ş6 defteri boş iskeletlerle kurmuştu ve son iki yuva (Ş9'un
 * `notifSummary` ve `exceptions` blokları) dolduğunda yirmisinin de sahibi geldi. Bir yuva
 * daha eklenirse sahibi de aynı anda gelir — sahipsiz bir anahtar artık derlenmez.
 */
export const SETTINGS_BLOCKS: Readonly<
  Record<SettingsBlockKey, ComponentType<SettingsBlockProps>>
> = {
  about: AboutCardBlock,
  badges: BadgeGridBlock,
  camera: CameraPreviewBlock,
  connections: ConnectionsBlock,
  contributors: ContributorsBlock,
  diag: DiagnosticsBlock,
  exceptions: ExceptionsBlock,
  hero: ProfileHeroCard,
  profileEmoji: () => <ProfileEmojiBlock />,
  mic: MicLevelMeterBlock,
  msgPreview: MessagePreviewBlock,
  notifSummary: NotifSummaryBlock,
  perms: PermissionsBlock,
  secEvents: SecurityEventsBlock,
  sessions: ActiveSessionsBlock,
  shortcuts: ShortcutsBlock,
  themeGrid: ThemeGridBlock,
  themes: SimpleThemeBlock,
  version: VersionGridBlock,
  whatsNew: WhatsNewBlock,
};

export type SettingCustomBlockProps = {
  readonly data: Readonly<Record<string, string>>;
  readonly divider?: boolean;
  readonly row: SettingsRowDef;
};

/**
 * Blok satırı. `fullWidth` bloklarda satır dolgusu **yoktur** — kart kendi kenarına oturur ve
 * kırpmayı kendi yarıçapıyla yapar; kalanlar normal satır dolgusuyla çizilir.
 */
export function SettingCustomBlock({
  data,
  divider = false,
  row: rowDef,
}: SettingCustomBlockProps) {
  const { t } = useI18n();
  const rowRef = useRef<HTMLDivElement>(null);
  const highlighted = useSettingsSearchHighlight(rowDef.key, rowRef);
  const key = rowDef.block;

  if (!key) {
    return null;
  }

  const Block = SETTINGS_BLOCKS[key];
  const fullWidth = isFullWidthSettingsBlock(key);

  if (key === "profileEmoji") {
    return (
      <SettingsRow
        divider={divider}
        rowKey={rowDef.key}
        title={rowDef.titleKey ? t(rowDef.titleKey) : undefined}
        description={rowDef.descriptionKey ? t(rowDef.descriptionKey) : undefined}
        control={(ids) => <ProfileEmojiBlock {...ids} />}
      />
    );
  }

  return (
    <div
      className={highlighted ? "settings-search-highlight" : undefined}
      data-setting-row={rowDef.key}
      data-settings-search-highlight={highlighted || undefined}
      ref={rowRef}
      role="group"
      style={{
        ...(divider
          ? {
              borderTop: `${hairline(row.dividerWidth)} solid hsl(var(--border) / ${row.dividerAlpha})`,
            }
          : {}),
        ...(fullWidth
          ? { borderRadius: pxToRem(row.customRadius), overflow: "hidden" }
          : { padding: `${pxToRem(row.paddingY)} ${pxToRem(row.paddingX)}` }),
      }}
    >
      <Block data={data} row={rowDef} />
    </div>
  );
}
