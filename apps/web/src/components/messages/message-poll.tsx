"use client";

import React from "react";
import { BarChart3 } from "lucide-react";
import {
  isPollClosed,
  selectPollPercentages,
  type PollDTO,
  type PollOptionDTO,
} from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Canlı anket kartı — SPEC-MESAJLAR §5.5, karar #1.
 *
 * Kart yalnız **çizer ve haber verir**: oy isteğini, iyimser durumu ve
 * `poll:updated` aboneliğini `use-poll.ts` taşıyor. Ayrım bilinçli — kart mesaj
 * listesinin içinde ve liste sanallaştırılmış: kaydırmayla monte olup çözülen
 * bir bileşene istek durumu koymak, yarıda kalan istekler ve kaybolan iyimser
 * güncellemeler demek olurdu.
 */

const { poll: pollMetrics } = MESSAGES_METRICS;

export type MessagePollProps = {
  /** Oy verilemez durum (kapalı anket ya da uçuş hâlindeki istek). */
  disabled?: boolean;
  /** İstek başarısızsa gösterilecek metin; `null` ise hata yok. */
  errorText?: string | null;
  /** Kapanma etiketi — `2 saat` gibi; biçimlendirme çağıranın. */
  closesInLabel?: string | null;
  now?: Date;
  onOpenVoters?: (() => void) | undefined;
  onToggleOption: (optionId: string) => void;
  poll: PollDTO;
};

