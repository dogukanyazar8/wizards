"use client";

import React, { memo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";

import type { HomeCardState } from "@/hooks/use-home-queries";
import type { FriendDto } from "@/lib/friends/types";
import { HOME_METRICS, HOME_TYPE_SCALE, pxToEm, pxToRem } from "@/lib/home/metrics";
import { MESSAGES_FRIENDS_ROUTE } from "@/lib/messages/routes";
import {
  deriveFriendStatusText,
  resolveHomeCopy,
  type HomePresenceStatus,
} from "@/lib/home/presentation";

import { HomeCard, HomeCardError, HomeCardMessage, HomeSkeletonRows } from "./home-card";
import { HomeAvatar, HomeCardNotice, HomeHeaderLink, PresenceDot } from "./home-primitives";

/**
 * "ARKADAŞLAR" — SPEC §3.6, `05-faz4` §4.6.
 *
 * Veri kaynağı `GET /api/v1/friends`: Faz 3'ün bir ucu **değil**, presence'a göre sıralamıyor ve
 * başlığın istediği toplam sayı zaten tüm listeden geliyor. Bu yüzden filtreleme ve kesme burada
 * yapılır — "istemcide kırpma yok" kuralı Faz 3 uçları içindir (raporda yazılı).
 *
 * Durum metni `deriveFriendStatusText`ten gelir; öncelik sırası saf fonksiyonda ve testlidir.
 */

const { friendsStrip } = HOME_METRICS;

const CARD_PADDING = `${pxToRem(friendsStrip.paddingTop)} ${pxToRem(
  friendsStrip.paddingX,
)} ${pxToRem(friendsStrip.paddingBottom)}`;

const CARD_HEIGHT = friendsStrip.cardPaddingY * 2 + friendsStrip.avatarSize;

/** Presence'ı görünür sayılan üç durum; "Görünmez"/çevrimdışı şeride girmez. */
const ONLINE_PRESENCE: readonly HomePresenceStatus[] = ["ONLINE", "IDLE", "DND"];

export function isFriendOnline(friend: Pick<FriendDto, "status">): boolean {
  return ONLINE_PRESENCE.includes(friend.status);
}

/**
 * Şeride girecek arkadaşlar: önce çevrimiçi olanlar, ölçek adımının izin verdiği kadar.
 *
 * Sıra kararlıdır — `ONLINE` → `IDLE` → `DND`, sonra ada göre — yoksa her tazelemede kartlar yer
 * değiştirir ve göz takip edemez.
 */
export function selectStripFriends(friends: readonly FriendDto[], limit: number): FriendDto[] {
  const order: Record<string, number> = { DND: 2, IDLE: 1, ONLINE: 0 };

  return friends
    .filter(isFriendOnline)
    .sort((left, right) => {
      const byPresence = (order[left.status] ?? 3) - (order[right.status] ?? 3);
      if (byPresence !== 0) {
        return byPresence;
      }

      return (left.displayName ?? left.username).localeCompare(right.displayName ?? right.username);
    })
    .slice(0, limit);
}

/** §6'nın üç öğesi, mevcut `ContextMenu` içinde. */
const MENU_KEY = {
  call: "home.friends.menu.call",
  message: "home.friends.menu.message",
  profile: "home.friends.menu.profile",
};

function FriendCard({
  friend,
  now,
  onCall,
  onMessage,
  onProfile,
}: {
  friend: FriendDto;
  now: Date;
  onCall: (friend: FriendDto) => void;
  onMessage: (friend: FriendDto) => void;
  onProfile: (friend: FriendDto) => void;
}) {
  const { t } = useI18n();
  const [menu, setMenu] = useState({ open: false, x: 0, y: 0 });
  const displayName = friend.displayName ?? friend.username;
  const statusText = resolveHomeCopy(
    deriveFriendStatusText(
      {
        customStatus: friend.customStatus,
        lastSeenAt: friend.lastSeenAt,
        status: friend.status,
        voiceRoom: friend.voiceRoom,
      },
      now,
    ),
    t,
  );

  const openMenu = (position: { x: number; y: number }) => setMenu({ open: true, ...position });
  const closeMenu = () => setMenu((current) => ({ ...current, open: false }));

  return (
    <>
      <button
        aria-haspopup="menu"
        aria-label={t("home.friends.cardLabel", { name: displayName, status: statusText })}
        // `home-hover-lift`: yükselme `prefers-reduced-motion` altında globals.css'te kapanır (§2.5).
        className="home-hover-lift flex min-w-0 flex-1 shrink-0 snap-start items-center bg-[hsl(var(--surface-secondary))] text-left outline-hidden transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] focus-visible:bg-[hsl(var(--surface-soft))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="home-friend-card"
        // §9 — sol tık DM açar, sağ tık menüyü açar; sağ tık DM'i tetiklemez.
        onClick={() => onMessage(friend)}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu({ x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          // §6 — klavye karşılığı: Shift+F10 ve bağlam menüsü tuşu.
          if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) {
            return;
          }

          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu({ x: rect.left, y: rect.bottom });
        }}
        style={{
          borderRadius: pxToRem(friendsStrip.cardRadius),
          gap: pxToRem(friendsStrip.cardGap),
          padding: `${pxToRem(friendsStrip.cardPaddingY)} ${pxToRem(
            friendsStrip.cardPaddingRight,
          )} ${pxToRem(friendsStrip.cardPaddingY)} ${pxToRem(friendsStrip.cardPaddingLeft)}`,
        }}
        type="button"
      >
        <span className="relative shrink-0">
          <HomeAvatar
            avatarUrl={friend.avatarUrl}
            displayName={displayName}
            fontSize={friendsStrip.avatarFontSize}
            size={friendsStrip.avatarSize}
          />
          <PresenceDot
            borderColor="hsl(var(--surface-secondary))"
            borderWidth={friendsStrip.presenceDotBorderWidth}
            presence={friend.status}
            size={friendsStrip.presenceDotSize}
          />
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(HOME_TYPE_SCALE.friendCardName.size),
              fontWeight: HOME_TYPE_SCALE.friendCardName.weight,
              lineHeight: HOME_TYPE_SCALE.friendCardName.lineHeight,
            }}
          >
            {displayName}
          </span>
          <span
            className="block truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(HOME_TYPE_SCALE.friendCardStatus.size),
              marginTop: pxToRem(friendsStrip.statusMarginTop),
            }}
          >
            {statusText}
          </span>
        </span>
      </button>

      {/* §6 — mevcut `ContextMenu`; yeni bir menü bileşeni yazılmadı. */}
      <ContextMenu onClose={closeMenu} open={menu.open} position={menu}>
        <ContextMenuItem
          onClick={() => {
            closeMenu();
            onMessage(friend);
          }}
        >
          {t(MENU_KEY.message)}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            closeMenu();
            onProfile(friend);
          }}
        >
          {t(MENU_KEY.profile)}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            closeMenu();
            onCall(friend);
          }}
        >
          {t(MENU_KEY.call)}
        </ContextMenuItem>
      </ContextMenu>
    </>
  );
}

