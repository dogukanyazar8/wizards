"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Hash } from "lucide-react";
import { formatServerProfileCount, type DiscoverServerCategoryKey } from "@wizards/types";
import type { ServerPublicProfile } from "@wizards/types";

import { getDiscoverCategoryTone } from "@/components/discover/discover-category-tile";
import { ServerProfileMutualRow } from "@/components/discover/server-profile-mutual-row";
import { ServerProfileStat } from "@/components/discover/server-profile-stat";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { useToast } from "@/hooks/use-toast";
import { DISCOVER_METRICS, hairline, pxToRem } from "@/lib/discover/metrics";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";
import { resolveServerAbbreviation } from "@/lib/servers/server-icon-presentation";

export type ServerProfilePanelProps = {
  readonly currentUserId: string;
  readonly isError: boolean;
  readonly isLoading: boolean;
  readonly isMembershipPending: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
  readonly onRequestClose: () => void;
  readonly onRetry: () => void;
  readonly panelServerId: string;
  readonly placeholderCategory: DiscoverServerCategoryKey | null;
  readonly placeholderInitials: string;
  readonly placeholderName: string;
  readonly profile: ServerPublicProfile | undefined;
};

export type ServerProfilePanelKeyEvent = {
  readonly key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export type ServerProfileClipboard = {
  readonly writeText: (value: string) => Promise<void>;
};

export async function copyServerInviteAddress(
  inviteAddress: string,
  clipboard: ServerProfileClipboard | undefined,
): Promise<boolean> {
  if (!clipboard) {
    return false;
  }

  try {
    await clipboard.writeText(inviteAddress);
    return true;
  } catch {
    return false;
  }
}

export function handleServerProfilePanelKeyDown(
  event: ServerProfilePanelKeyEvent,
  onRequestClose: () => void,
): boolean {
  if (event.key !== "Escape") {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  onRequestClose();
  return true;
}

function SectionHeading({ count, label }: { readonly count: number; readonly label: string }) {
  return (
    <div className="flex items-center" style={{ gap: pxToRem(8), paddingBottom: pxToRem(10) }}>
      <span
        className="uppercase text-[hsl(var(--text-muted))]"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(10.5),
          fontWeight: 600,
          letterSpacing: "0.15em",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <span
        className="text-[hsl(var(--text-muted)/0.75)]"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(10.5),
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function ServerProfilePanelSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex flex-1 flex-col"
      data-testid="server-profile-panel-skeleton"
      style={{ gap: pxToRem(14), padding: `${pxToRem(15)} ${pxToRem(16)}` }}
    >
      <div className="flex items-center" style={{ gap: pxToRem(13), padding: pxToRem(15) }}>
        <Skeleton style={{ borderRadius: pxToRem(17), height: pxToRem(54), width: pxToRem(54) }} />
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: pxToRem(8) }}>
          <Skeleton style={{ height: pxToRem(16.5), width: "72%" }} />
          <Skeleton style={{ height: pxToRem(11.5), width: "48%" }} />
        </div>
      </div>
      <div className="grid grid-cols-3" style={{ gap: pxToRem(8) }}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} style={{ borderRadius: pxToRem(14), height: pxToRem(58) }} />
        ))}
      </div>
      <Skeleton style={{ borderRadius: pxToRem(12), height: pxToRem(122) }} />
    </div>
  );
}

