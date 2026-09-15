"use client";

import React, { useId, useRef } from "react";

import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { useSettingsSearchHighlight } from "@/components/settings/settings-search-highlight";
import type { SettingsTone } from "@/lib/settings/tree";
import { cn } from "@/lib/utils";

/**
 * Ayar satırı — SPEC-AYARLAR §4.4, PROMPT §3.
 *
 * **Tek kontrol ekseni.** Solda etiket, pil ve açıklama; sağda tek bir kontrol yuvası. On üç
 * kontrolün hepsi aynı yuvaya girer ve `flex-none` ile sağa yaslanır — bu yüzden hepsi aynı
 * hizada biter (1081 px). Kontrolün genişliği (38 px anahtar, 210 px menü, 260 px input) hizayı
 * değiştirmez çünkü hizayı yuva değil, satırın sağ kenarı belirler.
 *
 * **Açıklama kontrol yuvasının dışında.** Etiketle kontrol arasına sıkışan bir açıklama, uzun
 * cümlelerde kontrolü satırın ortasına kaydırır ve eksen bozulur; açıklama bu yüzden sol
 * kolonda, `max-width: 400` ile durur.
 *
 * `<720px` kontrol satırın altına iner — **CSS ile** (`min-[720px]:` varyantı). JavaScript ile
 * seçilen bir kırılım SSR anlık görüntüsünde yanlış kolonu çizer ve hidrasyon uyuşmazlığı doğar
 * (tuzak #10).
 *
 * Erişilebilirlik: satır `role="group"`; başlık ve açıklama `id` taşır, kontrol
 * `aria-labelledby` + `aria-describedby` ile ikisine bağlanır. Kontroller bu kimlikleri
 * `control` render prop'undan alır — kendileri `useId` çağırırsa satırın görünür etiketiyle
 * kontrolün erişilebilir adı iki ayrı dizeye ayrılır.
 */

const { row } = SETTINGS_METRICS;

/**
 * Pil tonu — `SettingsTone`'un beş değeri artı `primary`.
 *
 * `primary` ağaçta yok çünkü bir *anlam* tonu değil: kilitli anahtarın `Kilitli` pili referansta
 * `HH('primary','.14')` ile çiziliyor ve o pil bir uyarı ya da başarı bildirmiyor, "bu satır
 * ürünün kararı" diyor.
 */
export type SettingsRowBadgeTone = SettingsTone | "primary";

/** Ton bir **token adıdır**, renk değil (kalite çıtası). */
export const SETTINGS_TONE_TOKEN: Readonly<Record<SettingsRowBadgeTone, string>> = {
  danger: "--danger",
  info: "--info",
  muted: "--text-muted",
  primary: "--primary",
  success: "--success",
  warning: "--warning",
};

/** Referans `toneBg` — `muted` nötr zemine düşer. */
const TONE_BADGE_ALPHA: Readonly<Record<SettingsRowBadgeTone, number | null>> = {
  danger: 0.16,
  info: 0.16,
  muted: null,
  primary: 0.14,
  success: 0.16,
  warning: 0.18,
};

export type SettingsRowLabelIds = {
  readonly describedById: string | undefined;
  readonly labelledById: string;
};

export type SettingsRowProps = {
  readonly align?: "center" | "start";
  readonly badge?: string | undefined;
  readonly badgeTone?: SettingsRowBadgeTone | undefined;
  /** Satırın tamamının altına inen tam genişlikli parça (ses şeridi, riskli blok gövdesi). */
  readonly below?: React.ReactNode;
  /** Sağdaki kontrol yuvası — tek kontrol ekseni. */
  readonly control?: ((ids: SettingsRowLabelIds) => React.ReactNode) | undefined;
  readonly description?: string | undefined;
  /** İlk satır hariç her satırın **üst** kenarı ayırıcıdır. */
  readonly divider?: boolean;
  /** Sol kolonda, açıklamanın altında tam genişlikte duran alan (çok satırlı metin). */
  readonly field?: ((ids: SettingsRowLabelIds) => React.ReactNode) | undefined;
  readonly rowKey: string;
  readonly title?: string | undefined;
  /** `danger` satır zeminini ve başlığını tehlike tonuna çeker (referans `act`/`risky`). */
  readonly tone?: SettingsTone | undefined;
};