function PollOptionRow({
  closed,
  disabled,
  multi,
  onToggle,
  option,
  percent,
  selected,
}: {
  closed: boolean;
  disabled: boolean;
  multi: boolean;
  onToggle: () => void;
  option: PollOptionDTO;
  percent: number;
  selected: boolean;
}) {
  const { t } = useI18n();

  return (
    <button
      // Tek seçimlide radyo, çoktan seçmelide onay kutusu. Rol yanlış olsaydı
      // ekran okuyucu "birini seç" derken kullanıcı ikisini birden işaretlerdi.
      aria-checked={selected}
      aria-label={t("messages.poll.optionAria", {
        count: option.votes,
        label: option.label,
        percent,
      })}
      className={cn(
        "relative flex w-full items-center overflow-hidden text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        disabled ? "cursor-default" : "cursor-pointer",
      )}
      data-selected={selected ? "true" : undefined}
      data-testid="poll-option"
      disabled={disabled}
      onClick={onToggle}
      role={multi ? "checkbox" : "radio"}
      style={{
        backgroundColor: "hsl(var(--surface-soft)/0.6)",
        border: `${pxToRem(pollMetrics.optionBorderWidth)} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(pollMetrics.optionRadius),
        gap: pxToRem(pollMetrics.optionGap),
        padding: `${pxToRem(pollMetrics.optionPaddingY)} ${pxToRem(pollMetrics.optionPaddingX)}`,
      }}
      type="button"
    >
      {/*
        Dolgu mutlak konumlu ve içeriğin **arkasında**: genişliği yüzdeyle
        büyürken etiketin sarmasını değiştirmemeli, yoksa oy her geldiğinde satır
        yüksekliği zıplar. `prefers-reduced-motion` açıkken geçiş kalkar.
      */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 motion-safe:transition-[width]",
          selected ? "bg-[hsl(var(--primary)/0.22)]" : "bg-[hsl(var(--surface-tertiary)/0.85)]",
        )}
        data-testid="poll-option-fill"
        style={{
          transitionDuration: `${pollMetrics.fillTransitionSeconds}s`,
          width: `${percent}%`,
        }}
      />

      <span
        aria-hidden="true"
        className={cn(
          "relative grid shrink-0 place-items-center",
          multi ? "rounded-[0.3rem]" : "rounded-full",
        )}
        style={{
          borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border))",
          borderStyle: "solid",
          borderWidth: pxToRem(pollMetrics.radioBorderWidth),
          height: pxToRem(pollMetrics.radioSize),
          width: pxToRem(pollMetrics.radioSize),
        }}
      >
        {selected ? (
          <span
            className={cn("bg-[hsl(var(--primary))]", multi ? "rounded-[0.15rem]" : "rounded-full")}
            style={{
              height: pxToRem(pollMetrics.radioDotSize),
              width: pxToRem(pollMetrics.radioDotSize),
            }}
          />
        ) : null}
      </span>

      <span
        className="relative min-w-0 flex-1 truncate text-[hsl(var(--foreground))]"
        style={{
          fontSize: pxToRem(pollMetrics.optionLabelFontSize),
          lineHeight: pollMetrics.optionLabelLineHeight,
        }}
      >
        {option.label}
      </span>

      <span
        className={cn(
          "relative shrink-0",
          closed ? "text-[hsl(var(--text-secondary))]" : "text-[hsl(var(--foreground))]",
        )}
        data-testid="poll-option-percent"
        style={{ fontSize: pxToRem(pollMetrics.percentFontSize), fontWeight: 600 }}
      >
        %{percent}
      </span>
    </button>
  );
}

export function MessagePoll({
  closesInLabel,
  disabled = false,
  errorText,
  now,
  onOpenVoters,
  onToggleOption,
  poll,
}: MessagePollProps) {
  const { t } = useI18n();
  const closed = isPollClosed(poll, now ?? new Date());
  const percentages = selectPollPercentages(poll);
  const selectedIds = new Set(poll.myOptionIds);

  return (
    <div
      className="bg-[hsl(var(--surface-card))]"
      data-testid="message-poll"
      style={{
        border: `${hairline()} solid hsl(var(--border)/0.6)`,
        borderRadius: pxToRem(pollMetrics.radius),
        marginTop: pxToRem(pollMetrics.marginTop),
        maxWidth: pxToRem(pollMetrics.maxWidth),
        padding: pxToRem(pollMetrics.padding),
      }}
    >
      <div className="flex items-center" style={{ gap: pxToRem(pollMetrics.headerGap) }}>
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center bg-[hsl(var(--primary)/0.14)] text-[var(--primary-readable)]"
          style={{
            borderRadius: pxToRem(pollMetrics.headerTileRadius),
            height: pxToRem(pollMetrics.headerTileSize),
            width: pxToRem(pollMetrics.headerTileSize),
          }}
        >
          <BarChart3
            style={{
              height: pxToRem(pollMetrics.headerIconSize),
              width: pxToRem(pollMetrics.headerIconSize),
            }}
          />
        </span>
        <span
          className={cn("uppercase text-[hsl(var(--text-secondary))]", DISPLAY_FONT)}
          data-testid="poll-kind"
          style={{
            fontSize: pxToRem(pollMetrics.headerLabelFontSize),
            fontWeight: 600,
            letterSpacing: pollMetrics.headerLabelTracking,
          }}
        >
          {poll.multi ? t("messages.poll.labelMulti") : t("messages.poll.labelSingle")}
        </span>
      </div>

      <p
        className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
        data-testid="poll-question"
        style={{
          fontSize: pxToRem(pollMetrics.questionFontSize),
          fontWeight: 600,
          lineHeight: pollMetrics.questionLineHeight,
          marginTop: pxToRem(pollMetrics.questionMarginTop),
        }}
      >
        {poll.question}
      </p>

      <div
        aria-label={poll.question}
        className="flex flex-col"
        role={poll.multi ? "group" : "radiogroup"}
        style={{
          gap: pxToRem(pollMetrics.optionsGap),
          marginTop: pxToRem(pollMetrics.optionsMarginTop),
        }}
      >
        {poll.options.map((option) => (
          <PollOptionRow
            closed={closed}
            disabled={closed || disabled}
            key={option.id}
            multi={poll.multi}
            onToggle={() => onToggleOption(option.id)}
            option={option}
            percent={percentages[option.id] ?? 0}
            selected={selectedIds.has(option.id)}
          />
        ))}
      </div>

      <div
        className="flex items-center text-[hsl(var(--text-secondary))]"
        style={{
          fontSize: pxToRem(pollMetrics.footerFontSize),
          gap: pxToRem(pollMetrics.footerGap),
          marginTop: pxToRem(pollMetrics.footerMarginTop),
        }}
      >
        <span data-testid="poll-voter-count">
          {t("messages.poll.voterCount", { count: poll.totalVoters })}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-[hsl(var(--text-soft))]"
          style={{
            height: pxToRem(pollMetrics.footerDotSize),
            width: pxToRem(pollMetrics.footerDotSize),
          }}
        />
        <span data-testid="poll-deadline">
          {closed
            ? t("messages.poll.closed")
            : t("messages.poll.closesIn", { time: closesInLabel ?? "" })}
        </span>

        {/*
          karar #11: bağlantı `canSeeVoters` ile çizilir, `!anonymous` diye
          türetilmez. Uç anonim ankette zaten 403 veriyor; istemcinin kendi
          türetmesi, sunucu bir gün bayrağı değiştirdiğinde ikisinin ayrışması
          demek olurdu.
        */}
        {poll.canSeeVoters && onOpenVoters ? (
          <button
            className="ml-auto shrink-0 text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="poll-see-voters"
            onClick={onOpenVoters}
            style={{ fontSize: pxToRem(pollMetrics.footerActionFontSize), fontWeight: 600 }}
            type="button"
          >
            {t("messages.poll.seeVoters")}
          </button>
        ) : null}
      </div>

      {errorText ? (
        <p
          className="text-[hsl(var(--danger))]"
          data-testid="poll-error"
          role="alert"
          style={{
            fontSize: pxToRem(pollMetrics.footerFontSize),
            marginTop: pxToRem(pollMetrics.footerGap),
          }}
        >
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
