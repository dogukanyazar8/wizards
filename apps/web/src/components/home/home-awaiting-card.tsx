"use client";

import React, { memo } from "react";
import Link from "next/link";

import { useI18n } from "@/components/providers/locale-provider";
import type { HomeCardState } from "@/hooks/use-home-queries";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import { withComposerFocus } from "@/lib/home/href";
import type { AppAwaitingResponse, HomeAwaitingItem } from "@/lib/home/types";

import { HomeCard, HomeCardError, HomeCardMessage, HomeSkeletonRows } from "./home-card";
import { HomeListRow, HOME_LIST_ROW_HEIGHT, type HomeListRowVariant } from "./home-list-row";
import { HomeCardNotice, HomeHeaderLink, homeButtonStyle } from "./home-primitives";

/**
 * "YANIT BEKLİYOR" — SPEC §3.3, `05-faz4` §4.3.
 *
 * Satırın kendisi `home-list-row.tsx`'te ve **tek dosyadır**: Gelen kutusu da
 * Bahsedilmeler de aynı bileşeni çizer (`07-faz6` §4.1). Burada kalan yalnız
 * kartın kabuğu ve satırın aksiyonu.
 */

const { awaitingCard } = HOME_METRICS;

const ACTION_CLASS =
  "inline-flex shrink-0 items-center justify-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] outline-hidden transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]";

/**
 * Satırın sağındaki aksiyon. "Yanıtla" bir gezinmedir (hedefe gider ve besteciyi
 * odaklar), "Kabul et" bir yazımdır — ikisi de satır bağlantısının **kardeşi**,
 * çünkü bir bağlantının içine ikinci bir bağlantı giremez.
 */
export function AwaitingRowAction({
  item,
  onAccept,
  pending,
}: {
  item: HomeAwaitingItem;
  onAccept: (item: HomeAwaitingItem) => void;
  pending: boolean;
}) {
  const { t } = useI18n();

  if (item.action === "reply") {
    return (
      <Link
        className={ACTION_CLASS}
        data-testid="home-awaiting-action"
        href={withComposerFocus(item.href)}
        style={homeButtonStyle()}
      >
        {t("home.awaiting.reply")}
      </Link>
    );
  }

  if (item.action === "accept") {
    return (
      <button
        className={`${ACTION_CLASS} disabled:cursor-wait disabled:opacity-60`}
        data-testid="home-awaiting-action"
        // §2.2 — the same row cannot be accepted twice: the button is out of
        // service while its own request is in flight.
        disabled={pending}
        onClick={() => onAccept(item)}
        style={homeButtonStyle()}
        type="button"
      >
        {t("home.awaiting.accept")}
      </button>
    );
  }

  return null;
}

/** Ana Sayfa kartı ve Gelen kutusu aynı satırı, aynı aksiyonla çizer. */
export function AwaitingRow({
  item,
  now,
  onAccept,
  pending,
  variant = "card",
}: {
  item: HomeAwaitingItem;
  now: Date;
  onAccept: (item: HomeAwaitingItem) => void;
  pending: boolean;
  variant?: HomeListRowVariant;
}) {
  return (
    <HomeListRow
      action={<AwaitingRowAction item={item} onAccept={onAccept} pending={pending} />}
      context={item.context}
      excerpt={item.reason}
      href={item.href}
      now={now}
      occurredAt={item.occurredAt}
      testId="home-awaiting-row"
      user={item.user}
      variant={variant}
    />
  );
}

export type HomeAwaitingCardProps = {
  now: Date;
  onAccept: (item: HomeAwaitingItem) => void;
  isAcceptPending: (id: string) => boolean;
  notice: string | null;
  rowCount: number;
  state: HomeCardState<AppAwaitingResponse>;
};

function HomeAwaitingCardComponent({
  isAcceptPending,
  notice,
  now,
  onAccept,
  rowCount,
  state,
}: HomeAwaitingCardProps) {
  const { t } = useI18n();
  const newCount = state.status === "ready" ? state.data.newCount : 0;

  return (
    <HomeCard
      accessory={
        <HomeHeaderLink fontSize={awaitingCard.headerLinkFontSize} href="/inbox">
          {t("home.awaiting.inbox")}
        </HomeHeaderLink>
      }
      columnSpan={awaitingCard.columnSpan}
      cardId="awaiting"
      headerMarginBottom={awaitingCard.headerMarginBottom}
      label={t("home.awaiting.title")}
      leading={
        // `newCount` 0 ise pill hiç çizilmez (§4.3).
        newCount > 0 ? (
          <span
            className="text-[var(--danger-readable)]"
            data-testid="home-awaiting-new"
            style={{
              background: "hsl(var(--danger) / 0.14)",
              borderRadius: pxToRem(HOME_METRICS.radius.pill),
              fontSize: pxToRem(awaitingCard.newPillFontSize),
              fontWeight: 600,
              lineHeight: 1,
              padding: `${pxToRem(awaitingCard.newPillPaddingY)} ${pxToRem(
                awaitingCard.newPillPaddingX,
              )}`,
            }}
          >
            {t("home.awaiting.new", { count: newCount })}
          </span>
        ) : null
      }
      leadingGap={awaitingCard.headerGap}
      padding={pxToRem(awaitingCard.padding)}
      testId="home-awaiting-card"
    >
      {state.status === "loading" ? (
        <HomeSkeletonRows
          count={rowCount}
          gap={awaitingCard.gap}
          radius={awaitingCard.rowRadius}
          rowHeight={HOME_LIST_ROW_HEIGHT}
          testId="home-awaiting-skeleton"
        />
      ) : state.status === "error" ? (
        <HomeCardError onRetry={state.retry} testId="home-awaiting-error" />
      ) : state.data.items.length === 0 ? (
        <HomeCardMessage message={t("home.awaiting.empty")} testId="home-awaiting-empty" />
      ) : (
        <div className="flex flex-col" style={{ gap: pxToRem(awaitingCard.gap) }}>
          {state.data.items.map((item) => (
            <AwaitingRow
              item={item}
              key={item.id}
              now={now}
              onAccept={onAccept}
              pending={isAcceptPending(item.id)}
            />
          ))}
        </div>
      )}

      <HomeCardNotice message={notice} />
    </HomeCard>
  );
}

export const HomeAwaitingCard = memo(HomeAwaitingCardComponent);
