"use client";

import React, { memo } from "react";
import { Headphones, Phone } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { VoiceLevelWaveform } from "@/components/voice/room/voice-room-primitives";
import type { HomeCardState } from "@/hooks/use-home-queries";
import type { HomeAudioLevels } from "@/hooks/use-home-realtime";
import { HOME_METRICS, HOME_TYPE_SCALE, hairline, pxToEm, pxToRem } from "@/lib/home/metrics";
import { deriveRoomCaption, resolveHomeCopy, selectRoomSpeaker } from "@/lib/home/presentation";
import type { HomeLiveRoom, HomeLiveRoomKind, VoiceLiveResponse } from "@/lib/home/types";
import { cn } from "@/lib/utils";

import { HomeCard, HomeCardError, HomeCardMessage, HomeSkeletonRows } from "./home-card";
import { HomeCardNotice } from "./home-primitives";
import { HomeAvatar, HomeAvatarStack, homeButtonStyle } from "./home-primitives";

/**
 * "ŞU AN CANLI" — SPEC §3.2, `05-faz4` §4.2.
 *
 * Üç kural:
 * - Başlıktaki sayı `rooms.length` değil `totalCount`'tur; ölçek adımı listeyi kısaltır (§9).
 * - Konuşan yoksa konuşan satırı ve dalga formu gizlenir, yerine katılımcı özeti çıkar.
 * - Nabız ve dalga `prefers-reduced-motion` altında durur (§7).
 */

const { liveCard } = HOME_METRICS;

/** Oda kartı + katılımcı yığını; iskelet aynı yüksekliği tutar, ızgara zıplamaz. */
const ROOM_HEIGHT = liveCard.roomIconSize + liveCard.roomPadding * 2;
const SKELETON_ROW_HEIGHT = ROOM_HEIGHT + liveCard.stackMarginTop + liveCard.stackAvatarSize;

const CARD_PADDING = `${pxToRem(liveCard.paddingTop)} ${pxToRem(liveCard.paddingX)} ${pxToRem(
  liveCard.paddingBottom,
)}`;

/** Faz 3 sözleşmesi iki tür taşıyor; `game` bugün hiçbir uçtan gelmiyor. */
const ROOM_ICON: Record<HomeLiveRoomKind, typeof Headphones> = {
  call: Phone,
  voice: Headphones,
};