function ProfileSummary({
  initials,
  profile,
}: {
  readonly initials: string;
  readonly profile: ServerPublicProfile;
}) {
  const { locale, t } = useI18n();
  const tone = getDiscoverCategoryTone(profile.category);
  const iconTone = profile.iconColor ?? tone;
  const onlineCount = formatServerProfileCount(profile.onlineCount, locale);
  const memberCount = formatServerProfileCount(profile.memberCount, locale);

  return (
    <section
      className="flex flex-col"
      data-testid="server-profile-summary"
      data-tone={tone}
      style={{
        background: `hsl(var(--${tone})/0.07)`,
        border: `${hairline()} solid hsl(var(--${tone})/0.3)`,
        borderRadius: pxToRem(18),
        gap: pxToRem(13),
        padding: pxToRem(15),
      }}
    >
      <div className="flex min-w-0 items-center" style={{ gap: pxToRem(13) }}>
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center"
          data-testid="server-profile-tile"
          style={{
            background: profile.iconUrl
              ? `center / cover no-repeat url(${JSON.stringify(profile.iconUrl)})`
              : getServerIconToneColor(iconTone, 0.14),
            borderRadius: pxToRem(17),
            color: profile.iconUrl
              ? "transparent"
              : `color-mix(in srgb, ${getServerIconToneColor(iconTone)} 45%, hsl(var(--foreground)))`,
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(19),
            fontWeight: 600,
            height: pxToRem(54),
            lineHeight: 1,
            width: pxToRem(54),
          }}
        >
          {profile.iconUrl ? "" : initials}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[hsl(var(--foreground))]"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(16.5),
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            {profile.name}
          </h2>
          <div
            className="flex min-w-0 items-center"
            style={{ gap: pxToRem(8), marginTop: pxToRem(6) }}
          >
            <span
              className="flex shrink-0 items-center text-[var(--success-readable)]"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: pxToRem(11.5),
                fontWeight: 600,
                gap: pxToRem(5),
                lineHeight: 1,
              }}
            >
              <span
                aria-hidden="true"
                className="rounded-full bg-[hsl(var(--success))]"
                style={{ height: pxToRem(6), width: pxToRem(6) }}
              />
              {t("discover.card.online", { count: onlineCount })}
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full bg-[hsl(var(--border))]"
              style={{ height: pxToRem(3), width: pxToRem(3) }}
            />
            <span
              className="truncate text-[hsl(var(--text-muted))]"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: pxToRem(11.5),
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {t("discover.card.members", { count: memberCount })}
            </span>
          </div>
        </div>
      </div>
      <p
        className="m-0 text-pretty text-[hsl(var(--text-secondary))]"
        style={{ fontSize: pxToRem(12.5), lineHeight: 1.6 }}
      >
        {profile.description}
      </p>
      {profile.tags.length > 0 ? (
        <div className="flex flex-wrap" style={{ gap: pxToRem(6) }}>
          {profile.tags.map((tag) => (
            <span
              className="whitespace-nowrap text-[hsl(var(--text-secondary))]"
              key={tag}
              style={{
                background: "hsl(var(--surface-card))",
                border: `${hairline()} solid hsl(var(--border)/0.6)`,
                borderRadius: "999px",
                fontSize: pxToRem(10.5),
                fontWeight: 600,
                lineHeight: 1,
                padding: `${pxToRem(4)} ${pxToRem(10)}`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ServerProfilePanel({
  currentUserId,
  isError,
  isLoading,
  isMembershipPending,
  onJoin,
  onLeave,
  onRequestClose,
  onRetry,
  panelServerId,
  placeholderCategory,
  placeholderInitials,
  placeholderName,
  profile,
}: ServerProfilePanelProps) {
  const { locale, t } = useI18n();
  const { show } = useToast();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const category = profile ? profile.category : placeholderCategory;
  const tone = getDiscoverCategoryTone(category);
  const name = profile?.name ?? placeholderName;
  const initials = profile
    ? resolveServerAbbreviation(profile.name, profile.shortName)
    : placeholderInitials;
  // TODO(api): Public profile contract still permits private channels. Keep the trust boundary
  // client-side until the endpoint guarantees public-only rows.
  const visibleChannels = useMemo(
    () => profile?.channels.filter((channel) => !channel.isPrivate) ?? [],
    [profile],
  );
  const moreChannelCount = profile ? Math.max(0, profile.channelCount - visibleChannels.length) : 0;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const share = async () => {
    if (!profile?.inviteAddress) {
      return;
    }

    const copied = await copyServerInviteAddress(
      profile.inviteAddress,
      typeof navigator === "undefined" ? undefined : navigator.clipboard,
    );
    show({
      message: t(copied ? "common.linkCopied" : "discover.profile.shareError"),
      tone: copied ? "default" : "danger",
    });
  };

  return (
    <aside
      aria-label={`${t("discover.profile.label")}: ${name}`}
      className="flex h-full min-h-0 shrink-0 flex-col bg-[hsl(var(--surface-panel))]"
      data-testid="server-profile-panel"
      onKeyDown={(event) => handleServerProfilePanelKeyDown(event, onRequestClose)}
      role="complementary"
      style={{
        borderLeft: `${hairline()} solid hsl(var(--border)/0.45)`,
        width: pxToRem(DISCOVER_METRICS.columns.panel),
      }}
    >
      <header
        className="flex shrink-0 items-center"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
          gap: pxToRem(10),
          padding: `${pxToRem(15)} ${pxToRem(16)} ${pxToRem(13)}`,
        }}
      >
        <span
          className="uppercase text-[hsl(var(--text-muted))]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(10.5),
            fontWeight: 600,
            letterSpacing: "0.15em",
            lineHeight: 1,
          }}
        >
          {t("discover.profile.label")}
        </span>
        {category !== null ? (
          <span
            className="whitespace-nowrap"
            data-testid="server-profile-category"
            style={{
              background: `hsl(var(--${tone})/0.14)`,
              borderRadius: "999px",
              color: `color-mix(in srgb, hsl(var(--${tone})) 45%, hsl(var(--foreground)))`,
              fontFamily: "var(--font-sans)",
              fontSize: pxToRem(10),
              fontWeight: 600,
              lineHeight: 1,
              padding: `${pxToRem(3)} ${pxToRem(8)}`,
            }}
          >
            {t(`discover.category.${category}`)}
          </span>
        ) : null}
        <WindowCloseButton
          aria-label={t("discover.profile.close")}
          className="relative ml-auto before:absolute before:-inset-2 before:content-['']"
          onClick={onRequestClose}
          ref={closeButtonRef}
        />
      </header>

      {isLoading && !isError && !profile ? (
        <ServerProfilePanelSkeleton />
      ) : !profile ? (
        <div
          className="flex flex-1 flex-col items-center justify-center text-center"
          role="alert"
          style={{ gap: pxToRem(10), padding: pxToRem(24) }}
        >
          <p className="font-semibold text-[hsl(var(--foreground))]">
            {t("discover.profile.loadError")}
          </p>
          <button
            className="bg-[hsl(var(--primary))] font-semibold text-white"
            onClick={onRetry}
            style={{
              border: 0,
              borderRadius: pxToRem(11),
              height: pxToRem(34),
              paddingInline: pxToRem(14),
            }}
            type="button"
          >
            {t("discover.error.retry")}
          </button>
        </div>
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          style={{ gap: pxToRem(14), padding: `${pxToRem(15)} ${pxToRem(16)}` }}
        >
          <ProfileSummary initials={initials} profile={profile} />

          <section
            aria-label={t("discover.profile.label")}
            className="grid grid-cols-3"
            style={{ gap: pxToRem(8) }}
          >
            <ServerProfileStat
              ariaLabel={`${profile.channelCount} ${t("discover.profile.stats.channels").toLocaleLowerCase(locale)}`}
              label={t("discover.profile.stats.channels")}
              testId="server-profile-stat-channels"
              tone="primary"
              value={profile.channelCount}
            />
            <ServerProfileStat
              ariaLabel={`${profile.voiceRoomCount} ${t("discover.profile.stats.voiceRooms").toLocaleLowerCase(locale)}`}
              label={t("discover.profile.stats.voiceRooms")}
              testId="server-profile-stat-voice-rooms"
              tone="success"
              value={profile.voiceRoomCount}
            />
            <ServerProfileStat
              ariaLabel={`${new Date(profile.createdAt).getUTCFullYear()} ${t("discover.profile.stats.founded").toLocaleLowerCase(locale)}`}
              label={t("discover.profile.stats.founded")}
              testId="server-profile-stat-founded"
              tone="warning"
              value={new Date(profile.createdAt).getUTCFullYear()}
            />
          </section>

          <section>
            <SectionHeading count={profile.channelCount} label={t("discover.profile.channels")} />
            <div className="flex flex-col" style={{ gap: pxToRem(2) }}>
              {visibleChannels.map((channel) => (
                <div
                  className="flex min-w-0 items-center transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)]"
                  key={channel.id}
                  style={{
                    borderRadius: pxToRem(11),
                    gap: pxToRem(10),
                    padding: `${pxToRem(8)} ${pxToRem(9)}`,
                  }}
                >
                  <Hash
                    aria-hidden="true"
                    className="shrink-0 text-[hsl(var(--text-muted))]"
                    style={{ height: pxToRem(14), width: pxToRem(14) }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[hsl(var(--text-secondary))]"
                    style={{ fontSize: pxToRem(12.5), fontWeight: 500, lineHeight: 1.3 }}
                  >
                    {channel.name}
                  </span>
                  {channel.liveCount !== null ? (
                    <span
                      className="shrink-0 text-[hsl(var(--text-muted))]"
                      style={{ fontSize: pxToRem(11), fontWeight: 500, lineHeight: 1 }}
                    >
                      {channel.liveCount}
                    </span>
                  ) : null}
                </div>
              ))}
              {profile.hasMoreChannels && moreChannelCount > 0 ? (
                <div
                  className="text-[hsl(var(--text-muted))]"
                  style={{
                    fontSize: pxToRem(11.5),
                    fontWeight: 500,
                    padding: `${pxToRem(8)} ${pxToRem(9)}`,
                  }}
                >
                  {t("discover.profile.moreChannels", { count: moreChannelCount })}
                </div>
              ) : null}
            </div>
          </section>

          {profile.mutualFriends.length > 0 ? (
            <section>
              <SectionHeading
                count={profile.mutualFriendCount}
                label={t("discover.profile.mutuals")}
              />
              <div className="flex flex-col" style={{ gap: pxToRem(2) }}>
                {profile.mutualFriends.map((friend) => (
                  <ServerProfileMutualRow
                    currentUserId={currentUserId}
                    friend={friend}
                    key={friend.id}
                    serverId={panelServerId}
                  />
                ))}
              </div>
              <p
                className="text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(11.5),
                  fontWeight: 500,
                  lineHeight: 1.4,
                  marginTop: pxToRem(9),
                }}
              >
                {t("discover.profile.mutuals.note")}
              </p>
            </section>
          ) : null}
        </div>
      )}

      <footer
        className="flex shrink-0 items-center"
        style={{
          borderTop: `${hairline()} solid hsl(var(--border)/0.5)`,
          gap: pxToRem(8),
          padding: `${pxToRem(13)} ${pxToRem(16)}`,
        }}
      >
        <button
          className="flex-1 font-semibold disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!profile || isMembershipPending}
          onClick={profile?.joined ? onLeave : onJoin}
          style={{
            background: profile?.joined ? "hsl(var(--surface-tertiary))" : "hsl(var(--primary))",
            border: 0,
            borderRadius: pxToRem(11),
            color: profile?.joined ? "hsl(var(--text-secondary))" : "white",
            fontSize: pxToRem(12.5),
            height: pxToRem(36),
          }}
          type="button"
        >
          {t(profile?.joined ? "discover.profile.leave" : "discover.profile.join")}
        </button>
        <button
          className="shrink-0 font-semibold text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-55"
          data-testid="server-profile-share"
          disabled={!profile?.inviteAddress}
          onClick={() => void share()}
          style={{
            background: "hsl(var(--surface-card))",
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(11),
            fontSize: pxToRem(12.5),
            height: pxToRem(36),
            paddingInline: pxToRem(13),
          }}
          title={!profile?.inviteAddress ? t("discover.profile.shareUnavailable") : undefined}
          type="button"
        >
          {t("discover.profile.share")}
        </button>
      </footer>
    </aside>
  );
}
