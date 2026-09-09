"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { getMessageFontFamily, MESSAGE_FONT_OPTIONS } from "@/lib/message-fonts";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { useSettingValue } from "@/lib/settings/use-setting-value";

/**
 * Canlı mesaj önizlemesi (`m5`) — SPEC §5.3.
 *
 * İki örnek mesaj; `Mesaj fontu` (`m1`), `Mesaj boyutu` (`m2`) ve `Kompakt mesaj görünümü`
 * (`m4`) seçimi **anında** yansır. Blok kendi state'ini tutmaz: üç satırın değerini satır
 * motorunun kutusundan okur, yani önizleme ile satırlar arasında gecikme ya da ayrışma olamaz.
 *
 * Font adı bileşene gömülmez — `m1` bir dizin, dizin `MESSAGE_FONT_OPTIONS`'ta bir kimliğe,
 * kimlik `getMessageFontFamily` ile bir CSS değişkenine çevrilir. Dört fontun hiçbirinin adı bu
 * dosyada geçmez; testi de bunu tarıyor.
 */

const { messagePreview } = SETTINGS_METRICS.blocks;

/** Referanstaki iki mesaj; metinler sözlükten, ölçüler seçimden gelir. */
const PREVIEW_MESSAGES = [
  { avatarKey: "settings.block.msgPreview.1.initials", key: "1" },
  { avatarKey: "settings.block.msgPreview.2.initials", key: "2" },
] as const;

export function MessagePreviewBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const fontIndex = useSettingValue<number>("m1");
  const fontSize = useSettingValue<number>("m2");
  const compact = useSettingValue<boolean>("m4");

  const fontId = MESSAGE_FONT_OPTIONS[fontIndex.value]?.id ?? MESSAGE_FONT_OPTIONS[0]?.id;
  const fontFamily = getMessageFontFamily(fontId);
  const dense = compact.value;

  return (
    <div
      className="flex flex-col"
      data-block="msgPreview"
      data-compact={dense ? "true" : "false"}
      data-font={fontId}
      data-size={fontSize.value}
      data-testid={`settings-block-${rowDef.key}`}
      style={{
        gap: pxToRem(dense ? messagePreview.gap / 2 : messagePreview.gap),
        padding: `${pxToRem(messagePreview.paddingY)} ${pxToRem(messagePreview.paddingX)}`,
      }}
    >
      {PREVIEW_MESSAGES.map((message) => (
        <div className="flex" key={message.key} style={{ gap: pxToRem(11) }}>
          <span
            aria-hidden="true"
            className="grid flex-none place-items-center rounded-full"
            style={{
              background: "hsl(var(--primary) / 0.16)",
              color: "hsl(var(--primary))",
              fontSize: pxToRem(10),
              fontWeight: 600,
              height: pxToRem(messagePreview.avatarSize),
              width: pxToRem(messagePreview.avatarSize),
            }}
          >
            {t(message.avatarKey)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline" style={{ gap: pxToRem(8) }}>
              <span
                style={{
                  color: "hsl(var(--foreground))",
                  fontSize: pxToRem(dense ? 12 : 13),
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {t(`settings.block.msgPreview.${message.key}.name`)}
              </span>
              <span
                style={{
                  color: "hsl(var(--text-muted))",
                  fontSize: pxToRem(10.5),
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                {t(`settings.block.msgPreview.${message.key}.time`)}
              </span>
            </div>
            <div
              style={{
                color: "hsl(var(--text-secondary))",
                fontFamily,
                fontSize: pxToRem(fontSize.value),
                lineHeight: dense ? 1.35 : 1.55,
                marginTop: pxToRem(4),
                textWrap: "pretty",
              }}
            >
              {t(`settings.block.msgPreview.${message.key}.body`)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
