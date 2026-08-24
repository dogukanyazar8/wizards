"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { useHomeActions } from "@/hooks/use-home-actions";
import { useHomeQueries } from "@/hooks/use-home-queries";
import { useHomeRealtime } from "@/hooks/use-home-realtime";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { COMMAND_CENTER_GRID_ATTRIBUTE, buildCommandCenterCss } from "@/lib/home/layout";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";

import { HomeAwaitingCard } from "./home-awaiting-card";
import { HomeContinueCard } from "./home-continue-card";
import { HomeFriendsStrip } from "./home-friends-strip";
import { HomeLiveCard } from "./home-live-card";
import { HomePresenceCard } from "./home-presence-card";
import { HomeTopBar } from "./home-top-bar";
import { HomeUpNextCard } from "./home-up-next-card";

/**
 * Ana Sayfa "1a Komuta Merkezi" — `05-faz4-anasayfa-izgara-kartlar.md`.
 *
 * Bu bileşen üç şey yapar: altı sorguyu açar (`useHomeQueries`), tek saati sürer
 * (`useMinuteClock`) ve soket köprüsünü bağlar (`useHomeRealtime`). Çizim işi kartlarda; hepsi
 * `React.memo` ve yalnız kendi durumu değişince yeniden render oluyor (§7).
 *
 * `08-faz7` §3: ızgara üç kırılımda üç farklı **yazılı** yerleşim kullanır (`layout.ts`).
 * Yerleşim CSS'ten gelir — genişliği React'ta ölçmek sunucuda bir varsayım, istemcide başka
 * bir sayı demek olurdu ve ilk boya yanlış kırılımda çıkardı. Otomatik yerleşime bırakılan
 * tek hücre yoktur; her kartın `grid-area`sı tabloda yazılı.
 */

const { grid } = HOME_METRICS;

/** §3 tablosunun CSS'i; modül seviyesinde bir kez üretilir. */
const BENTO_CSS = buildCommandCenterCss();

export type HomeCommandCenterProps = {
  viewerId: string;
};

export function HomeCommandCenter({ viewerId }: HomeCommandCenterProps) {
  const { locale } = useI18n();
  const now = useMinuteClock();
  const reducedMotion = usePrefersReducedMotion();
  const { audioLevels } = useHomeRealtime({ viewerId });
  const { awaiting, density, friends, live, recent, summary, upcoming } = useHomeQueries();
  const actions = useHomeActions({
    awaitingLimit: density.awaiting,
    recentLimit: density.recent,
    upcomingLimit: density.upcoming,
  });

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-home-bento-scroll=""
      data-testid="home-command-center"
    >
      {/* Kırılım tablosu tek yerden; `layout.ts` dışında bir eşik yazılı değil. */}
      <style dangerouslySetInnerHTML={{ __html: BENTO_CSS }} />
      <HomeTopBar locale={locale} now={now} state={summary} />

      <div
        className="grid min-h-0"
        {...{ [COMMAND_CENTER_GRID_ATTRIBUTE]: "" }}
        data-testid="home-bento-grid"
        style={{
          gap: pxToRem(grid.gap),
          padding: `${pxToRem(grid.paddingTop)} ${pxToRem(grid.paddingX)} ${pxToRem(
            grid.paddingBottom,
          )}`,
        }}
      >
        <HomeContinueCard
          now={now}
          onOpen={actions.markRecentRead}
          rowCount={density.recent}
          state={recent}
        />
        <HomeLiveCard
          audioLevels={audioLevels}
          isVoiceBusy={actions.voice.isBusy}
          joinedRoomId={actions.voice.joinedRoomId}
          notice={actions.notices.join ?? null}
          onJoin={actions.voice.join}
          onLeave={actions.voice.leave}
          reducedMotion={reducedMotion}
          roomCount={density.live}
          state={live}
        />
        <HomeAwaitingCard
          isAcceptPending={actions.accept.isPending}
          notice={actions.notices.accept ?? null}
          now={now}
          onAccept={actions.accept.run}
          rowCount={density.awaiting}
          state={awaiting}
        />
        <HomePresenceCard state={summary} />
        <HomeUpNextCard
          isRemindPending={actions.remind.isPending}
          locale={locale}
          notice={actions.notices.remind ?? null}
          now={now}
          onRemind={actions.remind.run}
          rowCount={density.upcoming}
          state={upcoming}
        />
        <HomeFriendsStrip
          cardCount={density.friends}
          notice={actions.notices.message ?? null}
          now={now}
          onCall={actions.friends.call}
          onMessage={actions.friends.message}
          onProfile={actions.friends.profile}
          state={friends}
        />
      </div>
    </div>
  );
}
