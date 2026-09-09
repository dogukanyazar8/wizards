"use client";

import React from "react";
import { MessageSquare, MoreHorizontal, Phone, Video } from "lucide-react";

import { HomeAvatar, PresenceDot } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import type { HomePresenceStatus } from "@/lib/home/presentation";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Arkadaş satırı — SPEC §4.
 *
 * İki varyant, tek bileşen: çevrimiçi satır dolu `Mesaj` butonu ve iki arama
 * ikonu taşır, çevrimdışı satır soluk avatar ve tint'li `Mesaj`. İkisini iki
 * dosyaya bölmek, aynı satırın iki kopyasını bakmaya bırakırdı.
 *
 * Satır eylemleri `var(--act)` ile yönetilir: `0` iken yalnız hover'da görünür.
 * Görünürlük **klavye odağını da** kapsar (`group-focus-within`) — yalnız
 * hover'a bağlanan bir şerit, klavye kullanıcısı için hiç var olmaz.
 */

const { friends } = MESSAGES_METRICS;

const DOT_PRESENCE: Readonly<Record<string, HomePresenceStatus>> = Object.freeze({
  DND: "DND",
  IDLE: "IDLE",
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
});

export type FriendRowActor = {
  readonly avatarUrl: string | null;
  readonly handle: string;
  readonly id: string;
  readonly name: string;
  readonly status: string;
  /** Türetilmiş durum cümlesi ya da son görülme; boşsa alt satır çizilmez. */
  readonly statusText: string | null;
  /** Durum cümlesi presence rengini alır; `success`'te muted kalır (SPEC §4). */
  readonly statusTone: "danger" | "muted" | "warning";
};

export type FriendRowProps = {
  friend: FriendRowActor;
  onMessage: (friendId: string) => void;
  onOpenMenu: (friendId: string, anchor: { x: number; y: number }) => void;
  onVideoCall?: ((friendId: string) => void) | undefined;
  onVoiceCall?: ((friendId: string) => void) | undefined;
  /** Menü bu satıra ait mi; açık menünün tetikleyicisi vurgulanır. */
  menuOpen: boolean;
};

const TONE_CLASS: Readonly<Record<FriendRowActor["statusTone"], string>> = Object.freeze({
  danger: "text-[hsl(var(--danger))]",
  muted: "text-[hsl(var(--text-muted))]",
  warning: "text-[hsl(var(--warning))]",
});

function IconAction({
  hoverClass,
  icon: Icon,
  label,
  onClick,
  testId,
}: {
  hoverClass: string;
  icon: React.ComponentType<{ "aria-hidden"?: "true"; style?: React.CSSProperties }>;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        hoverClass,
      )}
      data-testid={testId}
      onClick={onClick}
      style={{
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(friends.iconButtonRadius),
        height: pxToRem(friends.iconButtonSize),
        width: pxToRem(friends.iconButtonSize),
      }}
      title={label}
      type="button"
    >
      <Icon
        aria-hidden="true"
        style={{
          height: pxToRem(friends.iconButtonIconSize),
          width: pxToRem(friends.iconButtonIconSize),
        }}
      />
    </button>
  );
}

