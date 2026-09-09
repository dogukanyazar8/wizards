"use client";

import React, { useRef } from "react";
import type { DMNotifyLevel } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * `BİLDİRİM AYARLARI` — SPEC-MESAJLAR §15.5.1.
 *
 * Üç seçenek, tek yazma. `Kapalı` yalnız bir bildirim tercihi değil, aynı zamanda
 * `DMParticipant.muted` alanının kendisidir (00-ortak-baglam tuzak 5): iki kolon
 * **ikizdir** ve `PATCH /api/v1/dm/[id]/notify` ikisini de tek `update` içinde
 * yazar. `notifyWriteFields` bu ikizliği istemci tarafında da tek yerde tutar —
 * iyimser önbellek yaması ile sunucunun yazdığı satır ayrışırsa arayüz "sessiz
 * değil" derken bildirimler susardı.
 *
 * `Kapalı`'dan çıkmak `ALL` yazar, önceki tier'i **geri getirmez** (Ş4 raporu §3:
 * önceki seviyeyi saklayan kolon yok). Radyo bunu gizlemez; kullanıcı `Kapalı`'yı
 * bırakınca işaretin `Tüm mesajlar`'a gitmesi gerçeğin ta kendisidir.
 */

const { profilePanel } = MESSAGES_METRICS;

export type NotifyChoice = {
  readonly level: DMNotifyLevel;
  readonly subtitleKey: string;
  readonly titleKey: string;
};

/** Tasarımdaki sıra: en gürültülüden en sessize. */
export const NOTIFY_CHOICES: readonly NotifyChoice[] = Object.freeze([
  {
    level: "ALL",
    subtitleKey: "messages.profile.notify.all.subtitle",
    titleKey: "messages.profile.notify.all.title",
  },
  {
    level: "MENTIONS",
    subtitleKey: "messages.profile.notify.mentions.subtitle",
    titleKey: "messages.profile.notify.mentions.title",
  },
  {
    level: "NONE",
    subtitleKey: "messages.profile.notify.none.subtitle",
    titleKey: "messages.profile.notify.none.title",
  },
] satisfies readonly NotifyChoice[]);

/**
 * Bir seviyenin katılımcı satırında karşılığı olan **iki** alan.
 *
 * Uç gövdesi yalnız `notifyLevel` taşır; `muted` sunucuda aynı `update` içinde
 * türetilir (`lib/dm/group-service.ts` → `setNotifyLevel`). Bu fonksiyon o
 * türetmenin istemci kopyasıdır ve yalnız **iyimser** önbellek yaması için
 * kullanılır — ikinci bir istek atmak için değil.
 */
export function notifyWriteFields(level: DMNotifyLevel): {
  muted: boolean;
  notifyLevel: DMNotifyLevel;
} {
  return { muted: level === "NONE", notifyLevel: level };
}

/**
 * Radyo grubunda ok tuşlarının götürdüğü indeks (kural 6).
 *
 * `null` "bu tuş bize ait değil" demektir; bileşen o durumda `preventDefault`
 * çağırmaz, yoksa `Tab` ve `Escape` gibi tuşlar radyo grubunda ölürdü.
 */
export function nextRadioIndex(key: string, index: number, count: number): number | null {
  if (count === 0) {
    return null;
  }

  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export type NotificationChoiceCardsProps = {
  /** Bekleyen yazma sırasında kartlar tıklanamaz olur, gizlenmez. */
  disabled?: boolean;
  /** Grubu `GİZLİLİK…` gibi görünür bölüm etiketine bağlar. */
  labelledById?: string | undefined;
  onSelect: (level: DMNotifyLevel) => void;
  value: DMNotifyLevel;
};

export function NotificationChoiceCards({
  disabled = false,
  labelledById,
  onSelect,
  value,
}: NotificationChoiceCardsProps) {
  const { t } = useI18n();
  const refs = useRef(new Map<DMNotifyLevel, HTMLButtonElement>());

  const move = (index: number) => {
    const choice = NOTIFY_CHOICES[index];

    if (!choice) {
      return;
    }

    onSelect(choice.level);
    // Odak seçimle birlikte taşınır: `aria-checked` değişip odak eski kartta
    // kalırsa ekran okuyucu seçili olmayan satırı okumaya devam eder.
    refs.current.get(choice.level)?.focus();
  };

  return (
    <div
      aria-labelledby={labelledById}
      className="flex flex-col"
      data-testid="profile-notify-group"
      role="radiogroup"
      style={{
        gap: pxToRem(profilePanel.notifyListGap),
        marginTop: pxToRem(profilePanel.notifyMarginTop),
      }}
    >
      {NOTIFY_CHOICES.map((choice, index) => {
        const selected = choice.level === value;

        return (
          <button
            aria-checked={selected}
            className={cn(
              "flex items-center text-left transition-[background-color,border-color] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
            data-testid={`profile-notify-${choice.level}`}
            disabled={disabled}
            key={choice.level}
            onClick={() => onSelect(choice.level)}
            onKeyDown={(event) => {
              const next = nextRadioIndex(event.key, index, NOTIFY_CHOICES.length);

              if (next === null) {
                return;
              }

              event.preventDefault();
              move(next);
            }}
            ref={(node) => {
              if (node) {
                refs.current.set(choice.level, node);
              } else {
                refs.current.delete(choice.level);
              }
            }}
            role="radio"
            style={{
              background: selected ? "hsl(var(--primary)/0.09)" : "hsl(var(--surface-card))",
              borderColor: selected ? "hsl(var(--primary)/0.45)" : "hsl(var(--border)/0.6)",
              borderRadius: pxToRem(profilePanel.notifyCardRadius),
              borderStyle: "solid",
              borderWidth: hairline(),
              gap: pxToRem(profilePanel.notifyCardGap),
              padding: pxToRem(profilePanel.notifyCardPadding),
            }}
            // Roving tabindex: sekme turunda yalnız seçili kart durur, üç kart
            // için üç durak olmaz.
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center rounded-full"
              style={{
                borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border))",
                borderStyle: "solid",
                borderWidth: pxToRem(profilePanel.notifyRadioBorderWidth),
                height: pxToRem(profilePanel.notifyRadioSize),
                width: pxToRem(profilePanel.notifyRadioSize),
              }}
            >
              {selected ? (
                <span
                  className="rounded-full bg-[hsl(var(--primary))]"
                  style={{
                    height: pxToRem(profilePanel.notifyRadioDotSize),
                    width: pxToRem(profilePanel.notifyRadioDotSize),
                  }}
                />
              ) : null}
            </span>
            <span className="min-w-0">
              <span
                className="block text-[hsl(var(--foreground))]"
                style={{
                  fontSize: pxToRem(profilePanel.notifyLabelFontSize),
                  fontWeight: selected ? 600 : 500,
                  lineHeight: 1.2,
                }}
              >
                {t(choice.titleKey)}
              </span>
              <span
                className="block text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(profilePanel.notifySubFontSize),
                  lineHeight: 1.3,
                  marginTop: pxToRem(profilePanel.notifySubMarginTop),
                }}
              >
                {t(choice.subtitleKey)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
