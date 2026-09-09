"use client";

import React from "react";
import { X } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SettingSelect } from "@/components/settings/rows/setting-select";
import { useNotificationsSection } from "@/components/settings/sections/notifications/notifications-section-context";
import type {
  NotificationException,
  NotificationExceptionLevel,
  NotificationExceptionScope,
} from "@/lib/notifications/exceptions-service";
import { canRemoveException, canUpdateException } from "@/lib/settings/exceptions-client";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import { useSettingsRowRuntime } from "@/lib/settings/use-setting-value";

/**
 * Ayarlar paketi — Dalga 3 / Ş9 §7. `Aktif istisnalar` — üç tablonun tek listesi (K4).
 *
 * Liste **gerçek** veridir. Tasarımdaki altı satır (`Oyun Kulübü Türkiye`, `#duyurular`, …)
 * örnek veridir ve boş listede çizilmez: bir kullanıcıya hiç kurmadığı istisnaları göstermek,
 * onu olmayan bir ayarı aramaya gönderirdi. Liste boşsa grup boş durum metnini yazar.
 *
 * Yazma satırın **kendi** kaynağına gider (`updateException`); blok üç ucu bilmez. Karşılığı
 * olmayan kapsam (`server`) düğmeyi `disabled` çizer ve nedenini `title` ile söyler — hiçbir
 * şey yapmayan bir düğme, kullanıcıya tercihini kaydettiğini sandırırdı.
 *
 * Düzey menüsü `Düzenle`nin **yerine** açılır: aynı yuvada iki kontrol yan yana durursa satırın
 * sağ ekseni bozulur (PROMPT §3). Menü tekliği motorun merdivenini kullanır (tuzak #12) —
 * ikinci bir "açık menü" durumu kurulmuyor.
 */

const { exceptions } = SETTINGS_METRICS.blocks;
const { row } = SETTINGS_METRICS;

/** Ton **token adıdır**, renk değil (kalite çıtası). */
const LEVEL_TONE_TOKEN: Readonly<Record<NotificationExceptionLevel, string>> = {
  all: "--success",
  important: "--warning",
  mentions: "--primary",
  muted: "--text-muted",
  off: "--danger",
};

const LEVEL_LABEL_KEY: Readonly<Record<NotificationExceptionLevel, string>> = {
  all: "settings.block.exceptions.level.all",
  important: "settings.block.exceptions.level.important",
  mentions: "settings.block.exceptions.level.mentions",
  muted: "settings.block.exceptions.level.muted",
  off: "settings.block.exceptions.level.off",
};

const SCOPE_LABEL_KEY: Readonly<Record<NotificationExceptionScope, string>> = {
  channel: "settings.block.exceptions.scope.channel",
  dm: "settings.block.exceptions.scope.dm",
  server: "settings.block.exceptions.scope.server",
};

/**
 * Menüde yazılabilir dört düzey.
 *
 * `important` listede **yok** çünkü yazacak ucu yok: `UserChannelSettings` ve `DMParticipant`
 * `suppress*` kolonu taşımıyor (Ş4). Satırın kendisi `Yalnızca önemli` görünmeye devam eder —
 * okunabilen ama yazılamayan bir durum, uydurulmuş bir seçenekten iyidir.
 */
const EDITABLE_LEVELS: readonly NotificationExceptionLevel[] = ["all", "mentions", "muted", "off"];

/**
 * Türkçe saat okunuşunun son ünlüsü — `18:00’a` ile `18:45’e` arasındaki fark.
 *
 * Ek koda gömülmedi, iki ayrı sözlük anahtarı seçiliyor: `’a` bir metin parçası ve İngilizce
 * karşılığında hiç yok. Onluk basamak yalnız birler sıfırken okunur (`kırk beş` → `beş`).
 */
const UNIT_VOWEL: readonly ("a" | "e")[] = ["a", "e", "e", "e", "e", "e", "a", "e", "e", "a"];
const TENS_VOWEL: readonly ("a" | "e")[] = ["a", "a", "e", "a", "a", "e"];

export function resolveClockVowel(minutes: number): "a" | "e" {
  const unit = minutes % 10;

  if (unit === 0) {
    return TENS_VOWEL[Math.floor((minutes % 60) / 10)] ?? "a";
  }

  return UNIT_VOWEL[unit] ?? "a";
}

export function resolveExceptionGlyph(exception: NotificationException): string {
  if (exception.scope === "channel") return "#";

  const initials = exception.name
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr"))
    .join("");

  return initials || "?";
}