export function SettingsRow({
  align = "center",
  badge,
  badgeTone,
  below,
  control,
  description,
  divider = false,
  field,
  rowKey,
  title,
  tone,
}: SettingsRowProps) {
  const scope = useId();
  const labelledById = `${scope}-label`;
  const describedById = description ? `${scope}-description` : undefined;
  const ids: SettingsRowLabelIds = { describedById, labelledById };
  const danger = tone === "danger";
  const rowRef = useRef<HTMLDivElement>(null);
  const highlighted = useSettingsSearchHighlight(rowKey, rowRef);

  return (
    <div
      className={highlighted ? "settings-search-highlight" : undefined}
      data-setting-row={rowKey}
      data-settings-search-highlight={highlighted || undefined}
      ref={rowRef}
      role="group"
      style={{
        ...(danger ? { background: "hsl(var(--danger) / 0.05)" } : {}),
        ...(divider
          ? {
              borderTop: `${hairline(row.dividerWidth)} solid hsl(var(--border) / ${row.dividerAlpha})`,
            }
          : {}),
        padding: `${pxToRem(row.paddingY)} ${pxToRem(row.paddingX)}`,
      }}
    >
      <div
        className={cn(
          "flex flex-col min-[720px]:flex-row",
          align === "start"
            ? "items-stretch min-[720px]:items-start"
            : "items-stretch min-[720px]:items-center",
        )}
        style={{ gap: pxToRem(row.headGap) }}
      >
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {title ? (
            <div
              className="flex min-w-0 flex-wrap items-center"
              style={{ gap: pxToRem(row.labelGap) }}
            >
              <span
                className={cn(
                  "min-w-0",
                  danger ? "text-[var(--danger-readable)]" : "text-[hsl(var(--foreground))]",
                )}
                id={labelledById}
                style={{
                  fontSize: pxToRem(row.titleFontSize),
                  fontWeight: row.titleWeight,
                  lineHeight: row.titleLineHeight,
                }}
              >
                {title}
              </span>
              {badge ? <SettingsRowBadge label={badge} tone={badgeTone ?? "muted"} /> : null}
            </div>
          ) : null}

          {description ? (
            <div
              className="text-pretty text-[hsl(var(--text-muted))]"
              id={describedById}
              style={{
                fontSize: pxToRem(row.subFontSize),
                lineHeight: row.subLineHeight,
                marginTop: pxToRem(row.subMarginTop),
                maxWidth: pxToRem(row.subMaxWidth),
              }}
            >
              {description}
            </div>
          ) : null}

          {field ? field(ids) : null}
        </div>

        {/* Tek kontrol ekseni: yuva satırın sonundadır ve büyümez. */}
        {control ? (
          <div
            className="flex min-w-0 max-w-full shrink-0 items-center justify-end [&>*]:max-w-full"
            data-setting-control={rowKey}
          >
            {control(ids)}
          </div>
        ) : null}
      </div>

      {below}
    </div>
  );
}

function SettingsRowBadge({ label, tone }: { label: string; tone: SettingsRowBadgeTone }) {
  const token = SETTINGS_TONE_TOKEN[tone];
  const alpha = TONE_BADGE_ALPHA[tone];

  return (
    <span
      className="rounded-full"
      style={{
        background: alpha === null ? "hsl(var(--surface-soft))" : `hsl(var(${token}) / ${alpha})`,
        color: `hsl(var(${token}))`,
        fontSize: pxToRem(row.badgeFontSize),
        fontWeight: 600,
        lineHeight: row.badgeLineHeight,
        padding: `${pxToRem(row.badgePaddingY)} ${pxToRem(row.badgePaddingX)}`,
      }}
    >
      {label}
    </span>
  );
}
