"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { Mention, MentionContextMessage } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import {
  MentionSourceTile,
  resolveMentionSourceLabel,
} from "@/components/mentions/mention-source-tile";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MENTIONS_STALE_TIME_MS,
  fetchMentionContext,
  mentionsQueryKeys,
} from "@/lib/mentions/client";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";
import { resolveReplyTarget } from "@/lib/mentions/reply-target";
import { cn } from "@/lib/utils";

/**
 * Bağlam paneli (326) — SPEC §6.
 *
 * Panel kolonu **kendisi** çizer (ray gibi): akış onu kardeş olarak yerleştirir, sarmalayıcı
 * vermez. `ThreadPanel`in düzeni örnek alındı ama o dosya değiştirilmedi ve ondan kod
 * kopyalanmadı — iki panelin başlığı, gövdesi ve altlığı farklı içerik taşıyor; ortak olan
 * yalnız üç bantlı iskelet.
 *
 * **Kırılım CSS'te** (tuzak #8): `<1100px` overlay, `≥1100px` sütun. `useSyncExternalStore` ile
 * genişlik okumak SSR anlık görüntüsünde 1280 verir ve ilk boya yanlış kırılımda çıkar.
 * JavaScript'in tek işi **odak tuzağı**: bir sütun diyalog değildir, üstüne binen bir katman
 * diyalogdur ve tuzağı CSS kuramaz. Dinleyici `false` ile başlar — ilk boyada tuzak yok, yani
 * hidrasyondan önce hiçbir odak yakalanmaz.
 */

const { contextPanel, shell } = MENTIONS_METRICS;

/** SPEC §6 §4: eşik 1100px. Tek yerde durur; sınıf adı ile dinleyici ayrışmasın. */
export const MENTION_CONTEXT_OVERLAY_QUERY = "(max-width: 1099.98px)";

export type MentionContextPanelProps = {
  readonly mention: Mention | null;
  readonly mentionId: string;
  readonly onClose: () => void;
  /** `Kanalda aç` — bahsetmeyi hedefinde açar ve okundu işaretler (SPEC §6 altlık). */
  readonly onOpen: () => void;
  /** `Thread'de yanıtla` — satır içi yanıt kutusunu thread hedefiyle açar. */
  readonly onReplyInThread: () => void;
};

