"use client";

import React, { memo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import { toHomeCardState, type HomeCardState } from "@/hooks/use-home-queries";
import { HOME_STALE_TIME_MS, fetchHomeRecent, homeQueryKeys } from "@/lib/home/client";
import { HOME_METRICS, HOME_TYPE_SCALE, pxToRem } from "@/lib/home/metrics";
import { formatRelativeTime, getIconSquareAccent, resolveHomeCopy } from "@/lib/home/presentation";
import type { AppRecentResponse, HomeRecentItem } from "@/lib/home/types";
import { cn } from "@/lib/utils";

import { HomeCard, HomeCardError, HomeCardMessage, HomeSkeletonRows } from "./home-card";
import {
  DISPLAY_FONT,
  HomeAvatar,
  HomeCountBadge,
  HomeHeaderLink,
  PresenceDot,
} from "./home-primitives";

/**
 * "KALDIĞIN YER" — SPEC §3.1, `05-faz4` §4.1.
 *
 * Satırın **tamamı tek `a`**: iç içe tıklanabilir öğe yoktur (§9 tuzağı). İkon karesinin tint'i
 * kanal kimliğinden türer; tasarımdaki primary/success/warning sırası örnek veriydi.
 */

const { continueCard } = HOME_METRICS;
const HOME_RECENT_DIALOG_LIMIT = 10;

/** İskelet satırı gerçek satırla aynı yüksekliktedir: 38px ikon + 2×10 padding. */
const ROW_HEIGHT = continueCard.channelIconSize + continueCard.rowPadding * 2;

const CARD_PADDING = `${pxToRem(continueCard.paddingTop)} ${pxToRem(
  continueCard.paddingX,
)} ${pxToRem(continueCard.paddingBottom)}`;

function ChannelIcon({ identityId }: { identityId: string }) {
  const accent = getIconSquareAccent(identityId);

  return (
    <span
      aria-hidden="true"
      className={cn(DISPLAY_FONT, "grid shrink-0 place-items-center")}
      style={{
        background: accent.background,
        borderRadius: pxToRem(continueCard.channelIconRadius),
        color: accent.color,
        fontSize: pxToRem(continueCard.channelIconFontSize),
        fontWeight: 600,
        height: pxToRem(continueCard.channelIconSize),
        lineHeight: 1,
        width: pxToRem(continueCard.channelIconSize),
      }}
    >
      #
    </span>
  );
}

function ContinueRow({
  item,
  now,
  onOpen,
}: {
  item: HomeRecentItem;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const time = resolveHomeCopy(formatRelativeTime(item.lastMessageAt, now), t);

  return (
    <Link
      className="flex min-w-0 items-center outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft)/0.65)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-testid="home-continue-row"
      href={item.href}
      // §2.4 — rozet gezinmeden önce yerel olarak sıfırlanır (algılanan hız). Gerçek okuma
      // işaretlemesi hedef ekranın mevcut davranışı; buradan ikinci bir "read" çağrısı çıkmaz.
      onClick={() => onOpen(item.id)}
      style={{
        borderRadius: pxToRem(continueCard.rowRadius),
        gap: pxToRem(continueCard.rowGap),
        padding: pxToRem(continueCard.rowPadding),
      }}
    >
      {item.kind === "channel" ? (
        <ChannelIcon identityId={item.id} />
      ) : (
        <div className="relative shrink-0">
          <HomeAvatar
            avatarUrl={item.avatarUrl}
            displayName={item.name}
            fontSize={continueCard.avatarFontSize}
            size={continueCard.avatarSize}
          />
          {/* Nokta yalnız sunucunun redakte ederek gönderdiği presence varken çizilir. */}
          {item.presence ? (
            <PresenceDot
              borderColor="hsl(var(--surface-card))"
              borderWidth={continueCard.presenceDotBorderWidth}
              presence={item.presence}
              size={continueCard.presenceDotSize}
            />
          ) : null}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center" style={{ gap: pxToRem(continueCard.titleGap) }}>
          <span
            className="whitespace-nowrap text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(HOME_TYPE_SCALE.cardRowName.size),
              fontWeight: HOME_TYPE_SCALE.cardRowName.weight,
              lineHeight: HOME_TYPE_SCALE.cardRowName.lineHeight,
            }}
          >
            {item.name}
          </span>
          {item.kind === "channel" ? (
            <span
              className="truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(HOME_TYPE_SCALE.contextLabel.size) }}
            >
              {item.serverName ?? ""}
            </span>
          ) : (
            <span
              className="shrink-0 text-[hsl(var(--text-muted))]"
              style={{
                background: "hsl(var(--surface-tertiary))",
                borderRadius: pxToRem(continueCard.dmChipRadius),
                fontSize: pxToRem(continueCard.dmChipFontSize),
                fontWeight: 600,
                padding: `${pxToRem(continueCard.dmChipPaddingY)} ${pxToRem(
                  continueCard.dmChipPaddingX,
                )}`,
              }}
            >
              {t("home.continue.dmChip")}
            </span>
          )}
        </div>

        {item.lastMessage ? (
          <div
            className="flex min-w-0 items-center"
            style={{
              gap: pxToRem(continueCard.previewGap),
              marginTop: pxToRem(continueCard.previewMarginTop),
            }}
          >
            {item.kind === "channel" ? (
              <>
                <HomeAvatar
                  avatarUrl={item.lastMessage.authorAvatarUrl}
                  displayName={item.lastMessage.authorName}
                  fontSize={continueCard.previewAvatarFontSize}
                  size={continueCard.previewAvatarSize}
                />
                <span
                  className="shrink-0 text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(HOME_TYPE_SCALE.secondaryLine.size),
                    fontWeight: 600,
                    lineHeight: HOME_TYPE_SCALE.secondaryLine.lineHeight,
                  }}
                >
                  {`${item.lastMessage.authorName}:`}
                </span>
              </>
            ) : null}
            <span
              className="truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(HOME_TYPE_SCALE.secondaryLine.size) }}
            >
              {item.lastMessage.text}
            </span>
          </div>
        ) : null}
      </div>

      <div
        className="flex shrink-0 flex-col items-end"
        style={{ gap: pxToRem(continueCard.metaGap) }}
      >
        <span
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
            fontWeight: HOME_TYPE_SCALE.timestamp.weight,
            lineHeight: HOME_TYPE_SCALE.timestamp.lineHeight,
          }}
        >
          {time}
        </span>
        {/* "0 okunmamış" rozeti çizilmez (§9 tuzağı). */}
        {item.unreadCount > 0 ? (
          <HomeCountBadge
            count={item.unreadCount}
            label={t("common.unreadMessages", { count: item.unreadCount })}
            tone={item.mentioned ? "danger" : "primary"}
          />
        ) : null}
      </div>
    </Link>
  );
}