export type HomeFriendsStripProps = {
  cardCount: number;
  notice: string | null;
  now: Date;
  onCall: (friend: FriendDto) => void;
  onMessage: (friend: FriendDto) => void;
  onProfile: (friend: FriendDto) => void;
  state: HomeCardState<FriendDto[]>;
};

function HomeFriendsStripComponent({
  cardCount,
  notice,
  now,
  onCall,
  onMessage,
  onProfile,
  state,
}: HomeFriendsStripProps) {
  const { t } = useI18n();
  const friends = state.status === "ready" ? state.data : [];
  const online = friends.filter(isFriendOnline).length;
  const visible = selectStripFriends(friends, cardCount);

  return (
    <HomeCard
      accessory={
        <HomeHeaderLink
          fontSize={friendsStrip.headerLinkFontSize}
          gap={friendsStrip.headerLinkGap}
          href={MESSAGES_FRIENDS_ROUTE}
        >
          {t("home.friends.all")}
          <ChevronRight
            aria-hidden="true"
            strokeWidth={friendsStrip.headerArrowStrokeWidth}
            style={{
              height: pxToEm(friendsStrip.headerArrowSize, friendsStrip.headerLinkFontSize),
              width: pxToEm(friendsStrip.headerArrowSize, friendsStrip.headerLinkFontSize),
            }}
          />
        </HomeHeaderLink>
      }
      columnSpan={friendsStrip.columnSpan}
      cardId="friends"
      headerAlign="baseline"
      headerMarginBottom={friendsStrip.gap}
      label={t("home.friends.title")}
      leading={
        state.status === "ready" ? (
          <>
            <span
              className="text-[var(--success-readable)]"
              data-testid="home-friends-online"
              style={{
                fontSize: pxToRem(friendsStrip.headerOnlineFontSize),
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {t("home.friends.online", { count: online })}
            </span>
            <span
              className="text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(friendsStrip.headerTotalFontSize) }}
            >
              {t("home.friends.ofTotal", { count: friends.length })}
            </span>
          </>
        ) : null
      }
      leadingGap={friendsStrip.headerGap}
      padding={CARD_PADDING}
      testId="home-friends-strip"
    >
      {state.status === "loading" ? (
        <div className="flex" style={{ gap: pxToRem(friendsStrip.cardsGap) }}>
          {Array.from({ length: cardCount }, (_unused, index) => (
            <div className="min-w-0 flex-1" key={index}>
              <HomeSkeletonRows
                count={1}
                gap={0}
                radius={friendsStrip.cardRadius}
                rowHeight={CARD_HEIGHT}
                testId="home-friends-skeleton"
              />
            </div>
          ))}
        </div>
      ) : state.status === "error" ? (
        <HomeCardError onRetry={state.retry} testId="home-friends-error" />
      ) : visible.length === 0 ? (
        <HomeCardMessage message={t("home.friends.empty")} testId="home-friends-empty" />
      ) : (
        // §3 — dar ekranda şerit yatay kaydırır ve kart sayısı kırpılmaz; geniş ekranda
        // `flex-1` kartları eşit böler ve kaydırma hiç doğmaz.
        <div
          className="flex min-w-0 snap-x snap-mandatory overflow-x-auto"
          data-testid="home-friends-cards"
          style={{ gap: pxToRem(friendsStrip.cardsGap) }}
        >
          {visible.map((friend) => (
            <FriendCard
              friend={friend}
              key={friend.id}
              now={now}
              onCall={onCall}
              onMessage={onMessage}
              onProfile={onProfile}
            />
          ))}
        </div>
      )}

      <HomeCardNotice message={notice} />
    </HomeCard>
  );
}

export const HomeFriendsStrip = memo(HomeFriendsStripComponent);
