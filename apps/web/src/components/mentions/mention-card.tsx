"use client";

import React, { useId, useRef } from "react";
import { Check, MessageSquare, MoreHorizontal, PanelRight, Reply } from "lucide-react";
import { resolveAccountTimeZone } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { MentionCardMenu } from "@/components/mentions/mention-card-menu";
import { MentionKindBadge } from "@/components/mentions/mention-kind-badge";
import {
  MentionSourceTile,
  resolveMentionSourceLabel,
} from "@/components/mentions/mention-source-tile";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import type { MentionCardProps } from "@/lib/mentions/contracts";
import { resolveMentionTimeBucket } from "@/lib/mentions/grouping";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";
import { cn } from "@/lib/utils";

/**
 * Bahsetme kartı — SPEC §5.
 *
 * Kart **saf bir sunum bileşenidir**: hiçbir mutasyonu kendi çağırmaz, hiçbir sorgu okumaz
 * (`lib/mentions/contracts.ts`). Akışta yüzlerce kez çizilir; içine bir `useMutation` koymak
 * bir ekran dolusu bağımsız mutasyon örneği demekti ve hangisinin hangi kartı yazdığı test
 * edilemez hâle gelirdi.
 *
 * Üç okuma bunun istisnası değil: `useI18n` ve `useAccountPreferenceRuntime` birer **bağlam
 * okuması**dır (zamanlayıcı kurmaz, istek atmaz) ve saat biçimi kullanıcının kendi 12/24 saat
 * tercihine bağlıdır — kartın içine sabit bir `Intl` çağrısı yazmak o tercihi sessizce
 * yok sayardı.
 *
 * `now` bir kanca değil, render anındaki `new Date()`. Kart başına bir dakika sayacı kurmak
 * (`useMinuteClock`) altmış kart için altmış zamanlayıcı demekti; sayfa zaten tek bir dakika
 * saati tutuyor ve tik geldiğinde bütün ağacı yeniden çiziyor.
 */

const { card } = MENTIONS_METRICS;

// ---------------------------------------------------------------------------
// Saat
// ---------------------------------------------------------------------------

export type MentionCardTimeInput = {
  readonly createdAt: string;
  readonly formatDate: (value: string) => string;
  readonly formatTime: (value: string) => string;
  readonly locale: string;
  readonly now: Date;
  readonly timeZone: string;
  readonly yesterdayLabel: string;
};

/**
 * `09:41` · `Dün 21:30` · `Pazartesi 11:20` · `12 Ağu 09:00`.
 *
 * Eşikler `resolveMentionTimeBucket` ile **ortak** (Ş5). Ayrı bir eşik yazılsaydı bir kart
 * `Pazartesi` etiketiyle `Daha eski` grubunun altında durabilirdi.
 *
 * Saatin kendisi `formatTime` ile geliyor: 12/24 saat kullanıcının hesap tercihidir.
 */