function ContinueList({
  items,
  now,
  onOpen,
}: {
  items: AppRecentResponse["items"];
  now: Date;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <ContinueRow item={item} key={`${item.kind}:${item.id}`} now={now} onOpen={onOpen} />
      ))}
    </div>
  );
}

function HomeRecentDialog({
  now,
  onClose,
  onOpen,
}: {
  now: Date;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const recent = useQuery({
    queryFn: () => fetchHomeRecent(HOME_RECENT_DIALOG_LIMIT),
    queryKey: homeQueryKeys.recent(HOME_RECENT_DIALOG_LIMIT),
    staleTime: HOME_STALE_TIME_MS.recent,
  });
  const state = toHomeCardState(recent);
  const handleOpen = (id: string) => {
    onOpen(id);
    onClose();
  };

  return (
    <Modal
      className="max-w-2xl"
      closeLabel={t("home.continue.dialogClose")}
      description={t("home.continue.dialogDescription", { count: HOME_RECENT_DIALOG_LIMIT })}
      onClose={onClose}
      open
      title={t("home.continue.title")}
    >
      <div className="max-h-[60dvh] overflow-y-auto" data-testid="home-continue-dialog">
        {state.status === "loading" ? (
          <HomeSkeletonRows
            count={4}
            gap={0}
            radius={continueCard.rowRadius}
            rowHeight={ROW_HEIGHT}
            testId="home-continue-dialog-skeleton"
          />
        ) : state.status === "error" ? (
          <HomeCardError onRetry={state.retry} testId="home-continue-dialog-error" />
        ) : state.data.items.length === 0 ? (
          <HomeCardMessage message={t("home.continue.empty")} testId="home-continue-dialog-empty" />
        ) : (
          <ContinueList items={state.data.items} now={now} onOpen={handleOpen} />
        )}
      </div>
    </Modal>
  );
}

export type HomeContinueCardProps = {
  now: Date;
  onOpen: (id: string) => void;
  rowCount: number;
  state: HomeCardState<AppRecentResponse>;
};

function HomeContinueCardComponent({ now, onOpen, rowCount, state }: HomeContinueCardProps) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <HomeCard
        accessory={
          <HomeHeaderLink
            aria-expanded={dialogOpen}
            aria-haspopup="dialog"
            fontSize={continueCard.headerLinkFontSize}
            onClick={() => setDialogOpen(true)}
          >
            {t("home.continue.seeAll")}
          </HomeHeaderLink>
        }
        columnSpan={continueCard.columnSpan}
        cardId="continue"
        headerMarginBottom={continueCard.headerMarginBottom}
        headerMarginX={continueCard.headerMarginX}
        label={t("home.continue.title")}
        padding={CARD_PADDING}
        testId="home-continue-card"
      >
        {state.status === "loading" ? (
          <HomeSkeletonRows
            count={rowCount}
            gap={0}
            radius={continueCard.rowRadius}
            rowHeight={ROW_HEIGHT}
            testId="home-continue-skeleton"
          />
        ) : state.status === "error" ? (
          <HomeCardError onRetry={state.retry} testId="home-continue-error" />
        ) : state.data.items.length === 0 ? (
          <HomeCardMessage message={t("home.continue.empty")} testId="home-continue-empty" />
        ) : (
          <ContinueList items={state.data.items} now={now} onOpen={onOpen} />
        )}
      </HomeCard>

      {dialogOpen ? (
        <HomeRecentDialog now={now} onClose={() => setDialogOpen(false)} onOpen={onOpen} />
      ) : null}
    </>
  );
}

export const HomeContinueCard = memo(HomeContinueCardComponent);
