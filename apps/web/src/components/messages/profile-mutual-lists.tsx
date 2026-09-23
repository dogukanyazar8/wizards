"use client";

import React from "react";
import Link from "next/link";
import type { MessagesPresence, UserProfilePanelDTO } from "@wizards/types";

import { DISPLAY_FONT, PresenceDot } from "@/components/home/home-primitives";
import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import type { HomePresenceStatus } from "@/lib/home/presentation";
import { buildServerHref } from "@/lib/home/href";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { profileTintForeground, profileTintSurface } from "@/lib/messages/profile-tint";
import { cn } from "@/lib/utils";

/**
 * `ORTAK SUNUCULAR` ve `ORTAK ARKADAŞLAR` — SPEC-MESAJLAR §15.3.4-5, yalnız DM kolunda.
 *
 * İki bölüm tek dosyada: aynı satır iskeletinin iki ölçüsü (28px kare karo / 28px daire
 * karo), aynı boş-bölüm kuralı, aynı iskelet. Ayrı iki dosya, ilk düzenlemede ayrışacak
 * iki kopya demekti.
 *
 * **Renk kuralı iki bölümde farklıdır ve bu bilerekdir** (Ş1 raporu): kişi karosu
 * `resolveProfileTint(userId)` hash'inden, sunucu karosu sunucunun **kendi**
 * `Server.iconColor` tonundan gelir. İkisi de DTO'da hazır `tint` alanı olarak
 * geliyor; burada yalnız boyanıyor.
 *
 * Boş bölüm **hiç çizilmez** — `ORTAK SUNUCULAR 0` başlığı altında boşluk bırakmaz.
 */

const { profilePanel } = MESSAGES_METRICS;

/**
 * `PresenceDot` Ana Sayfa'nın büyük harfli durumunu bekler; DTO küçük harfli taşır.
 * (`messages-rail-row.tsx` aynı çeviriyi kendi satırı için yapıyor.)
 */
const DOT_PRESENCE: Readonly<Record<MessagesPresence, HomePresenceStatus>> = Object.freeze({
  dnd: "DND",
  idle: "IDLE",
  offline: "OFFLINE",
  online: "ONLINE",
});

/**
 * §15.3.5 dört satır çiziyor; uç beşinci kaydı fazlalığı **görebilmek** için döndürüyor
 * (Ş1: `MUTUAL_FRIEND_DEFAULT_LIMIT = 5`). Beşinci satır çizilmez, `ve {n} kişi daha`
 * satırına dönüşür ve `n` gerçek toplamdan gelir — önizleme uzunluğundan değil, yoksa
 * yedi ortak arkadaşı olan bir profil "ve 1 kişi daha" derdi.
 *
 * Sayı **sözlükten** okunuyor (Ş11): `profilePanel.mutualFriendPreviewLimit` Dalga 0'da zaten
 * açılmıştı ama şerit paralel koştuğu için burada ikinci bir kopya duruyordu — aynı sayının iki
 * evi, sözlük büyüdüğünde birinin sessizce geride kalması demekti. Ad dışa açık kalıyor: testi
 * ve `ve {n} kişi daha` satırı onu okuyor.
 */
export const MUTUAL_FRIEND_PREVIEW_LIMIT = MESSAGES_METRICS.profilePanel.mutualFriendPreviewLimit;

type MutualServer = UserProfilePanelDTO["mutualServers"][number];
type MutualFriend = UserProfilePanelDTO["mutualFriends"][number];

type SectionShellProps = {
  readonly children: React.ReactNode;
  readonly count?: string | undefined;
  readonly label: string;
  readonly testId: string;
};

function MutualSection({ children, count, label, testId }: SectionShellProps) {
  return (
    <section data-testid={testId}>
      <ProfileSectionLabel count={count}>{label}</ProfileSectionLabel>
      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(profilePanel.mutualRowGap),
          marginTop: pxToRem(profilePanel.sectionContentMarginTop),
        }}
      >
        {children}
      </div>
    </section>
  );
}

function SectionError({ testId }: { readonly testId: string }) {
  const { t } = useI18n();

  return (
    <p
      className="text-[hsl(var(--text-muted))]"
      data-testid={testId}
      style={{ fontSize: pxToRem(profilePanel.dateCardSubtitleFontSize) }}
    >
      {t("messages.profile.error.load")}
    </p>
  );
}

function RowSkeletons({ rows }: { readonly rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          className="rounded-xl"
          key={index}
          style={{
            height: pxToRem(
              profilePanel.mutualServerTileSize + profilePanel.mutualServerRowPaddingY * 2,
            ),
          }}
        />
      ))}
    </>
  );
}

const ROW_CLASS_NAME =
  "flex w-full min-w-0 items-center text-left outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

export type ProfileMutualServersProps = {
  readonly failed?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly servers: readonly MutualServer[];
};