export function formatMentionCardTime({
  createdAt,
  formatDate,
  formatTime,
  locale,
  now,
  timeZone,
  yesterdayLabel,
}: MentionCardTimeInput): string {
  const resolvedTimeZone = resolveAccountTimeZone(timeZone);
  const time = formatTime(createdAt);
  const bucket = resolveMentionTimeBucket(createdAt, now, resolvedTimeZone);

  if (bucket === "today") {
    return time;
  }

  if (bucket === "yesterday") {
    return `${yesterdayLabel} ${time}`;
  }

  if (bucket === "thisWeek") {
    const weekday = new Intl.DateTimeFormat(locale, {
      timeZone: resolvedTimeZone,
      weekday: "long",
    }).format(new Date(createdAt));
    return `${weekday} ${time}`;
  }

  return `${formatDate(createdAt)} ${time}`;
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

/** Buton, menü ve bağlantı tıklamaları gövdeye sızmaz (SPEC §9). */
function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export function MentionCard({
  active,
  contextOpen,
  menuDirection,
  menuOpen,
  mention,
  onContext,
  onMenuAction,
  onMenuToggle,
  onOpen,
  onReply,
  onToggleRead,
  replyOpen,
  replySlot,
}: MentionCardProps) {
  const { locale, t } = useI18n();
  const { formatDate, formatTime, preferences } = useAccountPreferenceRuntime();
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonId = useId();

  const sourceLabel = resolveMentionSourceLabel(mention.source, t);
  const tagLabel = mention.kind === "everyone" ? t("mentions.badge.everyone") : mention.tag;
  const timeLabel = formatMentionCardTime({
    createdAt: mention.createdAt,
    formatDate,
    formatTime,
    locale,
    now: new Date(),
    timeZone: preferences.timeZone,
    yesterdayLabel: t("mentions.group.yesterday"),
  });

  const closeMenu = () => {
    onMenuToggle();
    // Odak `⋯`'ye döner: menü portalda değil kartın içinde, yani sökülünce odak belgenin
    // başına düşerdi.
    menuButtonRef.current?.focus();
  };

  const actionBase: React.CSSProperties = {
    borderRadius: pxToRem(card.actionRadius),
    fontSize: pxToRem(card.actionFontSize),
    fontWeight: card.actionWeight,
    gap: pxToRem(card.actionGap),
    height: pxToRem(card.actionHeight),
    lineHeight: 1,
    padding: `0 ${pxToRem(card.actionPaddingX)}`,
    transitionDuration: `${card.transitionMs}ms`,
  };
  const actionIconStyle: React.CSSProperties = {
    height: pxToRem(card.actionIconSize),
    width: pxToRem(card.actionIconSize),
  };

  return (
    <article
      aria-label={t("mentions.a11y.cardLabel", {
        author: mention.author.name,
        source: sourceLabel,
        time: timeLabel,
      })}
      className={cn(
        "group/mention relative flex [--hov:0] hover:bg-[hsl(var(--surface-soft)/0.75)] hover:[--hov:1]",
        active &&
          "ring-2 ring-[hsl(var(--ring))] ring-offset-2 ring-offset-[hsl(var(--surface-panel))]",
      )}
      data-active={active || undefined}
      data-kind={mention.kind}
      data-testid="mention-card"
      data-unread={mention.unread || undefined}
      onClick={onOpen}
      style={{
        background: mention.unread
          ? "hsl(var(--surface-card))"
          : `hsl(var(--surface-card)/${card.readSurfaceAlpha})`,
        border: `${hairline(card.borderWidth)} solid ${
          mention.unread
            ? `hsl(var(--primary)/${card.unreadBorderAlpha})`
            : `hsl(var(--border)/${card.readBorderAlpha})`
        }`,
        borderRadius: pxToRem(card.radius),
        cursor: "pointer",
        gap: pxToRem(card.gap),
        padding: `${pxToRem(card.paddingTop)} ${pxToRem(card.paddingRight)} ${pxToRem(
          card.paddingBottom,
        )} ${pxToRem(card.paddingLeft)}`,
        transitionDuration: `${card.transitionMs}ms`,
        transitionProperty: "background-color",
        // `--act` menü açıkken 1: `⋯` fare kartın üzerinden çıksa da görünür kalmalı.
        ["--act" as string]: menuOpen ? 1 : 0,
      }}
    >
      {mention.unread ? (
        <>
          <span
            aria-hidden="true"
            className="absolute left-0"
            data-testid="mention-card-stripe"
            style={{
              background: "hsl(var(--primary))",
              borderRadius: `0 ${pxToRem(card.stripeRadius)} ${pxToRem(card.stripeRadius)} 0`,
              bottom: pxToRem(card.stripeInset),
              top: pxToRem(card.stripeInset),
              width: pxToRem(card.stripeWidth),
            }}
          />
          {/* Şerit bir renktir; ekran okuyucu için karşılığı yazıyla verilir. */}
          <span className="sr-only">{t("mentions.a11y.unreadStripe", { count: 1 })}</span>
        </>
      ) : null}

      <Avatar
        alt={mention.author.name}
        fallback={mention.author.initials}
        src={mention.author.avatarUrl}
        style={{ height: pxToRem(card.avatarSize), width: pxToRem(card.avatarSize) }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 1. Üst satır */}
        <div className="flex min-w-0 items-center" style={{ gap: pxToRem(card.topRowGap) }}>
          <span
            className={cn("shrink-0 text-[hsl(var(--foreground))]", DISPLAY_FONT)}
            style={{
              fontSize: pxToRem(card.nameFontSize),
              fontWeight: card.nameWeight,
              lineHeight: card.nameLineHeight,
            }}
          >
            {mention.author.name}
          </span>
          <span
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{ fontSize: pxToRem(card.handleFontSize), fontWeight: card.handleWeight }}
          >
            @{mention.author.handle}
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full bg-[hsl(var(--text-muted)/0.55)]"
            style={{ height: pxToRem(card.dotSize), width: pxToRem(card.dotSize) }}
          />

          <span
            className="flex min-w-0 items-center"
            data-testid="mention-card-source"
            style={{ gap: pxToRem(card.sourceGap) }}
          >
            <MentionSourceTile
              fontSize={card.sourceTileFontSize}
              radius={card.sourceTileRadius}
              size={card.sourceTileSize}
              source={mention.source}
            />
            <span
              className="min-w-0 truncate whitespace-nowrap text-[hsl(var(--text-secondary))]"
              style={{ fontSize: pxToRem(card.sourceFontSize), fontWeight: card.sourceWeight }}
            >
              {sourceLabel}
            </span>
          </span>

          <span
            className="ms-auto flex shrink-0 items-center"
            style={{ gap: pxToRem(card.trailingGap) }}
          >
            <MentionKindBadge kind={mention.kind} />
            <time
              className="text-[hsl(var(--text-muted))]"
              dateTime={mention.createdAt}
              data-testid="mention-card-time"
              style={{ fontSize: pxToRem(card.timeFontSize), fontWeight: card.timeWeight }}
            >
              {timeLabel}
            </time>
          </span>
        </div>

        {/* 2. Alıntı bloğu */}
        {mention.quote ? (
          <div
            className="min-w-0"
            data-testid="mention-card-quote"
            style={{
              background: `hsl(var(--surface-soft)/${card.quoteSurfaceAlpha})`,
              borderLeft: `${pxToRem(card.quoteBorderLeftWidth)} solid hsl(var(--border))`,
              borderRadius: `0 ${pxToRem(card.quoteRadius)} ${pxToRem(card.quoteRadius)} 0`,
              marginTop: pxToRem(card.quoteMarginTop),
              padding: `${pxToRem(card.quotePaddingY)} ${pxToRem(card.quotePaddingX)}`,
            }}
          >
            <p
              className="truncate whitespace-nowrap"
              style={{
                fontSize: pxToRem(card.quoteTextFontSize),
                lineHeight: card.quoteLineHeight,
                margin: 0,
              }}
            >
              <span
                className="text-[hsl(var(--text-secondary))]"
                style={{ fontWeight: card.quoteAuthorWeight }}
              >
                {mention.quote.authorName}
              </span>{" "}
              <span className="text-[hsl(var(--text-muted))]">{mention.quote.text}</span>
            </p>
          </div>
        ) : null}

        {/* 3. Gövde — takı gövdenin başında inline çip */}
        <p
          className="min-w-0 text-[hsl(var(--text-secondary))]"
          data-testid="mention-card-body"
          style={{
            fontSize: pxToRem(card.bodyFontSize),
            lineHeight: card.bodyLineHeight,
            margin: `${pxToRem(card.bodyMarginTop)} 0 0`,
            textWrap: "pretty",
          }}
        >
          <span
            className="text-[hsl(var(--primary))]"
            data-testid="mention-card-tag"
            style={{
              background: `hsl(var(--primary)/${card.tagSurfaceAlpha})`,
              borderRadius: pxToRem(card.tagRadius),
              fontSize: pxToRem(card.tagFontSize),
              fontWeight: card.tagWeight,
              lineHeight: card.tagLineHeight,
              padding: `${pxToRem(card.tagPaddingY)} ${pxToRem(card.tagPaddingX)}`,
            }}
          >
            {tagLabel}
          </span>{" "}
          {mention.body}
        </p>

        {/* 4. Thread satırı */}
        {mention.thread ? (
          <div
            className="flex items-center text-[hsl(var(--primary))]"
            data-testid="mention-card-thread"
            style={{
              fontSize: pxToRem(card.threadFontSize),
              fontWeight: card.threadWeight,
              gap: pxToRem(card.threadGap),
              marginTop: pxToRem(card.threadMarginTop),
            }}
          >
            <MessageSquare
              aria-hidden="true"
              style={{
                height: pxToRem(card.threadIconSize),
                width: pxToRem(card.threadIconSize),
              }}
            />
            <span>
              {mention.thread.open
                ? t("mentions.card.thread", { count: mention.thread.replyCount })
                : t("mentions.card.threadClosed", { count: mention.thread.replyCount })}
            </span>
          </div>
        ) : null}

        {/* 5. Eylem satırı */}
        <div
          className="flex flex-wrap items-center"
          style={{ gap: pxToRem(card.actionsGap), marginTop: pxToRem(card.actionsMarginTop) }}
        >
          <button
            aria-pressed={replyOpen}
            className={cn(
              "inline-flex items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              replyOpen
                ? "bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
                : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--primary)/0.14)] hover:text-[hsl(var(--primary))]",
            )}
            data-testid="mention-card-reply"
            onClick={(event) => {
              stopPropagation(event);
              onReply();
            }}
            style={{
              ...actionBase,
              border: `${hairline(card.borderWidth)} solid ${
                replyOpen
                  ? `hsl(var(--primary)/${card.actionActiveBorderAlpha})`
                  : `hsl(var(--border)/${card.actionBorderAlpha})`
              }`,
            }}
            type="button"
          >
            <Reply aria-hidden="true" style={actionIconStyle} />
            {t("mentions.card.actions.reply")}
          </button>

          <button
            aria-pressed={contextOpen}
            className={cn(
              "inline-flex items-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              contextOpen
                ? "bg-[hsl(var(--surface-soft))] text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
            )}
            data-testid="mention-card-context"
            onClick={(event) => {
              stopPropagation(event);
              onContext();
            }}
            style={{
              ...actionBase,
              border: `${hairline(card.borderWidth)} solid ${
                contextOpen ? "hsl(var(--border))" : `hsl(var(--border)/${card.actionBorderAlpha})`
              }`,
            }}
            type="button"
          >
            <PanelRight aria-hidden="true" style={actionIconStyle} />
            {t("mentions.card.actions.context")}
          </button>

          <button
            className="inline-flex items-center text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="mention-card-toggle-read"
            onClick={(event) => {
              stopPropagation(event);
              onToggleRead();
            }}
            style={{
              ...actionBase,
              border: `${hairline(card.borderWidth)} solid hsl(var(--border)/${card.actionBorderAlpha})`,
            }}
            type="button"
          >
            <Check aria-hidden="true" style={actionIconStyle} />
            {mention.unread
              ? t("mentions.card.actions.markRead")
              : t("mentions.card.actions.markUnread")}
          </button>

          <span className="relative ms-auto flex items-center">
            <button
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={t("mentions.card.menuLabel")}
              className={cn(
                "grid place-items-center text-[hsl(var(--text-secondary))] transition hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
                // `--act` yoğunluk değişkeni; klavyeyle odaklanınca opaklık her hâlükârda 1
                // olmalı, yoksa `⋯` klavye kullanıcısı için görünmez bir hedef olur.
                "focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              )}
              data-testid="mention-card-menu-button"
              id={menuButtonId}
              onClick={(event) => {
                stopPropagation(event);
                onMenuToggle();
              }}
              onPointerDown={stopPropagation}
              ref={menuButtonRef}
              style={{
                borderRadius: pxToRem(card.menuButtonRadius),
                height: pxToRem(card.menuButtonSize),
                opacity: "calc(var(--act) + var(--hov))",
                transitionDuration: `${card.transitionMs}ms`,
                width: pxToRem(card.menuButtonSize),
              }}
              type="button"
            >
              <MoreHorizontal
                aria-hidden="true"
                style={{
                  height: pxToRem(card.menuButtonIconSize),
                  width: pxToRem(card.menuButtonIconSize),
                }}
              />
            </button>

            {menuOpen ? (
              <MentionCardMenu
                direction={menuDirection}
                labelledById={menuButtonId}
                onAction={onMenuAction}
                onClose={closeMenu}
                source={mention.source}
              />
            ) : null}
          </span>
        </div>

        {/* 6. Yanıt kutusu — içeriği Ş7'nin, kart yalnız yerini ayırır. */}
        {replyOpen && replySlot ? (
          <div data-testid="mention-card-reply-slot" onClick={stopPropagation}>
            {replySlot}
          </div>
        ) : null}
      </div>
    </article>
  );
}
