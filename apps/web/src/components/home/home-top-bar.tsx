"use client";

import React, { memo } from "react";

import { AppScreenTopBar } from "@/components/screens/app-screen-top-bar";
import { useI18n } from "@/components/providers/locale-provider";
import type { HomeCardState } from "@/hooks/use-home-queries";
import {
  HOME_GREETING_KEY,
  formatHeaderDate,
  getGreetingKey,
  stripGreetingName,
} from "@/lib/home/presentation";
import type { AppSummaryResponse } from "@/lib/home/types";

/**
 * Ana Sayfa'nın üst çubuğu — SPEC §2.3, `05-faz4` §2.
 *
 * Çubuğun kendisi `AppScreenTopBar`'da ve dört yüzeyin ortağıdır (`07-faz6` §1).
 * Burada kalan yalnız Ana Sayfa'ya ait olan: selamlama ve alt satırın sayıları.
 *
 * Alt satırdaki sayı **0 ise o cümle parçası düşer**: "0 yanıt seni bekliyor" yazılmaz.
 * Tarih `LocaleProvider`ın yerelinde istemcide biçimlenir; sunucu yalnız ISO damga gönderir.
 */

/**
 * Alt satırın parçaları. Sıfır olan sayı **hiç üretilmez**; ikisi de sıfırsa yalnız tarih kalır.
 *
 * Metinler §1.1'in `home.subline.*` dörtlüsünden gelir.
 */
function SubtitleParts({ summary }: { summary: AppSummaryResponse }) {
  const { t } = useI18n();
  const strong = (value: string) => (
    <span className="text-[hsl(var(--text-secondary))]" key={value} style={{ fontWeight: 600 }}>
      {value}
    </span>
  );

  const parts: React.ReactNode[] = [];

  if (summary.pendingReplies > 0) {
    parts.push(
      <React.Fragment key="replies">
        {strong(t("home.subline.pendingReplies", { count: summary.pendingReplies }))}{" "}
        {t("home.subline.waiting")}
      </React.Fragment>,
    );
  }

  if (summary.unreadMentions > 0) {
    parts.push(
      <React.Fragment key="mentions">
        {strong(t("home.subline.mentions", { count: summary.unreadMentions }))}{" "}
        {t("home.subline.unread")}
      </React.Fragment>,
    );
  }

  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index === 0 ? " · " : ", "}
          {part}
        </React.Fragment>
      ))}
    </>
  );
}

export type HomeTopBarProps = {
  locale: string;
  now: Date;
  state: HomeCardState<AppSummaryResponse>;
};

function HomeTopBarComponent({ locale, now, state }: HomeTopBarProps) {
  const { t } = useI18n();
  const summary = state.status === "ready" ? state.data : null;
  const greetingKey = HOME_GREETING_KEY[getGreetingKey(now.getHours())];
  // Ad gelmeden şablonun ad parçası düşürülür; ekranda hiçbir zaman `{name}` görünmez.
  const title = summary
    ? t(greetingKey, { name: summary.greetingName })
    : stripGreetingName(t(greetingKey));

  return (
    <AppScreenTopBar
      // Odak pill'i yalnız odak açıkken (§2); sayı §3.3'ün tek kaynağından.
      focusMinutesLeft={summary?.focus?.active ? summary.focus.minutesLeft : null}
      subtitle={
        <>
          {summary ? formatHeaderDate(summary.dateLabel, locale) : ""}
          {summary ? <SubtitleParts summary={summary} /> : null}
        </>
      }
      subtitleTestId="home-top-bar-subtitle"
      testId="home-top-bar"
      title={title}
    />
  );
}

export const HomeTopBar = memo(HomeTopBarComponent);