export function MentionContextPanel({
  mention,
  mentionId,
  onClose,
  onOpen,
  onReplyInThread,
}: MentionContextPanelProps) {
  const { t } = useI18n();
  const { formatTime } = useAccountPreferenceRuntime();
  const panelRef = useRef<HTMLElement | null>(null);
  const [overlay, setOverlay] = useState(false);

  const contextQuery = useQuery({
    enabled: Boolean(mentionId),
    queryFn: () => fetchMentionContext(mentionId),
    queryKey: mentionsQueryKeys.context(mentionId),
    staleTime: MENTIONS_STALE_TIME_MS.context,
  });

  useEffect(() => {
    const media = window.matchMedia(MENTION_CONTEXT_OVERLAY_QUERY);
    const update = () => setOverlay(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  /** Overlay iken diyalog kuralları: `Esc`, dış tıklama ve odak tuzağı. Sütunda hiçbiri yok. */
  useEffect(() => {
    if (!overlay) {
      return;
    }

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, [href]")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        return;
      }

      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[next]?.focus();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      trigger?.focus();
    };
  }, [onClose, overlay]);

  const sourceLabel = mention ? resolveMentionSourceLabel(mention.source, t) : "";
  // K10 ile aynı yüklem: buton yalnız satır içi yanıtın gerçekten thread'e gideceği kartta
  // görünür. `mention.thread` varlığına bakmak, thread içindeki bir kanal bahsetmesinde de
  // butonu çizerdi ve o yanıt kanala düşerdi — buton yalan söylerdi.
  const showThreadReply = Boolean(mention) && resolveReplyTarget(mention!).type === "thread";

  const messages = contextQuery.data?.messages ?? [];

  return (
    <>
      {/* Overlay zemini — yalnız dar kırılımda. Kapanışı tetikler. */}
      <button
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-[hsl(var(--background)/0.5)] backdrop-blur-xs max-[68.6875rem]:block min-[68.75rem]:hidden"
        data-testid="mention-context-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      <aside
        aria-label={t("mentions.context.title")}
        className={cn(
          "flex shrink-0 flex-col overflow-hidden bg-[hsl(var(--surface-panel))]",
          "max-[68.6875rem]:fixed max-[68.6875rem]:inset-y-0 max-[68.6875rem]:right-0 max-[68.6875rem]:z-50 max-[68.6875rem]:max-w-full",
          "min-[68.75rem]:relative min-[68.75rem]:z-auto",
        )}
        data-overlay={overlay || undefined}
        data-testid="mention-context-panel"
        ref={panelRef}
        role={overlay ? "dialog" : undefined}
        aria-modal={overlay ? true : undefined}
        style={{
          borderLeft: `${hairline()} solid hsl(var(--border)/0.45)`,
          width: pxToRem(shell.contextPanelWidth),
        }}
      >
        {/* Başlık */}
        <header
          className="flex items-start"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
            gap: pxToRem(contextPanel.headerGap),
            padding: `${pxToRem(contextPanel.headerPaddingTop)} ${pxToRem(
              contextPanel.headerPaddingX,
            )} ${pxToRem(contextPanel.headerPaddingBottom)}`,
          }}
        >
          <div className="min-w-0 flex-1">
            <h2
              className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
              style={{
                fontSize: pxToRem(contextPanel.titleFontSize),
                fontWeight: contextPanel.titleWeight,
                lineHeight: contextPanel.titleLineHeight,
              }}
            >
              {t("mentions.context.title")}
            </h2>
            {mention ? (
              <div
                className="flex min-w-0 items-center text-[hsl(var(--text-muted))]"
                style={{
                  gap: pxToRem(contextPanel.sourceGap),
                  marginTop: pxToRem(contextPanel.sourceMarginTop),
                }}
              >
                <MentionSourceTile
                  fontSize={contextPanel.sourceTileFontSize}
                  radius={contextPanel.sourceTileRadius}
                  size={contextPanel.sourceTileSize}
                  source={mention.source}
                />
                <span
                  className="min-w-0 truncate"
                  style={{ fontSize: pxToRem(contextPanel.sourceFontSize) }}
                >
                  {sourceLabel}
                </span>
              </div>
            ) : null}
          </div>

          <button
            aria-label={t("mentions.context.close")}
            className="grid shrink-0 place-items-center text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="mention-context-close"
            onClick={onClose}
            style={{
              borderRadius: pxToRem(contextPanel.closeRadius),
              height: pxToRem(contextPanel.closeSize),
              width: pxToRem(contextPanel.closeSize),
            }}
            type="button"
          >
            <X
              aria-hidden="true"
              style={{
                height: pxToRem(contextPanel.closeIconSize),
                width: pxToRem(contextPanel.closeIconSize),
              }}
            />
          </button>
        </header>

        {/* Gövde */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          data-testid="mention-context-body"
          style={{
            gap: pxToRem(contextPanel.bodyGap),
            padding: `${pxToRem(contextPanel.bodyPaddingY)} ${pxToRem(contextPanel.bodyPaddingX)}`,
          }}
        >
          {contextQuery.isPending ? (
            <ContextSkeleton />
          ) : contextQuery.isError ? (
            <ContextError onRetry={() => void contextQuery.refetch()} />
          ) : (
            messages.map((message) => (
              <ContextRow formatTime={formatTime} key={message.id} message={message} />
            ))
          )}
        </div>

        {/* Altlık */}
        <footer
          className="flex items-center"
          style={{
            borderTop: `${hairline()} solid hsl(var(--border)/0.45)`,
            gap: pxToRem(contextPanel.footerGap),
            padding: `${pxToRem(contextPanel.footerPaddingY)} ${pxToRem(
              contextPanel.footerPaddingX,
            )}`,
          }}
        >
          <Link
            className="grid flex-1 place-items-center bg-[hsl(var(--primary))] text-white transition hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="mention-context-open"
            href={mention?.href ?? "#"}
            onClick={onOpen}
            scroll={false}
            style={{
              borderRadius: pxToRem(contextPanel.footerButtonRadius),
              boxShadow: `${pxToRem(contextPanel.footerPrimaryShadow.x)} ${pxToRem(
                contextPanel.footerPrimaryShadow.y,
              )} ${pxToRem(contextPanel.footerPrimaryShadow.blur)} ${pxToRem(
                contextPanel.footerPrimaryShadow.spread,
              )} hsl(var(--primary))`,
              fontSize: pxToRem(contextPanel.footerButtonFontSize),
              fontWeight: contextPanel.footerButtonWeight,
              height: pxToRem(contextPanel.footerButtonHeight),
              lineHeight: 1,
            }}
          >
            {t("mentions.context.openInChannel")}
          </Link>

          {showThreadReply ? (
            <button
              className="grid shrink-0 place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="mention-context-reply-thread"
              onClick={onReplyInThread}
              style={{
                border: `${hairline()} solid hsl(var(--border))`,
                borderRadius: pxToRem(contextPanel.footerButtonRadius),
                fontSize: pxToRem(contextPanel.footerButtonFontSize),
                fontWeight: contextPanel.footerButtonWeight,
                height: pxToRem(contextPanel.footerButtonHeight),
                lineHeight: 1,
                padding: `0 ${pxToRem(contextPanel.footerButtonPaddingX)}`,
              }}
              type="button"
            >
              {t("mentions.context.replyInThread")}
            </button>
          ) : null}
        </footer>
      </aside>
    </>
  );
}