export function ExceptionsBlock({ row: rowDef }: SettingsBlockProps) {
  const { locale, t } = useI18n();
  const section = useNotificationsSection();
  const runtime = useSettingsRowRuntime();

  const list = section.exceptions;

  if (section.exceptionsState === "loading" && !list) {
    return (
      <div
        aria-busy="true"
        className="motion-safe:animate-pulse"
        data-block="exceptions"
        data-setting-block={rowDef.key}
        role="status"
        style={{
          background: `hsl(var(--surface-soft) / ${SETTINGS_METRICS.body.skeletonSurfaceAlpha})`,
          height: pxToRem(SETTINGS_METRICS.body.skeletonHeights[1] ?? 150),
        }}
      >
        <span className="sr-only">{t("settings.control.block.loading")}</span>
      </div>
    );
  }

  const items = list?.items ?? [];

  if (items.length === 0) {
    return (
      <div
        data-block="exceptions"
        data-setting-block={rowDef.key}
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(row.subFontSize),
          lineHeight: row.subLineHeight,
          padding: `${pxToRem(exceptions.rowPaddingY)} ${pxToRem(exceptions.rowPaddingX)}`,
        }}
      >
        {t(
          section.exceptionsState === "error"
            ? "settings.block.exceptions.error"
            : "settings.block.exceptions.empty",
        )}
      </div>
    );
  }

  return (
    <div data-block="exceptions" data-setting-block={rowDef.key}>
      {items.map((exception, index) => (
        <ExceptionRow
          divider={index > 0}
          exception={exception}
          key={exception.id}
          locale={locale}
          onEdit={section.onEditException}
          onRemove={section.onRemoveException}
          openMenuKey={runtime.openSelect}
          pending={section.pendingExceptionId === exception.id}
          setOpenMenuKey={runtime.setOpenSelect}
        />
      ))}

      {list?.truncated ? (
        <div
          style={{
            borderTop: `${hairline(row.dividerWidth)} solid hsl(var(--border) / ${row.dividerAlpha})`,
            color: "hsl(var(--text-muted))",
            fontSize: pxToRem(row.subFontSize),
            lineHeight: row.subLineHeight,
            padding: `${pxToRem(exceptions.rowPaddingY)} ${pxToRem(exceptions.rowPaddingX)}`,
          }}
        >
          {t("settings.block.exceptions.truncated", { count: items.length })}
        </div>
      ) : null}
    </div>
  );
}

type ExceptionRowProps = {
  readonly divider: boolean;
  readonly exception: NotificationException;
  readonly locale: string;
  readonly onEdit: (exception: NotificationException, level: NotificationExceptionLevel) => void;
  readonly onRemove: (exception: NotificationException) => void;
  readonly openMenuKey: string | null;
  readonly pending: boolean;
  readonly setOpenMenuKey: (key: string | null) => void;
};

