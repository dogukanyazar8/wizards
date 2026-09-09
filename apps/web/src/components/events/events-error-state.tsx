"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { EVENT_DISPLAY_FONT } from "@/components/events/event-kind-tile";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";
import { cn } from "@/lib/utils";

/**
 * Hata durumu — SPEC §3.8, `.dc.html` `:407`–`:421`.
 *
 * Alt satır iki şey söylüyor ve ikisi de ayrı kaynaklardan geliyor: **kod** sunucudan
 * (yoksa `EVT-503`), **saat** istemciden (son denemenin kendi saati). Sunucudan gelen bir saat
 * kullanıcının saat diliminde olmayabilir ve "az önce denedim" duygusunu bozardı.
 *
 * `Durum sayfası` bir **bağlantı**: dış bir adrese gidiyor, bir eylem tetiklemiyor.
 * Adres yoksa buton hiç çizilmez — çalışmayan bir düğme, kesinti anında verilebilecek en kötü
 * cevap.
 */

const { emptyState, errorState } = EVENTS_METRICS;
const { primaryShadow } = emptyState;

/** SPEC §3.8 — sunucu bir kod vermediğinde yazılan değer. */
export const EVENTS_DEFAULT_ERROR_CODE = "EVT-503";

/**
 * Adres derleme anında gömülür. `lib/app/service-status.ts` aynı değişkeni okuyor ama o modül
 * `lib/health` üzerinden Prisma'ya bağlanıyor; buradan içe aktarmak sunucu kodunu tarayıcı
 * paketine çekerdi.
 *
 * TODO(api): `WHISPR_STATUS_PAGE_URL` (ve `https://status.whispr.team` yedeği) istemcinin de
 * okuyabileceği bir modüle taşınmalı. O güne kadar değişken tanımlı değilse `Durum sayfası`
 * butonu **çizilmez** — çalışmayan bir düğme yerine hiç düğme.
 */
const STATUS_PAGE_URL = process.env.NEXT_PUBLIC_WHISPR_STATUS_PAGE_URL ?? null;

export type EventsErrorStateProps = {
  /** Sunucudan gelen hata kodu; yoksa `EVT-503`. */
  readonly code?: string | null;
  readonly lastAttemptAt: Date;
  readonly onRetry?: () => void;
  /** Verilmezse dağıtım değişkeninden okunur; o da yoksa buton çizilmez. */
  readonly statusHref?: string | null;
};

export function EventsErrorState({
  code,
  lastAttemptAt,
  onRetry,
  statusHref,
}: EventsErrorStateProps) {
  const { t } = useI18n();
  const { formatTime } = useAccountPreferenceRuntime();
  const href = statusHref === undefined ? STATUS_PAGE_URL : statusHref;

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center"
      data-testid="events-error-state"
      style={{ gap: pxToRem(errorState.gap), padding: pxToRem(errorState.padding) }}
    >
      <div
        aria-hidden="true"
        className="grid shrink-0 place-items-center text-[hsl(var(--danger))]"
        style={{
          background: `hsl(var(--danger)/${errorState.iconSurfaceAlpha})`,
          border: `${hairline()} solid hsl(var(--danger)/${errorState.iconBorderAlpha})`,
          borderRadius: pxToRem(errorState.iconBoxRadius),
          height: pxToRem(errorState.iconBox),
          width: pxToRem(errorState.iconBox),
        }}
      >
        <AlertTriangle
          style={{ height: pxToRem(errorState.iconSize), width: pxToRem(errorState.iconSize) }}
        />
      </div>

      <div className="text-center" style={{ maxWidth: pxToRem(errorState.bodyMaxWidth) }}>
        <h2
          className={cn("m-0 text-[hsl(var(--foreground))]", EVENT_DISPLAY_FONT)}
          style={{
            fontSize: pxToRem(errorState.titleFontSize),
            fontWeight: errorState.titleWeight,
            letterSpacing: "-0.02em",
            lineHeight: errorState.titleLineHeight,
          }}
        >
          {t("events.error.title")}
        </h2>
        <p
          className="text-[hsl(var(--text-muted))]"
          data-testid="events-error-body"
          style={{
            fontSize: pxToRem(errorState.bodyFontSize),
            lineHeight: errorState.bodyLineHeight,
            margin: `${pxToRem(errorState.bodyMarginTop)} 0 0`,
            textWrap: "pretty",
          }}
        >
          {t("events.error.body")}
        </p>
      </div>

      <div className="flex items-center" style={{ gap: pxToRem(errorState.buttonRowGap) }}>
        <button
          className="flex items-center text-white transition-[filter] hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="events-error-retry"
          onClick={onRetry}
          style={{
            background: "hsl(var(--primary))",
            border: 0,
            borderRadius: pxToRem(errorState.buttonRadius),
            // Birincil buton gölgesi boş durumla **aynı** (SPEC §3.7 = §3.8); sözlükte tek
            // kayıt var, ikinci bir kopya bir gün ayrışırdı.
            boxShadow: `${pxToRem(primaryShadow.x)} ${pxToRem(primaryShadow.y)} ${pxToRem(
              primaryShadow.blur,
            )} ${pxToRem(primaryShadow.spread)} hsl(var(--primary))`,
            fontSize: pxToRem(errorState.buttonFontSize),
            fontWeight: errorState.buttonWeight,
            gap: pxToRem(errorState.buttonGap),
            height: pxToRem(errorState.buttonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(errorState.buttonPaddingX)}`,
          }}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className="flex-none"
            style={{
              height: pxToEm(errorState.buttonIconSize, errorState.buttonFontSize),
              width: pxToEm(errorState.buttonIconSize, errorState.buttonFontSize),
            }}
          />
          {t("events.error.retry")}
        </button>

        {href ? (
          <a
            className="grid place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="events-error-status"
            href={href}
            rel="noreferrer"
            style={{
              border: `${hairline()} solid hsl(var(--border))`,
              borderRadius: pxToRem(errorState.buttonRadius),
              fontSize: pxToRem(errorState.buttonFontSize),
              fontWeight: errorState.buttonWeight,
              height: pxToRem(errorState.buttonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(errorState.buttonPaddingX)}`,
            }}
            target="_blank"
          >
            {t("events.error.status")}
          </a>
        ) : null}
      </div>

      <div
        data-testid="events-error-code"
        style={{
          color: `hsl(var(--text-muted)/${errorState.codeLineAlpha})`,
          fontSize: pxToRem(errorState.codeLineFontSize),
        }}
      >
        {t("events.error.code", {
          code: code ?? EVENTS_DEFAULT_ERROR_CODE,
          time: formatTime(lastAttemptAt),
        })}
      </div>
    </div>
  );
}