function LiveRoom({
  audioLevels,
  busy,
  joined,
  onJoin,
  onLeave,
  reducedMotion,
  room,
}: {
  audioLevels: HomeAudioLevels;
  busy: boolean;
  joined: boolean;
  onJoin: (room: HomeLiveRoom) => void;
  onLeave: () => void;
  reducedMotion: boolean;
  room: HomeLiveRoom;
}) {
  const { t } = useI18n();
  const RoomIcon = ROOM_ICON[room.kind];
  const speaker = selectRoomSpeaker(room, audioLevels);
  const caption = resolveHomeCopy(deriveRoomCaption(room), t);
  const actionLabel = t(joined ? "home.live.leave" : "home.live.join");

  return (
    <div className="group flex flex-col" data-testid="home-live-room">
      <div
        className={cn(
          "flex min-w-0 items-center border-solid transition-colors",
          // §4 — katıldıktan sonra kartın kenarı `--success/0.35`.
          joined
            ? "border-[hsl(var(--success)/0.35)]"
            : "border-[hsl(var(--primary)/0.24)] group-hover:border-[hsl(var(--primary)/0.45)]",
        )}
        style={{
          background:
            "linear-gradient(120deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.04))",
          borderRadius: pxToRem(liveCard.roomRadius),
          borderWidth: hairline(liveCard.roomBorderWidth),
          gap: pxToRem(liveCard.roomGap),
          padding: pxToRem(liveCard.roomPadding),
        }}
      >
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center text-[hsl(var(--primary))]"
          style={{
            background: "hsl(var(--primary) / 0.18)",
            borderRadius: pxToRem(liveCard.roomIconRadius),
            height: pxToRem(liveCard.roomIconSize),
            width: pxToRem(liveCard.roomIconSize),
          }}
        >
          <RoomIcon
            strokeWidth={liveCard.roomIconStrokeWidth}
            style={{
              height: pxToEm(liveCard.roomIconGlyphSize),
              width: pxToEm(liveCard.roomIconGlyphSize),
            }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center" style={{ gap: pxToRem(liveCard.roomTitleGap) }}>
            <span
              className="whitespace-nowrap text-[hsl(var(--foreground))]"
              style={{
                fontSize: pxToRem(HOME_TYPE_SCALE.roomName.size),
                fontWeight: HOME_TYPE_SCALE.roomName.weight,
                lineHeight: HOME_TYPE_SCALE.roomName.lineHeight,
              }}
            >
              {room.name}
            </span>
            <span
              className="truncate whitespace-nowrap text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(HOME_TYPE_SCALE.contextLabel.size) }}
            >
              {room.serverName ?? ""}
            </span>
          </div>

          <div
            className="flex min-w-0 items-center"
            style={{
              gap: pxToRem(liveCard.speakerGap),
              marginTop: pxToRem(liveCard.speakerMarginTop),
            }}
          >
            {speaker ? (
              <>
                <HomeAvatar
                  avatarUrl={speaker.actor.avatarUrl}
                  displayName={speaker.actor.displayName}
                  fontSize={liveCard.speakerAvatarFontSize}
                  size={liveCard.speakerAvatarSize}
                />
                <span
                  className="truncate text-[hsl(var(--text-secondary))]"
                  data-testid="home-live-speaker"
                  style={{
                    fontSize: pxToRem(HOME_TYPE_SCALE.secondaryLine.size),
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {t("home.live.speaking", { name: speaker.actor.displayName })}
                </span>
                <span
                  className="flex shrink-0 items-center"
                  style={{ height: pxToRem(liveCard.waveHeight) }}
                >
                  {/* Dalga seviyeyle çizilir, kendi timer'ı yoktur; azaltılmış harekette düz kalır. */}
                  <VoiceLevelWaveform
                    active={!reducedMotion}
                    compact
                    level={reducedMotion ? 0 : speaker.level}
                  />
                </span>
              </>
            ) : (
              <span
                className="truncate text-[hsl(var(--text-muted))]"
                data-testid="home-live-quiet"
                style={{ fontSize: pxToRem(HOME_TYPE_SCALE.secondaryLine.size) }}
              >
                {t("home.live.connected", { count: room.participantCount })}
              </span>
            )}
          </div>
        </div>

        {/*
          Oda kartının tek tıklanabilir öğesi. Kabuk `div`, aksiyon `button` — kartı da bağlantı
          yapmak iç içe tıklanabilir öğe üretirdi (§9). Hover kenarı `group` üzerinden gelir.

          Faz 5 §4: bu buton **mevcut** ses akışını çağırıyor (`joinChannel` ya da DM çağrı
          denetleyicisinin `joinOngoingCall`'ı), yeni bir katılma yolu yazmıyor. Katılınca "Ayrıl"
          olur; başka bir odadayken basmak mevcut akışın oda değiştirme davranışıdır — o akış
          önce eskisinden çıkar, yeni bir onay diyalogu uydurulmadı.
        */}
        <button
          aria-label={t("home.live.roomAction", { action: actionLabel, room: room.name })}
          className={cn(
            "inline-flex shrink-0 items-center justify-center outline-hidden transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-60",
            joined
              ? "bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--foreground))]"
              : "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
          )}
          data-testid="home-live-join"
          // §8 — çift tık iki katılma isteği göndermez.
          disabled={busy}
          onClick={() => (joined ? onLeave() : onJoin(room))}
          style={homeButtonStyle()}
          type="button"
        >
          {actionLabel}
        </button>
      </div>

      <div
        className="flex items-center"
        style={{
          gap: pxToRem(liveCard.stackGap),
          margin: `${pxToRem(liveCard.stackMarginTop)} ${pxToRem(liveCard.stackMarginX)} 0`,
        }}
      >
        <HomeAvatarStack
          actors={room.participants}
          avatarFontSize={liveCard.stackAvatarFontSize}
          avatarSize={liveCard.stackAvatarSize}
          overflowFontSize={liveCard.stackOverflowFontSize}
          overlap={liveCard.stackOverlap}
          ringColor="hsl(var(--surface-card))"
          ringWidth={liveCard.stackRingWidth}
          total={room.participantCount}
        />
        {caption ? (
          <span
            className="truncate text-[hsl(var(--text-muted))]"
            style={{ fontSize: pxToRem(liveCard.captionFontSize) }}
          >
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export type HomeLiveCardProps = {
  audioLevels: HomeAudioLevels;
  isVoiceBusy: boolean;
  /** SPEC §6 — mevcut voice context'ten gelir; kart kendi kopyasını tutmaz. */
  joinedRoomId: string | null;
  notice: string | null;
  onJoin: (room: HomeLiveRoom) => void;
  onLeave: () => void;
  reducedMotion: boolean;
  roomCount: number;
  state: HomeCardState<VoiceLiveResponse>;
};

function HomeLiveCardComponent({
  audioLevels,
  isVoiceBusy,
  joinedRoomId,
  notice,
  onJoin,
  onLeave,
  reducedMotion,
  roomCount,
  state,
}: HomeLiveCardProps) {
  const { t } = useI18n();
  const openRooms = state.status === "ready" ? state.data.totalCount : 0;

  return (
    <HomeCard
      accessory={
        state.status === "ready" && openRooms > 0 ? (
          <span
            className="flex items-center text-[var(--success-readable)]"
            data-testid="home-live-count"
            style={{
              fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
              fontWeight: HOME_TYPE_SCALE.timestamp.weight,
              gap: pxToRem(liveCard.headerGap),
              lineHeight: 1,
            }}
          >
            <span
              aria-hidden="true"
              className={cn("rounded-full bg-[hsl(var(--success))]", "home-pulse-dot")}
              style={{
                height: pxToRem(liveCard.pulseDotSize),
                width: pxToRem(liveCard.pulseDotSize),
              }}
            />
            {t("home.live.openRooms", { count: openRooms })}
          </span>
        ) : null
      }
      columnSpan={liveCard.columnSpan}
      cardId="live"
      headerMarginBottom={liveCard.headerMarginBottom}
      headerMarginX={liveCard.headerMarginX}
      label={t("home.live.title")}
      padding={CARD_PADDING}
      testId="home-live-card"
    >
      {state.status === "loading" ? (
        <HomeSkeletonRows
          count={roomCount}
          gap={liveCard.roomSpacing}
          radius={liveCard.roomRadius}
          rowHeight={SKELETON_ROW_HEIGHT}
          testId="home-live-skeleton"
        />
      ) : state.status === "error" ? (
        <HomeCardError onRetry={state.retry} testId="home-live-error" />
      ) : state.data.rooms.length === 0 ? (
        <HomeCardMessage message={t("home.live.empty")} testId="home-live-empty" />
      ) : (
        <div className="flex flex-col" style={{ gap: pxToRem(liveCard.roomSpacing) }}>
          {state.data.rooms.map((room) => (
            <LiveRoom
              audioLevels={audioLevels}
              busy={isVoiceBusy}
              joined={joinedRoomId === room.id}
              key={room.id}
              onJoin={onJoin}
              onLeave={onLeave}
              reducedMotion={reducedMotion}
              room={room}
            />
          ))}
        </div>
      )}

      <HomeCardNotice message={notice} />
    </HomeCard>
  );
}

export const HomeLiveCard = memo(HomeLiveCardComponent);