function ExceptionRow({
  divider,
  exception,
  locale,
  onEdit,
  onRemove,
  openMenuKey,
  pending,
  setOpenMenuKey,
}: ExceptionRowProps) {
  const { t } = useI18n();

  const menuKey = `exception:${exception.id}`;
  const open = openMenuKey === menuKey;
  const editable = canUpdateException(exception.scope) && !pending;
  const removable = canRemoveException(exception.scope) && !pending;
  const toneToken = LEVEL_TONE_TOKEN[exception.level];
  const neutral = toneToken === "--text-muted";

  const summary = t("settings.block.exceptions.summary", {
    level: t(LEVEL_LABEL_KEY[exception.level]),
    scope: t(SCOPE_LABEL_KEY[exception.scope]),
  });

  const until = resolveUntilLabel(exception, locale, t);

  return (
    <div
      className="flex items-center"
      data-setting-exception={exception.id}
      style={{
        ...(divider
          ? {
              borderTop: `${hairline(row.dividerWidth)} solid hsl(var(--border) / ${row.dividerAlpha})`,
            }
          : {}),
        gap: pxToRem(exceptions.rowGap),
        padding: `${pxToRem(exceptions.rowPaddingY)} ${pxToRem(exceptions.rowPaddingX)}`,
      }}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center font-display overflow-hidden"
        style={{
          background: neutral
            ? "hsl(var(--surface-soft))"
            : `hsl(var(${toneToken}) / ${exceptions.glyphSurfaceAlpha})`,
          borderRadius: pxToRem(exceptions.glyphRadius),
          color: `hsl(var(${toneToken}))`,
          fontSize: pxToRem(exceptions.glyphFontSize),
          fontWeight: 600,
          height: pxToRem(exceptions.glyphSize),
          lineHeight: 1,
          width: pxToRem(exceptions.glyphSize),
        }}
      >
        {exception.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- kaynak dış CDN; blok tek satırlık bir rozet çiziyor
          <img alt="" className="h-full w-full object-cover" src={exception.iconUrl} />
        ) : (
          resolveExceptionGlyph(exception)
        )}
      </span>

      <span className="block min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(exceptions.nameFontSize),
            fontWeight: 600,
            lineHeight: exceptions.nameLineHeight,
          }}
        >
          {exception.name}
        </span>
        <span
          className="block text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(exceptions.levelFontSize),
            lineHeight: exceptions.levelLineHeight,
            marginTop: pxToRem(exceptions.levelMarginTop),
          }}
        >
          {summary}
        </span>
      </span>

      {until ? (
        <span
          className="shrink-0 whitespace-nowrap rounded-full bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(exceptions.untilPillFontSize),
            fontWeight: 600,
            lineHeight: exceptions.untilPillLineHeight,
            padding: `${pxToRem(exceptions.untilPillPaddingY)} ${pxToRem(exceptions.untilPillPaddingX)}`,
          }}
        >
          {until}
        </span>
      ) : null}

      {open ? (
        <SettingSelect
          onChange={(index) => {
            const level = EDITABLE_LEVELS[index];

            setOpenMenuKey(null);

            if (level) onEdit(exception, level);
          }}
          onOpenChange={(next) => setOpenMenuKey(next ? menuKey : null)}
          open
          options={EDITABLE_LEVELS.map((level) => ({
            label: t(LEVEL_LABEL_KEY[level]),
            toneToken: LEVEL_TONE_TOKEN[level],
          }))}
          testId={`setting-exception-level-${exception.id}`}
          value={Math.max(0, EDITABLE_LEVELS.indexOf(exception.level))}
        />
      ) : (
        <button
          className="shrink-0 whitespace-nowrap bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55"
          data-testid={`setting-exception-edit-${exception.id}`}
          disabled={!editable}
          onClick={() => setOpenMenuKey(menuKey)}
          style={{
            border: `${hairline()} solid hsl(var(--border) / ${exceptions.editBorderAlpha})`,
            borderRadius: pxToRem(exceptions.editRadius),
            fontSize: pxToRem(exceptions.editFontSize),
            fontWeight: 600,
            height: pxToRem(exceptions.editHeight),
            padding: `0 ${pxToRem(exceptions.editPaddingX)}`,
          }}
          title={editable ? undefined : t("settings.block.exceptions.unsupported")}
          type="button"
        >
          {t("settings.block.exceptions.edit")}
        </button>
      )}

      <button
        aria-label={t("settings.block.exceptions.remove")}
        className="grid shrink-0 place-items-center bg-transparent text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent disabled:hover:text-[hsl(var(--text-muted))]"
        data-testid={`setting-exception-remove-${exception.id}`}
        disabled={!removable}
        onClick={() => onRemove(exception)}
        style={{
          border: `${hairline()} solid hsl(var(--border) / ${exceptions.removeBorderAlpha})`,
          borderRadius: pxToRem(exceptions.removeRadius),
          height: pxToRem(exceptions.removeSize),
          transitionDuration: `${SETTINGS_METRICS.motion.transitionSeconds}s`,
          width: pxToRem(exceptions.removeSize),
        }}
        title={removable ? undefined : t("settings.block.exceptions.unsupported")}
        type="button"
      >
        <X
          aria-hidden="true"
          style={{
            height: pxToEm(exceptions.removeIconSize),
            width: pxToEm(exceptions.removeIconSize),
          }}
        />
      </button>
    </div>
  );
}

/**
 * Sessize almanın bitişi.
 *
 * `mutedUntil === null` **süresiz** demektir, "bitmiş" değil (şema notu): o satır
 * `Ben açana kadar` yazar ve metin `ne1`'in dördüncü seçeneğiyle aynı cümledir — aynı şeyi iki
 * kez yazmak, bir gün ikisinden birini düzeltmeyi unutmak demek.
 */
function resolveUntilLabel(
  exception: NotificationException,
  locale: string,
  t: (key: string, values?: Record<string, number | string>) => string,
): string | null {
  if (exception.level !== "muted") return null;

  if (!exception.mutedUntil) return t("settings.option.ne1.4");

  const until = new Date(exception.mutedUntil);

  if (Number.isNaN(until.getTime())) return null;

  const value = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
  }).format(until);

  return t(`settings.block.exceptions.untilVowel_${resolveClockVowel(until.getMinutes())}`, {
    value,
  });
}
