"use client";

import React, { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AwaitingRow } from "@/components/home/home-awaiting-card";
import {
  HomeCard,
  HomeCardError,
  HomeCardMessage,
  HomeSkeletonRows,
} from "@/components/home/home-card";
import { HOME_LIST_ROW_HEIGHT } from "@/components/home/home-list-row";
import { HomeCardNotice } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { useHomeActions } from "@/hooks/use-home-actions";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { toHomeCardState } from "@/hooks/use-home-queries";
import {
  HOME_STALE_TIME_MS,
  fetchHomeAwaiting,
  fetchHomeSummary,
  homeQueryKeys,
} from "@/lib/home/client";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import { parseInboxSource } from "@/lib/home/side-screens";
import type { AppAwaitingFilter } from "@/lib/home/types";

import { AppScreen } from "./app-screen";
import { ScreenFilterChips, type ScreenChoice } from "./screen-chips";

/**
 * `/inbox` — Gelen kutusu, `07-faz6` §4.
 *
 * Ana Sayfa kartının **tam listesi**: aynı uç, aynı satır bileşeni
 * (`home-list-row.tsx` üzerinden `AwaitingRow`), aynı iyimser kabul mantığı
 * (`useHomeActions`). İkinci bir satır bileşeni, ikinci bir kabul yolu ve toplu
 * işlem yok (§4.1).
 */

const { awaitingCard, sideScreens } = HOME_METRICS;

/** §4 — Ana Sayfa kartı altı satır ister; burası listenin tamamıdır. */
const INBOX_LIMIT = 100;

/** §4 — çip sırası tasarımdan; metinler sözlükten. */
const SOURCE_ORDER: readonly AppAwaitingFilter[] = [
  "all",
  "mention",
  "reply",
  "friend_request",
  "server_invite",
];

const SOURCE_LABEL_KEY: Record<AppAwaitingFilter, string> = {
  all: "inbox.filter.all",
  friend_request: "inbox.filter.friend_request",
  mention: "inbox.filter.mention",
  reply: "inbox.filter.reply",
  server_invite: "inbox.filter.server_invite",
};

export function InboxScreen() {
  const { t } = useI18n();
  const now = useMinuteClock();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const source = parseInboxSource(searchParams.get("source"));
  const sourceChoices: readonly ScreenChoice<AppAwaitingFilter>[] = SOURCE_ORDER.map((value) => ({
    label: t(SOURCE_LABEL_KEY[value]),
    value,
  }));

  const summary = useQuery({
    queryFn: fetchHomeSummary,
    queryKey: homeQueryKeys.summary,
    staleTime: HOME_STALE_TIME_MS.summary,
  });

  const awaiting = useQuery({
    queryFn: () => fetchHomeAwaiting(INBOX_LIMIT, source),
    queryKey: homeQueryKeys.awaiting(INBOX_LIMIT, source),
    staleTime: HOME_STALE_TIME_MS.awaiting,
  });

  /**
   * Faz 5'in yazma katmanı olduğu gibi kullanılıyor: kabul, iyimser çıkarma ve
   * hata yolunda satırın **kendi yerine** dönmesi hep aynı fabrikalardan geliyor.
   * `awaitingLimit` buranın anahtarını verir, yoksa iyimser yazım Ana Sayfa'nın
   * altı satırlık cache'ini yamalar ve bu ekran hiç değişmez.
   */
  const actions = useHomeActions({
    awaitingLimit: INBOX_LIMIT,
    awaitingSource: source,
    recentLimit: 0,
    upcomingLimit: 0,
  });

  const state = toHomeCardState(awaiting);
  const total = summary.data?.pendingReplies ?? (state.status === "ready" ? state.data.total : 0);

  const selectSource = useCallback(
    (next: AppAwaitingFilter) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next === "all") {
        params.delete("source");
      } else {
        params.set("source", next);
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <AppScreen
      focusMinutesLeft={summary.data?.focus?.active ? summary.data.focus.minutesLeft : null}
      subtitle={t("inbox.pendingCount", { count: total })}
      testId="inbox-screen"
      title={t("inbox.title")}
    >
      <HomeCard
        columnSpan={1}
        headerMarginBottom={awaitingCard.headerMarginBottom}
        // Bölüm etiketi ekran adını tekrar etmez; seçili kırılımı söyler (§1 kararı).
        label={t(SOURCE_LABEL_KEY[source])}
        padding={pxToRem(awaitingCard.padding)}
        testId="inbox-card"
      >
        <div style={{ marginBottom: pxToRem(sideScreens.chipRowMarginBottom) }}>
          <ScreenFilterChips
            choices={sourceChoices}
            label={t("inbox.title")}
            onSelect={selectSource}
            testId="inbox-filter"
            value={source}
          />
        </div>

        {state.status === "loading" ? (
          <HomeSkeletonRows
            count={6}
            gap={awaitingCard.gap}
            radius={awaitingCard.rowRadius}
            rowHeight={HOME_LIST_ROW_HEIGHT}
            testId="inbox-skeleton"
          />
        ) : state.status === "error" ? (
          <HomeCardError onRetry={state.retry} testId="inbox-error" />
        ) : state.data.items.length === 0 ? (
          <HomeCardMessage message={t("inbox.empty")} testId="inbox-empty" />
        ) : (
          <div className="flex flex-col" style={{ gap: pxToRem(awaitingCard.gap) }}>
            {state.data.items.map((item) => (
              <AwaitingRow
                item={item}
                key={item.id}
                now={now}
                onAccept={actions.accept.run}
                pending={actions.accept.isPending(item.id)}
                variant="full"
              />
            ))}
          </div>
        )}

        <HomeCardNotice message={actions.notices.accept ?? null} />
      </HomeCard>
    </AppScreen>
  );
}