export function FriendRow({
  friend,
  menuOpen,
  onMessage,
  onOpenMenu,
  onVideoCall,
  onVoiceCall,
}: FriendRowProps) {
  const { t } = useI18n();
  const offline = friend.status === "OFFLINE";

  return (
    <div
      className="group relative flex min-w-0 items-center transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)]"
      data-offline={offline ? "true" : undefined}
      // Kullanıcı adı bir kanca olarak duruyor: e2e belirli bir arkadaşı
      // sırasından bağımsız bulmalı ve sıra presence ile değişiyor. `@` **yok**:
      // öndeki işaret çevrimdışı satırda gizlenen görünür etiketin parçası ve
      // onu bir veri kancasında tutmak, "kullanıcı adı gösterilmiyor" testini
      // sahte biçimde kırardı.
      data-friend-handle={friend.handle.replace(/^@/, "")}
      data-testid="friend-row"
      style={{
        borderRadius: pxToRem(friends.rowRadius),
        gap: pxToRem(friends.rowGap),
        padding: `${pxToRem(friends.rowPaddingY)} ${pxToRem(friends.rowPaddingX)}`,
      }}
    >
      <span
        className="relative shrink-0"
        style={offline ? { opacity: friends.rowOfflineAvatarOpacity } : undefined}
      >
        <HomeAvatar
          avatarUrl={friend.avatarUrl}
          displayName={friend.name}
          fontSize={friends.rowNameFontSize}
          size={friends.rowAvatarSize}
        />
        <PresenceDot
          borderColor="hsl(var(--surface-base))"
          borderWidth={friends.rowPresenceDotBorderWidth}
          presence={DOT_PRESENCE[friend.status] ?? "OFFLINE"}
          size={friends.rowPresenceDotSize}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center" style={{ gap: pxToRem(friends.rowHandleGap) }}>
          <span
            className={cn(
              "truncate",
              offline ? "text-[hsl(var(--text-secondary))]" : "text-[hsl(var(--foreground))]",
            )}
            style={{
              fontSize: pxToRem(friends.rowNameFontSize),
              fontWeight: 600,
              lineHeight: friends.rowNameLineHeight,
            }}
          >
            {friend.name}
          </span>
          {!offline ? (
            <span
              className="shrink-0 text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(friends.rowHandleFontSize), fontWeight: 500 }}
            >
              {friend.handle}
            </span>
          ) : null}
        </span>
        {friend.statusText ? (
          <span
            className={cn("block truncate", TONE_CLASS[friend.statusTone])}
            data-testid="friend-row-status"
            style={{
              fontSize: pxToRem(friends.rowStatusFontSize),
              lineHeight: friends.rowStatusLineHeight,
              marginTop: pxToRem(friends.rowStatusMarginTop),
            }}
          >
            {friend.statusText}
          </span>
        ) : null}
      </span>

      {/*
        `--act` 0 iken şerit yalnız hover'da görünür; `group-focus-within`
        klavye odağını da kapsar. Sadece hover'a bağlanan bir şerit, klavye
        kullanıcısı için hiç var olmaz.
      */}
      <span
        className="flex shrink-0 items-center opacity-[var(--act,0)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        style={{ gap: pxToRem(friends.actionsGap) }}
      >
        <button
          className={cn(
            "flex shrink-0 items-center transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            offline
              ? "bg-[hsl(var(--primary)/0.16)] text-[var(--primary-readable)] hover:bg-[hsl(var(--primary)/0.26)]"
              : "bg-[hsl(var(--primary))] text-white hover:brightness-110",
          )}
          data-testid="friend-row-message"
          onClick={() => onMessage(friend.id)}
          style={{
            borderRadius: pxToRem(friends.messageButtonRadius),
            fontSize: pxToRem(friends.messageButtonFontSize),
            fontWeight: 600,
            gap: pxToRem(friends.messageButtonGap),
            height: pxToRem(friends.messageButtonHeight),
            padding: `0 ${pxToRem(friends.messageButtonPaddingX)}`,
          }}
          type="button"
        >
          <MessageSquare
            aria-hidden="true"
            style={{
              height: pxToRem(friends.messageButtonIconSize),
              width: pxToRem(friends.messageButtonIconSize),
            }}
          />
          {t("messages.friends.action.message")}
        </button>

        {/*
          Çevrimdışı satırda arama ikonu yok: kimsenin açmayacağı bir çağrı
          başlatan iki düğme, tıklanınca hiçbir şey olmayan iki düğmedir.
        */}
        {!offline && onVoiceCall ? (
          <IconAction
            hoverClass="hover:bg-[hsl(var(--success)/0.16)] hover:text-[hsl(var(--success))]"
            icon={Phone}
            label={t("messages.friends.action.voiceCall")}
            onClick={() => onVoiceCall(friend.id)}
            testId="friend-row-voice-call"
          />
        ) : null}
        {!offline && onVideoCall ? (
          <IconAction
            hoverClass="hover:bg-[hsl(var(--primary)/0.16)] hover:text-[hsl(var(--primary))]"
            icon={Video}
            label={t("messages.friends.action.videoCall")}
            onClick={() => onVideoCall(friend.id)}
            testId="friend-row-video-call"
          />
        ) : null}

        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={t("messages.friends.action.more")}
          className={cn(
            "grid shrink-0 place-items-center transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
            menuOpen
              ? "bg-[hsl(var(--surface-soft))] text-[hsl(var(--foreground))]"
              : "bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] hover:bg-[var(--surface-hover)] hover:text-[hsl(var(--foreground))]",
          )}
          data-testid="friend-row-more"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            // Menü tetikleyicinin **sol alt** köşesine açılır; sağ kenara
            // dayanan bir menü dar ekranda görünüm alanının dışına taşardı.
            onOpenMenu(friend.id, { x: rect.left, y: rect.bottom });
          }}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(friends.iconButtonRadius),
            height: pxToRem(friends.iconButtonSize),
            width: pxToRem(friends.iconButtonSize),
          }}
          type="button"
        >
          <MoreHorizontal
            aria-hidden="true"
            style={{
              height: pxToRem(friends.iconButtonIconSize),
              width: pxToRem(friends.iconButtonIconSize),
            }}
          />
        </button>
      </span>
    </div>
  );
}
