"use client";

import Link from "next/link";
import React from "react";
import { Check } from "lucide-react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";
import { buildMentionsHref, type MentionsRouteState } from "@/lib/mentions/routes";
import { cn } from "@/lib/utils";

/**
 * Boş durum — SPEC §8, karar K7.
 *
 * `Arşive dön` **veri taşımaz**: 30 gün bir sorgu penceresidir, yıkıcı bir arşivleme işi değil.
 * Buton yalnız `?window=all` adresine gider ve eski satırlar zaten yerinde durdukları için
 * görünür olur.
 *
 * İki boş durum var ve ikisi aynı başlığı taşır: gerçekten hiç bekleyen bahsetme olmaması, ve
 * seçili süzgeçte sonuç olmaması. İkincisinin metni ayrı (`mentions.empty.filtered`), çünkü
 * "hepsini okudun" demek filtreyi unutmuş bir kullanıcıya yanlış bilgi vermek olurdu.
 */

const { emptyState, sidebar } = MENTIONS_METRICS;

export type MentionsEmptyStateProps = {
  /** Filtre, arama ya da kaynak seçimi yüzünden boş — metin süzgece işaret eder. */
  readonly filtered: boolean;
  readonly routeState: MentionsRouteState;
};

export function MentionsEmptyState({ filtered, routeState }: MentionsEmptyStateProps) {
  const { t } = useI18n();

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center"
      data-testid="mentions-empty-state"
      style={{ gap: pxToRem(emptyState.gap), padding: pxToRem(emptyState.padding) }}
    >
      <div
        aria-hidden="true"
        className="grid shrink-0 place-items-center text-[hsl(var(--success))]"
        style={{
          background: `hsl(var(--success)/${emptyState.iconSurfaceAlpha})`,
          border: `${hairline()} solid hsl(var(--success)/${emptyState.iconBorderAlpha})`,
          borderRadius: pxToRem(emptyState.iconBoxRadius),
          height: pxToRem(emptyState.iconBox),
          width: pxToRem(emptyState.iconBox),
        }}
      >
        <Check
          style={{ height: pxToRem(emptyState.iconSize), width: pxToRem(emptyState.iconSize) }}
        />
      </div>

      <div className="text-center" style={{ maxWidth: pxToRem(emptyState.bodyMaxWidth) }}>
        <h2
          className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
          style={{
            fontSize: pxToRem(emptyState.titleFontSize),
            fontWeight: emptyState.titleWeight,
            letterSpacing: "-0.02em",
            lineHeight: emptyState.titleLineHeight,
          }}
        >
          {t("mentions.empty.title")}
        </h2>
        <p
          className="text-[hsl(var(--text-muted))]"
          data-testid="mentions-empty-body"
          style={{
            fontSize: pxToRem(emptyState.bodyFontSize),
            lineHeight: emptyState.bodyLineHeight,
            margin: `${pxToRem(emptyState.bodyMarginTop)} 0 0`,
            textWrap: "pretty",
          }}
        >
          {filtered
            ? t("mentions.empty.filtered")
            : t(routeState.window === "all" ? "mentions.empty.bodyAll" : "mentions.empty.body")}
        </p>
      </div>

      <div className="flex items-center" style={{ gap: pxToRem(emptyState.buttonRowGap) }}>
        {routeState.window === "all" ? null : (
          // Pencere zaten `all` iken bu buton sonucu olmayan bir tık olurdu; SPEC bu durumu
          // konuşmuyor, rapora sapma olarak yazıldı.
          <Link
            className="grid place-items-center bg-[hsl(var(--primary))] text-white transition-[filter] hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="mentions-empty-archive"
            href={buildMentionsHref({ ...routeState, panel: null, window: "all" })}
            scroll={false}
            style={{
              borderRadius: pxToRem(emptyState.buttonRadius),
              boxShadow: `${pxToRem(emptyState.primaryShadow.x)} ${pxToRem(
                emptyState.primaryShadow.y,
              )} ${pxToRem(emptyState.primaryShadow.blur)} ${pxToRem(
                emptyState.primaryShadow.spread,
              )} hsl(var(--primary))`,
              fontSize: pxToRem(emptyState.buttonFontSize),
              fontWeight: emptyState.buttonWeight,
              height: pxToRem(emptyState.buttonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(emptyState.buttonPaddingX)}`,
              // Referans `.16s` veriyor; Tailwind'in `transition-*` varsayılanı 150ms.
              // Süre sözlükten gelmezse aynı ekranda iki farklı geçiş hızı olur.
              transitionDuration: `${sidebar.transitionMs}ms`,
            }}
          >
            {t("mentions.empty.archive")}
          </Link>
        )}
        <Link
          className="grid place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="mentions-empty-settings"
          href={buildMentionsHref({ ...routeState, settingsOpen: true })}
          scroll={false}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(emptyState.buttonRadius),
            fontSize: pxToRem(emptyState.buttonFontSize),
            fontWeight: emptyState.buttonWeight,
            height: pxToRem(emptyState.buttonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(emptyState.buttonPaddingX)}`,
            transitionDuration: `${sidebar.transitionMs}ms`,
          }}
        >
          {t("mentions.empty.settings")}
        </Link>
      </div>
    </div>
  );
}
