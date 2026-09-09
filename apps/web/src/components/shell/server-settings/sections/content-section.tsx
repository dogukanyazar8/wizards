"use client";

import React from "react";

import { CHANNEL_SLOW_MODE_DELAYS } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { OptionChipGroup } from "@/components/servers/shared/option-chip-group";
import { SettingsToggleRow } from "@/components/shell/server-settings/settings-primitives";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import {
  selectDeletedNoticeOptions,
  selectMessageLimitOptions,
} from "@/lib/servers/server-settings-model";

/**
 * SPEC-SUNUCU §8.3 — `İçerik ve Mesajlaşma`.
 *
 * İki anahtar satırı ve üç seçenek kartı. Üçüncü kart (`Sunucu genelinde yavaş mod`) **gerçek**
 * bir ayardır: `Server.slowModeDelay` kolonuna yazar ve mesaj gönderiminde
 * `max(server, channel)` olarak uygulanır (Ş1 · `channel-slow-mode.ts`). SPEC'in "Yakında"
 * etiketi yok.
 *
 * **K7:** `Silinen mesaj bildirimi` kartında sunucunun **kayıtlı** değeri seçili gelir; SPEC'in
 * 15 dakikalık varsayılanı yalnız yeni sunucuya uygulanır. Kayıtlı değer listede yoksa listeye
 * eklenir — çip grubunun boş görünmesi, ayarın kapalı olduğu yalanını söylerdi.
 */

const GIF_PATH = "M3 5h18v14H3zM10 10.5A2 2 0 1 0 10 14h1v-1.6";
const FILE_PATH = "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z";

const MINUTE_IN_SECONDS = 60;
const MINUTES_IN_HOUR = 60;
/** `2B` kolonun varsayılanıdır; SPEC §8.3 çipi bu tek değer için kısaltıyor. */
const MESSAGE_LIMIT_DEFAULT = 2000;

const { settingsSections } = SERVER_METRICS;

type Translate = (key: string, values?: Record<string, number | string>) => string;

/** §8.3'ün üç etiketi: `2B` · `250` · `40.000`. */
function messageLimitLabel(t: Translate, limit: number, locale: string): string {
  return limit === MESSAGE_LIMIT_DEFAULT
    ? t("server.settings.content.messageLimit.default")
    : new Intl.NumberFormat(locale).format(limit);
}

/**
 * §8.3'ün yedi etiketi: `5 dakika` … `24 saat`. Eşik `60` dakikada; `1440` da saat olarak
 * yazılır (`24 saat`), gün olarak değil — SPEC listesi öyle.
 */
function deletedNoticeLabel(t: Translate, minutes: number): string {
  return minutes < MINUTES_IN_HOUR
    ? t("server.settings.content.deletedNotice.minutes", { count: minutes })
    : t("server.settings.content.deletedNotice.hours", { count: minutes / MINUTES_IN_HOUR });
}

/**
 * Kanal penceresiyle **aynı** on iki etiket (`server.channel.slowMode.*`). İkinci bir sözlük
 * yazılsaydı `1 dk` bir yüzeyde `60 sn` olurdu ve iki süre aynı kolona yazıyor.
 */
function slowModeLabel(t: Translate, delay: number): string {
  if (delay === 0) {
    return t("server.channel.slowMode.off");
  }

  return delay < MINUTE_IN_SECONDS
    ? t("server.channel.slowMode.seconds", { count: delay })
    : t("server.channel.slowMode.minutes", { count: delay / MINUTE_IN_SECONDS });
}

export function ContentSection({ draft, patch }: ServerSettingsSectionProps) {
  const { locale, t } = useI18n();

  return (
    <div data-testid="server-settings-content">
      <div className="flex flex-col" style={{ gap: pxToRem(settingsSections.visibilityRowsGap) }}>
        <SettingsToggleRow
          checked={draft.allowGifs}
          description={t("server.settings.content.gifs.description")}
          iconPath={GIF_PATH}
          onChange={(checked) => patch({ allowGifs: checked })}
          testId="server-media-gifs-toggle"
          title={t("server.settings.content.gifs.title")}
          tone="primary"
        />
        <SettingsToggleRow
          checked={draft.allowFileUploads}
          description={t("server.settings.content.files.description")}
          iconPath={FILE_PATH}
          onChange={(checked) => patch({ allowFileUploads: checked })}
          testId="server-media-files-toggle"
          title={t("server.settings.content.files.title")}
          tone="info"
        />
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(settingsSections.contentOptionsGap),
          marginTop: pxToRem(settingsSections.contentOptionsMarginTop),
        }}
      >
        <OptionChipGroup
          description={t("server.settings.content.messageLimit.description")}
          onChange={(next) => patch({ messageCharacterLimit: Number(next) })}
          options={selectMessageLimitOptions(draft.messageCharacterLimit).map((limit) => ({
            label: messageLimitLabel(t, limit, locale),
            value: String(limit),
          }))}
          testId="server-settings-message-limit"
          title={t("server.settings.content.messageLimit.title")}
          value={String(draft.messageCharacterLimit)}
          variant="settings"
        />

        <OptionChipGroup
          description={t("server.settings.content.deletedNotice.description")}
          onChange={(next) => patch({ deletedMessageNoticeMinutes: Number(next) })}
          options={selectDeletedNoticeOptions(draft.deletedMessageNoticeMinutes).map((minutes) => ({
            label: deletedNoticeLabel(t, minutes),
            value: String(minutes),
          }))}
          testId="server-settings-deleted-notice"
          title={t("server.settings.content.deletedNotice.title")}
          value={String(draft.deletedMessageNoticeMinutes)}
          variant="settings"
        />

        <OptionChipGroup
          description={t("server.settings.content.slowMode.description")}
          onChange={(next) => patch({ slowModeDelay: Number(next) })}
          options={CHANNEL_SLOW_MODE_DELAYS.map((delay) => ({
            label: slowModeLabel(t, delay),
            value: String(delay),
          }))}
          testId="server-settings-slow-mode"
          title={t("server.settings.content.slowMode.title")}
          value={String(draft.slowModeDelay)}
          variant="settings"
        />
      </div>
    </div>
  );
}

export default ContentSection;