function ContextSkeleton() {
  return (
    <div
      className="flex flex-col"
      data-testid="mention-context-skeleton"
      style={{ gap: pxToRem(contextPanel.bodyGap) }}
    >
      {[0, 1, 2, 3].map((index) => (
        <Skeleton
          key={index}
          style={{
            borderRadius: pxToRem(contextPanel.highlightRadius),
            height: pxToRem(contextPanel.rowAvatarSize + contextPanel.rowTextMarginTop * 4),
          }}
        />
      ))}
    </div>
  );
}

function ContextError({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-start" data-testid="mention-context-error" role="alert">
      <p
        className="text-[hsl(var(--text-muted))]"
        style={{ fontSize: pxToRem(contextPanel.rowTextFontSize), margin: 0 }}
      >
        {t("mentions.feed.error")}
      </p>
      <button
        className="text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="mention-context-retry"
        onClick={onRetry}
        style={{
          fontSize: pxToRem(contextPanel.rowTextFontSize),
          fontWeight: contextPanel.rowNameWeight,
          marginTop: pxToRem(contextPanel.rowTextMarginTop),
        }}
        type="button"
      >
        {t("mentions.feed.retry")}
      </button>
    </div>
  );
}

function ContextRow({
  formatTime,
  message,
}: {
  readonly formatTime: (value: string) => string;
  readonly message: MentionContextMessage;
}) {
  return (
    <div
      className="flex min-w-0"
      data-mention={message.isMention || undefined}
      data-testid="mention-context-row"
      style={{
        gap: pxToRem(contextPanel.rowGap),
        ...(message.isMention
          ? {
              background: `hsl(var(--primary)/${contextPanel.highlightSurfaceAlpha})`,
              border: `${hairline()} solid hsl(var(--primary)/${contextPanel.highlightBorderAlpha})`,
              borderRadius: pxToRem(contextPanel.highlightRadius),
              padding: `${pxToRem(contextPanel.highlightPaddingY)} ${pxToRem(
                contextPanel.highlightPaddingX,
              )}`,
            }
          : { padding: `${pxToRem(contextPanel.plainPaddingY)} 0` }),
      }}
    >
      <Avatar
        alt={message.authorName}
        fallback={message.initials}
        src={message.avatarUrl}
        style={{
          height: pxToRem(contextPanel.rowAvatarSize),
          width: pxToRem(contextPanel.rowAvatarSize),
        }}
      />

      <div className="min-w-0 flex-1">
        <div
          className="flex min-w-0 items-baseline"
          style={{ gap: pxToRem(contextPanel.sourceGap) }}
        >
          <span
            className="min-w-0 truncate text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(contextPanel.rowNameFontSize),
              fontWeight: contextPanel.rowNameWeight,
              lineHeight: contextPanel.rowNameLineHeight,
            }}
          >
            {message.authorName}
          </span>
          <time
            className="shrink-0 text-[hsl(var(--text-muted))]"
            dateTime={message.time}
            style={{
              fontSize: pxToRem(contextPanel.rowTimeFontSize),
              fontWeight: contextPanel.rowTimeWeight,
            }}
          >
            {formatTime(message.time)}
          </time>
        </div>
        <p
          className={cn(
            message.isMention
              ? "text-[hsl(var(--foreground))]"
              : "text-[hsl(var(--text-secondary))]",
          )}
          style={{
            fontSize: pxToRem(contextPanel.rowTextFontSize),
            lineHeight: contextPanel.rowTextLineHeight,
            margin: `${pxToRem(contextPanel.rowTextMarginTop)} 0 0`,
            textWrap: "pretty",
          }}
        >
          {message.text}
        </p>
      </div>
    </div>
  );
}