export function ProfileMutualServers({
  failed = false,
  loading = false,
  servers,
}: ProfileMutualServersProps) {
  const { t } = useI18n();

  if (failed) {
    return <SectionError testId="profile-mutual-servers-error" />;
  }

  if (loading) {
    return (
      <MutualSection
        label={t("messages.profile.section.mutualServers")}
        testId="profile-mutual-servers"
      >
        <RowSkeletons rows={3} />
      </MutualSection>
    );
  }

  if (servers.length === 0) {
    return null;
  }

  return (
    <MutualSection
      count={String(servers.length)}
      label={t("messages.profile.section.mutualServers")}
      testId="profile-mutual-servers"
    >
      {servers.map((server) => (
        <Link
          className={ROW_CLASS_NAME}
          data-testid={`profile-mutual-server-${server.id}`}
          href={buildServerHref(server.id)}
          key={server.id}
          style={{
            borderRadius: pxToRem(profilePanel.mutualServerRowRadius),
            gap: pxToRem(profilePanel.mutualServerRowGap),
            padding: `${pxToRem(profilePanel.mutualServerRowPaddingY)} ${pxToRem(profilePanel.mutualServerRowPaddingX)}`,
          }}
        >
          <span
            aria-hidden="true"
            className={cn("grid shrink-0 place-items-center", DISPLAY_FONT)}
            style={{
              background: profileTintSurface(server.tint),
              borderRadius: pxToRem(profilePanel.mutualServerTileRadius),
              color: profileTintForeground(server.tint),
              fontSize: pxToRem(profilePanel.mutualServerTileFontSize),
              fontWeight: 600,
              height: pxToRem(profilePanel.mutualServerTileSize),
              lineHeight: 1,
              width: pxToRem(profilePanel.mutualServerTileSize),
            }}
          >
            {server.initials}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[hsl(var(--text-secondary))]"
            style={{
              fontSize: pxToRem(profilePanel.mutualServerNameFontSize),
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            {server.name}
          </span>
          <span
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{ fontSize: pxToRem(profilePanel.mutualServerCountFontSize) }}
          >
            {server.onlineCount}
            {/* Çıplak bir sayı ekran okuyucuya hiçbir şey söylemez. */}
            <span className="sr-only"> {t("messages.rail.presence.online")}</span>
          </span>
        </Link>
      ))}
    </MutualSection>
  );
}

export type ProfileMutualFriendsProps = {
  readonly failed?: boolean | undefined;
  readonly friends: readonly MutualFriend[];
  readonly loading?: boolean | undefined;
  /** Satır tıklanınca o kişinin sohbetini açar; bağlanmazsa satır yalnız okunur kalır. */
  readonly onSelect?: ((userId: string) => void) | undefined;
  /** Gerçek toplam — önizleme kırpılmışsa `ve {n} kişi daha` bundan üretilir. */
  readonly total: number;
};

export function ProfileMutualFriends({
  failed = false,
  friends,
  loading = false,
  onSelect,
  total,
}: ProfileMutualFriendsProps) {
  const { t } = useI18n();

  if (failed) {
    return <SectionError testId="profile-mutual-friends-error" />;
  }

  if (loading) {
    return (
      <MutualSection
        label={t("messages.profile.section.mutualFriends")}
        testId="profile-mutual-friends"
      >
        <RowSkeletons rows={4} />
      </MutualSection>
    );
  }

  if (friends.length === 0) {
    return null;
  }

  const visible = friends.slice(0, MUTUAL_FRIEND_PREVIEW_LIMIT);
  const remaining = Math.max(0, total - visible.length);

  return (
    <MutualSection
      count={String(Math.max(total, visible.length))}
      label={t("messages.profile.section.mutualFriends")}
      testId="profile-mutual-friends"
    >
      {visible.map((friend) => (
        <button
          className={ROW_CLASS_NAME}
          data-testid={`profile-mutual-friend-${friend.id}`}
          key={friend.id}
          onClick={onSelect ? () => onSelect(friend.id) : undefined}
          style={{
            borderRadius: pxToRem(profilePanel.mutualServerRowRadius),
            gap: pxToRem(profilePanel.mutualServerRowGap),
            padding: `${pxToRem(profilePanel.mutualFriendRowPaddingY)} ${pxToRem(profilePanel.mutualFriendRowPaddingX)}`,
          }}
          type="button"
        >
          <span className="relative shrink-0">
            <span
              aria-hidden="true"
              className={cn("grid place-items-center rounded-full", DISPLAY_FONT)}
              data-tint={friend.tint}
              style={{
                background: profileTintSurface(friend.tint),
                color: profileTintForeground(friend.tint),
                fontSize: pxToRem(profilePanel.mutualFriendTileFontSize),
                fontWeight: 600,
                height: pxToRem(profilePanel.mutualFriendTileSize),
                lineHeight: 1,
                width: pxToRem(profilePanel.mutualFriendTileSize),
              }}
            >
              {friend.initials}
            </span>
            <PresenceDot
              borderColor="hsl(var(--surface-panel))"
              borderWidth={profilePanel.mutualFriendDotBorderWidth}
              presence={DOT_PRESENCE[friend.presence]}
              size={profilePanel.mutualFriendDotSize}
            />
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[hsl(var(--text-secondary))]"
            style={{
              fontSize: pxToRem(profilePanel.mutualServerNameFontSize),
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            {friend.name}
          </span>
        </button>
      ))}

      {remaining === 0 ? null : (
        <p
          className="text-[hsl(var(--text-muted))]"
          data-testid="profile-mutual-friends-more"
          style={{
            fontSize: pxToRem(profilePanel.mutualServerCountFontSize),
            padding: `${pxToRem(profilePanel.mutualFriendRowPaddingY)} ${pxToRem(profilePanel.mutualFriendRowPaddingX)}`,
          }}
        >
          {t("messages.profile.a11y.mutualFriendMore", { count: remaining })}
        </p>
      )}
    </MutualSection>
  );
}

export type ProfileMutualListsProps = ProfileMutualServersProps &
  Omit<ProfileMutualFriendsProps, "failed" | "loading">;
