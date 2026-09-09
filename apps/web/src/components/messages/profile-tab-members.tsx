"use client";

import React from "react";
import { UserPlus } from "lucide-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConversationToast,
  DMParticipantRole,
  GroupMemberPage,
  GroupMemberRowDTO,
  GroupPermissionLevel,
  MessagesPresence,
} from "@wizards/types";

import { DISPLAY_FONT, PresenceDot } from "@/components/home/home-primitives";
import { formatSharedTimestamp } from "@/components/messages/profile-file-row";
import { ProfileInviteLinkCard } from "@/components/messages/profile-invite-link-card";
import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { setGroupInviteEnabledRequest } from "@/lib/dm/client";
import {
  fetchGroupMembersPage,
  fetchGroupProfilePanel,
  groupProfileQueryKeys,
} from "@/lib/dm/group-profile-client";
import type { HomePresenceStatus } from "@/lib/home/presentation";
import { hairline, MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { profileTintForeground, profileTintSurface } from "@/lib/messages/profile-tint";
import { cn } from "@/lib/utils";

/**
 * SPEC-MESAJLAR §15.4 — the `Üyeler` tab. Group only. `Mesajlar.dc.html` `L1097–L1128`.
 *
 * The tab fetches its **own** data; nothing is handed down from the panel. That is what
 * makes kural 7's lazy tab real: the body is mounted when the tab is chosen, so the two
 * queries below are born at that moment and not when the panel opens on `Genel`.
 *
 * Both queries sit on the keys Ş2 published, which is why opening this tab costs at most
 * one request: `groupProfileQueryKeys.panel` is the key Ş5's identity block already
 * populated, and React Query serves it from cache.
 */

const { profilePanel } = MESSAGES_METRICS;

/** How many placeholder rows the roster reserves while its first page is in flight. */
const MEMBER_SKELETON_ROWS = 5;

/** `PresenceDot` speaks the Ana Sayfa casing; the DTO speaks the Mesajlar one. */
const DOT_PRESENCE: Readonly<Record<MessagesPresence, HomePresenceStatus>> = Object.freeze({
  dnd: "DND",
  idle: "IDLE",
  offline: "OFFLINE",
  online: "ONLINE",
});

const PRESENCE_LABEL_KEY: Readonly<Record<MessagesPresence, string>> = Object.freeze({
  dnd: "home.presence.dnd",
  idle: "home.presence.idle",
  offline: "home.friends.offline",
  online: "home.presence.online",
});

/**
 * The prop shape Ş5's panel calls both tab bodies with. Exported from here and
 * re-exported by `profile-tab-media.tsx` so the two tabs cannot drift apart.
 */
export type ProfileTabProps = {
  conversationId: string;
  onToast?: ((toast: ConversationToast) => void) | undefined;
  variant: "dm" | "group";
};

export type ProfileTabMembersProps = ProfileTabProps & {
  /** Injected so `Çevrimdışı · dün 22:10` is decidable in a test. */
  now?: Date | undefined;
  /** Opens Dalga 3 Ş10's modal. Absent → the button is not drawn. */
  onAddMembers?: (() => void) | undefined;
  /** Switches the panel to that person's profile. Absent → rows are not interactive. */
  onSelectMember?: ((userId: string) => void) | undefined;
};

/**
 * §15.4's permission gate.
 *
 * The server refuses either way, so this is not a security boundary — it is an honesty
 * one. A member looking at an `ADMINS` group is not "temporarily unable" to add someone;
 * they cannot, and a button (even a greyed one) says otherwise.
 */
export function canAddMembers(
  addPolicy: GroupPermissionLevel,
  viewerRole: DMParticipantRole,
): boolean {
  return addPolicy === "ALL" || viewerRole !== "MEMBER";
}

export type ProfileMemberGroup = {
  /**
   * `null` while the number is not yet knowable — printed as no counter rather than as a
   * wrong one.
   */
  count: number | null;
  key: "admins" | "members";
  rows: readonly GroupMemberRowDTO[];
};

/**
 * §15.4's `YÖNETİCİ 2` / `ÜYE 3` split.
 *
 * The endpoint returns a flat, tier-then-name ordered list (Ş2 §6); the two headings are a
 * rendering decision, so the split happens here rather than in a second query.
 *
 * The counters are the subtle part. `GroupMemberPage.total` is the whole roster, not a
 * per-tier figure, so:
 *
 * - once a `MEMBER` row has been seen (or the list is fully loaded) every admin is loaded,
 *   because admins sort first — the admin counter is then exact;
 * - and the member counter is `total - admins`, which stays exact through paging, where
 *   counting the loaded member rows would under-report on every page but the last;
 * - before that point neither number is known, and both are omitted.
 */
export function groupProfileMembers(
  rows: readonly GroupMemberRowDTO[],
  total: number,
  hasMore: boolean,
): readonly ProfileMemberGroup[] {
  const admins = rows.filter((row) => row.role !== "MEMBER");
  const members = rows.filter((row) => row.role === "MEMBER");
  const adminsComplete = !hasMore || members.length > 0;

  return [
    {
      count: adminsComplete ? admins.length : null,
      key: "admins" as const,
      rows: admins,
    },
    {
      count: adminsComplete ? Math.max(members.length, total - admins.length) : null,
      key: "members" as const,
      rows: members,
    },
  ].filter((group) => group.rows.length > 0);
}

export type MemberStatusLabels = {
  dnd: string;
  idle: string;
  offline: string;
  online: string;
  today: string;
  yesterday: string;
};

/**
 * The row's second line: `Odak modu · 25 dk` · `Rahatsız etmeyin` · `Çevrimdışı · dün 22:10`.
 *
 * `statusText` is the person's **own** sentence and wins outright — it is not translated
 * and not decorated. Everything else is built here rather than on the server (Ş2 §5.5):
 * the server ships `presence` and a raw `lastSeenAt`, and the sentence around them belongs
 * to the reader's language and time zone.
 */
export function formatMemberStatus(
  member: Pick<GroupMemberRowDTO, "lastSeenAt" | "presence" | "statusText">,
  now: Date,
  locale: string,
  labels: MemberStatusLabels,
): string {
  if (member.statusText) {
    return member.statusText;
  }

  if (member.presence !== "offline") {
    return labels[member.presence];
  }

  if (!member.lastSeenAt) {
    return labels.offline;
  }

  const when = formatSharedTimestamp(member.lastSeenAt, now, locale, {
    today: labels.today,
    yesterday: labels.yesterday,
  });

  return when ? `${labels.offline} · ${when}` : labels.offline;
}

export function ProfileTabMembers(props: ProfileTabMembersProps): React.JSX.Element {
  // Deliberately before any hook: the DM panel has no `Üyeler` tab, and returning early
  // here is what guarantees the roster query is never even registered on a 1:1 thread.
  if (props.variant !== "group") {
    return <></>;
  }

  return <GroupMembersTab {...props} />;
}

function GroupMembersTab({
  conversationId,
  now,
  onAddMembers,
  onSelectMember,
  onToast,
}: ProfileTabMembersProps): React.JSX.Element {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const at = now ?? new Date();

  const panelQuery = useQuery({
    queryFn: () => fetchGroupProfilePanel(conversationId),
    queryKey: [...groupProfileQueryKeys.panel(conversationId)],
  });

  const rosterQuery = useInfiniteQuery({
    getNextPageParam: (last: GroupMemberPage) => last.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchGroupMembersPage(conversationId, pageParam),
    queryKey: [...groupProfileQueryKeys.members(conversationId)],
  });

  const createInvite = useMutation({
    mutationFn: () => setGroupInviteEnabledRequest(conversationId, true),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...groupProfileQueryKeys.panel(conversationId)],
      });
    },
  });

  const panel = panelQuery.data;
  const pages = rosterQuery.data?.pages ?? [];
  const rows = pages.flatMap((page) => page.items);
  // Ş3 and Ş2 both warn about this: a page can come back short. "More" is decided by the
  // cursor the endpoint answered with, never by how many rows this page happened to carry.
  const hasMore = rosterQuery.hasNextPage;
  const total = pages[0]?.total ?? rows.length;
  const groups = groupProfileMembers(rows, total, hasMore);
  const statusLabels: MemberStatusLabels = {
    dnd: t(PRESENCE_LABEL_KEY.dnd),
    idle: t(PRESENCE_LABEL_KEY.idle),
    offline: t(PRESENCE_LABEL_KEY.offline),
    online: t(PRESENCE_LABEL_KEY.online),
    today: t("home.upNext.today"),
    yesterday: t("home.time.yesterday"),
  };

  return (
    <>
      {panelQuery.isPending ? (
        <div data-testid="profile-members-header-skeleton">
          <Skeleton
            style={{
              borderRadius: pxToRem(profilePanel.memberAddButtonRadius),
              height: pxToRem(profilePanel.memberAddButtonHeight),
            }}
          />
        </div>
      ) : null}

      {/*
        Gated on the **permission**, not on whether a handler was wired. Those are two
        different failures: a member of an `ADMINS` group genuinely cannot add anyone and
        must not see the control, while a host that forgot to forward `onAddMembers` has a
        build defect — and silently deleting the tab's primary action would hide it instead
        of surfacing it. See raporlar/09-rapor.md for the two lines Ş5 owes this prop.
      */}
      {panel && canAddMembers(panel.addPolicy, panel.viewerRole) ? (
        <button
          className="flex items-center justify-center border-dashed border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] outline-hidden transition-colors hover:bg-[hsl(var(--primary)/0.16)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="profile-members-add"
          onClick={() => onAddMembers?.()}
          style={{
            borderRadius: pxToRem(profilePanel.memberAddButtonRadius),
            borderWidth: hairline(),
            fontSize: pxToRem(profilePanel.memberAddButtonFontSize),
            fontWeight: 600,
            gap: pxToRem(profilePanel.memberAddButtonGap),
            height: pxToRem(profilePanel.memberAddButtonHeight),
            lineHeight: 1,
          }}
          type="button"
        >
          <UserPlus
            aria-hidden="true"
            style={{
              height: pxToRem(profilePanel.memberAddButtonIconSize),
              width: pxToRem(profilePanel.memberAddButtonIconSize),
            }}
          />
          {t("messages.profile.members.addButton")}
        </button>
      ) : null}

      {panel ? (
        <ProfileInviteLinkCard
          addPolicy={panel.addPolicy}
          creating={createInvite.isPending}
          invite={panel.invite}
          now={at}
          onCreate={() => createInvite.mutate()}
          onToast={onToast}
          viewerRole={panel.viewerRole}
        />
      ) : null}

      {rosterQuery.isPending ? (
        <div data-testid="profile-members-skeleton">
          <ProfileSectionLabel>{t("messages.profile.section.members")}</ProfileSectionLabel>
          <div
            className="flex flex-col"
            style={{
              gap: pxToRem(profilePanel.memberRowGap),
              marginTop: pxToRem(profilePanel.sectionContentMarginTop),
            }}
          >
            {Array.from({ length: MEMBER_SKELETON_ROWS }, (_unused, index) => (
              <Skeleton
                key={index}
                style={{
                  borderRadius: pxToRem(profilePanel.memberRowRadius),
                  height: pxToRem(profilePanel.memberAvatarSize),
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {rosterQuery.isError ? (
        <p
          className="text-[hsl(var(--text-muted))]"
          data-testid="profile-members-error"
          style={{ fontSize: pxToRem(profilePanel.memberStatusFontSize) }}
        >
          {t("messages.profile.error.load")}
        </p>
      ) : null}

      {groups.map((group) => (
        <div data-testid={`profile-members-group-${group.key}`} key={group.key}>
          <ProfileSectionLabel {...(group.count === null ? {} : { count: String(group.count) })}>
            {t(
              group.key === "admins"
                ? "messages.profile.section.admins"
                : "messages.profile.section.members",
            )}
          </ProfileSectionLabel>
          <div
            className="flex flex-col"
            style={{
              gap: pxToRem(profilePanel.memberRowGap),
              marginTop: pxToRem(profilePanel.sectionContentMarginTop),
            }}
          >
            {group.rows.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                status={formatMemberStatus(member, at, locale, statusLabels)}
                {...(onSelectMember ? { onSelect: onSelectMember } : {})}
              />
            ))}
          </div>
        </div>
      ))}

      {hasMore ? (
        <button
          className="text-[hsl(var(--primary))] outline-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
          data-testid="profile-members-more"
          disabled={rosterQuery.isFetchingNextPage}
          onClick={() => void rosterQuery.fetchNextPage()}
          style={{
            borderRadius: pxToRem(profilePanel.memberRowRadius),
            fontSize: pxToRem(profilePanel.memberNameFontSize),
            fontWeight: 600,
            height: pxToRem(profilePanel.memberAddButtonHeight),
          }}
          type="button"
        >
          {t("messages.friends.action.more")}
        </button>
      ) : null}
    </>
  );
}

type MemberRowProps = {
  member: GroupMemberRowDTO;
  onSelect?: ((userId: string) => void) | undefined;
  status: string;
};

function MemberRow({ member, onSelect, status }: MemberRowProps) {
  const { t } = useI18n();
  const body = (
    <>
      <span className="relative shrink-0">
        <span
          aria-hidden="true"
          className={cn("grid place-items-center rounded-full", DISPLAY_FONT)}
          style={{
            background: profileTintSurface(member.tint),
            color: profileTintForeground(member.tint),
            fontSize: pxToRem(profilePanel.memberAvatarFontSize),
            fontWeight: 600,
            height: pxToRem(profilePanel.memberAvatarSize),
            width: pxToRem(profilePanel.memberAvatarSize),
          }}
        >
          {member.initials}
        </span>
        {/* The dot carries an `sr-only` sentence: colour is never the only carrier. */}
        <PresenceDot
          borderColor="hsl(var(--surface-panel))"
          borderWidth={profilePanel.memberPresenceDotBorderWidth}
          presence={DOT_PRESENCE[member.presence]}
          size={profilePanel.memberPresenceDotSize}
        />
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center" style={{ gap: pxToRem(profilePanel.memberNameGap) }}>
          <span
            className="truncate text-[hsl(var(--foreground))]"
            style={{
              fontSize: pxToRem(profilePanel.memberNameFontSize),
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            {member.name}
          </span>
          {member.isSelf ? (
            <span
              className="shrink-0 rounded-full bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
              data-testid="profile-member-self"
              style={{
                fontSize: pxToRem(profilePanel.memberSelfPillFontSize),
                fontWeight: 600,
                lineHeight: 1.3,
                padding: `${pxToRem(profilePanel.memberSelfPillPaddingY)} ${pxToRem(
                  profilePanel.memberSelfPillPaddingX,
                )}`,
              }}
            >
              {t("messages.profile.members.selfPill")}
            </span>
          ) : null}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          data-testid="profile-member-status"
          style={{
            fontSize: pxToRem(profilePanel.memberStatusFontSize),
            marginTop: pxToRem(profilePanel.memberStatusMarginTop),
          }}
        >
          {status}
        </span>
      </span>
    </>
  );
  const style: React.CSSProperties = {
    borderRadius: pxToRem(profilePanel.memberRowRadius),
    gap: pxToRem(profilePanel.memberRowGapInner),
    padding: `${pxToRem(profilePanel.memberRowPaddingY)} ${pxToRem(profilePanel.memberRowPaddingX)}`,
  };

  /*
    A row is a `button` only when there is somewhere to go. Rendering one unconditionally
    would put a focus stop on every member that answers no key press — the same lie the
    `Üye ekle` gate above refuses to tell.
  */
  if (!onSelect) {
    return (
      <div className="flex min-w-0 items-center" data-testid="profile-member-row" style={style}>
        {body}
      </div>
    );
  }

  return (
    <button
      className="flex min-w-0 items-center outline-hidden transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-testid="profile-member-row"
      onClick={() => onSelect(member.userId)}
      style={style}
      type="button"
    >
      {body}
    </button>
  );
}
