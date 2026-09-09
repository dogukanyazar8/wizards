"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import type {
  ServerBanEntry,
  WorkspaceMember,
  WorkspaceMemberFilter,
  WorkspaceRole,
} from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { OptionChipGroup } from "@/components/servers/shared/option-chip-group";
import { ToggleRow } from "@/components/servers/shared/toggle-row";
import { ServerModalShell } from "@/components/servers/modals/server-modal-shell";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import {
  ChipRadioGroup,
  CollapsibleEmpty,
  CollapsibleList,
} from "@/components/shell/server-settings/section-parts";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  type MemberModerationActionId,
  type ServerBanDeleteWindowId,
  type ServerTimeoutDurationId,
  SERVER_BAN_DELETE_WINDOWS,
  SERVER_MEMBER_FILTERS,
  SERVER_MODERATION_REASON_MAX_LENGTH,
  SERVER_TIMEOUT_DURATIONS,
  formatTimeoutRemaining,
  listMemberModerationActions,
  resolveTimeoutUntil,
  selectBanDeleteWindow,
  selectMemberTypeBadge,
  selectPrimaryRoleName,
  selectTimeoutDuration,
} from "@/lib/servers/member-moderation";
import { useLayerStack } from "@/lib/servers/use-layer-stack";
import { viewerCan } from "@/lib/servers/viewer-permissions";
import {
  banServerMember,
  fetchServerBans,
  fetchWorkspaceServerMembers,
  kickMemberRequest,
  timeoutServerMember,
  unbanServerMember,
  updateWorkspaceMemberRolesRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

/**
 * `Sunucu ayarları › Üyeler ve Moderasyon` — SPEC-SUNUCU §8.6 + **K3**.
 *
 * Süzme **sunucu tarafında**: yedi çip ve arama kutusu Ş2'nin `q` + `filter` parametrelerine
 * gider ve `N / M üye` sayacı yanıtın `memberCounts` alanından okunur. İstemcide süzmek sayacı
 * yalan söyletirdi — sayfa boyu 100'de kesiliyor ve 101. üyeden sonra "sayfadaki satırları say"
 * başka bir sayı verir (Ş2 §3.1).
 *
 * K3 üç yüzey ekliyor ve üçünün de ucu Ş2'de hazır: zaman aşımı ver/kaldır, sunucudan yasakla
 * (sebep + mesaj silme penceresi) ve `Yasaklılar (N)` katlanır listesi. SPEC'in
 * "bir sonraki fazda eklenecek" bilgi notu **kaldırıldı**.
 */

const SEARCH_ICON_PATH = "m20 20-3.6-3.6M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z";
const CHEVRON_PATH = "m6 9 6 6 6-6";
const PLUS_PATH = "M12 5v14M5 12h14";
const KICK_PATH =
  "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17 8l4 4m0-4-4 4";
const MORE_PATH = "M12 6.01V6M12 12.01V12M12 18.01V18";
const BAN_ICON_PATH = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8";
const CHECK_PATH = "M4 12.5 9 17.5 20 6.5";

function initials(value: string): string {
  const token = value.trim();

  return token.length === 0 ? "??" : token.slice(0, 2).toLocaleUpperCase("tr");
}

type MemberBadgeTone = { readonly background: string; readonly color: string };

function badgeTone(badge: "owner" | "admin" | "member"): MemberBadgeTone {
  if (badge === "owner") {
    return { background: "hsl(var(--primary)/0.14)", color: "hsl(var(--primary))" };
  }

  if (badge === "admin") {
    return { background: "hsl(var(--danger)/0.14)", color: "hsl(var(--danger))" };
  }

  return { background: "hsl(var(--surface-tertiary))", color: "hsl(var(--text-muted))" };
}

export type MembersSectionViewProps = {
  readonly allowMemberAdds: boolean;
  readonly bans: readonly ServerBanEntry[];
  readonly bansExpanded: boolean;
  readonly canManageServer: boolean;
  readonly counts: { readonly filtered: number; readonly total: number };
  readonly canAssignRoles: boolean;
  readonly filter: WorkspaceMemberFilter;
  readonly members: readonly WorkspaceMember[];
  readonly moderationActions: (member: WorkspaceMember) => readonly MemberModerationActionId[];
  readonly nowMs: number;
  readonly onBan: (member: WorkspaceMember) => void;
  readonly onFilterChange: (filter: WorkspaceMemberFilter) => void;
  readonly onKick: (member: WorkspaceMember) => void;
  readonly onQueryChange: (value: string) => void;
  readonly onRemoveTimeout: (member: WorkspaceMember) => void;
  readonly onToggleAllowMemberAdds: (next: boolean) => void;
  readonly onToggleBans: () => void;
  readonly onToggleMenu: (memberId: string | null) => void;
  readonly onToggleRole: (member: WorkspaceMember, roleId: string) => void;
  readonly onToggleRoleMenu: (memberId: string | null) => void;
  readonly onTimeout: (member: WorkspaceMember, id: ServerTimeoutDurationId) => void;
  readonly onUnban: (entry: ServerBanEntry) => void;
  readonly openMenuMemberId: string | null;
  readonly openRoleMenuMemberId: string | null;
  readonly query: string;
  readonly roles: readonly WorkspaceRole[];
};

export function MembersSectionView({
  allowMemberAdds,
  bans,
  bansExpanded,
  canAssignRoles,
  canManageServer,
  counts,
  filter,
  members,
  moderationActions,
  nowMs,
  onBan,
  onFilterChange,
  onKick,
  onQueryChange,
  onRemoveTimeout,
  onTimeout,
  onToggleAllowMemberAdds,
  onToggleBans,
  onToggleMenu,
  onToggleRole,
  onToggleRoleMenu,
  onUnban,
  openMenuMemberId,
  openRoleMenuMemberId,
  query,
  roles,
}: MembersSectionViewProps) {
  const { locale, t } = useI18n();
  const { settingsSections, sidebar } = SERVER_METRICS;
  const searchId = useId();
  const assignableRoles = roles.filter((role) => !role.isDefault && !role.managed);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div data-testid="server-settings-members">
      <div
        className="flex flex-wrap items-center"
        style={{ gap: pxToRem(settingsSections.membersSearchGap) }}
      >
        <div
          className="flex flex-1 items-center border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))]"
          style={{
            borderRadius: pxToRem(settingsSections.membersSearchRadius),
            gap: pxToRem(settingsSections.membersSearchInnerGap),
            minWidth: pxToRem(settingsSections.membersSearchMinWidth),
            padding: `${pxToRem(settingsSections.membersSearchPaddingY)} ${pxToRem(
              settingsSections.membersSearchPaddingX,
            )}`,
          }}
        >
          <span aria-hidden="true" className="flex-none text-[hsl(var(--text-muted))]">
            <svg
              fill="none"
              height={pxToEm(14, settingsSections.membersSearchFontSize)}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              viewBox="0 0 24 24"
              width={pxToEm(14, settingsSections.membersSearchFontSize)}
            >
              <path d={SEARCH_ICON_PATH} />
            </svg>
          </span>
          <label className="sr-only" htmlFor={searchId}>
            {t("server.settings.members.search.label")}
          </label>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-[hsl(var(--foreground))] outline-hidden"
            data-testid="server-settings-members-search"
            id={searchId}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("server.settings.members.search.placeholder")}
            style={{ fontSize: pxToRem(settingsSections.membersSearchFontSize) }}
            value={query}
          />
        </div>
        <span
          aria-live="polite"
          className="flex-none text-[hsl(var(--text-muted))]"
          data-testid="server-settings-members-counter"
          style={{
            fontSize: pxToRem(settingsSections.membersCounterFontSize),
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {t("server.settings.members.counter", {
            filtered: counts.filtered,
            total: counts.total,
          })}
        </span>
      </div>

      <div style={{ marginTop: pxToRem(settingsSections.membersFiltersMarginTop) }}>
        <ChipRadioGroup
          ariaLabel={t("server.settings.members.filters.label")}
          metrics={{
            chipFontSize: settingsSections.membersFilterChipFontSize,
            chipGap: settingsSections.membersFiltersGap,
            chipPaddingX: settingsSections.membersFilterChipPaddingX,
            chipPaddingY: settingsSections.membersFilterChipPaddingY,
            chipRadius: settingsSections.membersFilterChipRadius,
          }}
          onChange={onFilterChange}
          options={SERVER_MEMBER_FILTERS.map((value) => ({
            label: t(`server.settings.members.filter.${value}`),
            value,
          }))}
          testId="server-settings-members-filters"
          value={filter}
        />
      </div>

      {canManageServer ? (
        <div style={{ marginTop: pxToRem(settingsSections.membersInviteRowMarginTop) }}>
          <ToggleRow
            checked={allowMemberAdds}
            description={t("server.settings.members.allowAdds.description")}
            onChange={onToggleAllowMemberAdds}
            testId="server-settings-members-allow-adds"
            title={t("server.settings.members.allowAdds.title")}
          />
        </div>
      ) : null}

      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(settingsSections.membersListGap),
          marginTop: pxToRem(settingsSections.membersListMarginTop),
        }}
      >
        {members.length === 0 ? (
          <CollapsibleEmpty>{t("server.settings.members.empty")}</CollapsibleEmpty>
        ) : null}
        {members.map((member) => {
          const badge = selectMemberTypeBadge(member.accessLevel);
          const tone = badgeTone(badge);
          const online = member.status !== "OFFLINE";
          const isOwner = member.accessLevel === "OWNER";
          const remaining = formatTimeoutRemaining(member.communicationDisabledUntil, nowMs);
          const roleName =
            selectPrimaryRoleName(
              member.roles.map((role) => role.id),
              roles,
            ) ?? t("server.settings.members.role.none");
          const actions = moderationActions(member);
          const memberRoleIds = member.roles.map((role) => role.id);

          return (
            <div
              className="relative flex items-center border bg-[hsl(var(--surface-card))] transition-colors hover:border-[hsl(var(--primary)/0.4)]"
              data-testid={`server-settings-member-${member.id}`}
              key={member.id}
              style={{
                borderColor: `hsl(var(--border)/${settingsSections.membersRowBorderAlpha})`,
                borderRadius: pxToRem(settingsSections.membersRowRadius),
                gap: pxToRem(settingsSections.membersRowGap),
                padding: `${pxToRem(settingsSections.membersRowPaddingY)} ${pxToRem(
                  settingsSections.membersRowPaddingX,
                )}`,
              }}
            >
              <div className="relative flex-none">
                <div
                  className="grid place-items-center rounded-full"
                  style={{
                    background: "hsl(var(--primary)/0.2)",
                    color: "hsl(var(--primary))",
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(settingsSections.membersAvatarFontSize),
                    fontWeight: 600,
                    height: pxToRem(settingsSections.membersAvatarSize),
                    lineHeight: 1,
                    width: pxToRem(settingsSections.membersAvatarSize),
                  }}
                >
                  {initials(member.displayName)}
                </div>
                <span
                  aria-label={t(
                    online
                      ? "server.settings.members.presence.online"
                      : "server.settings.members.presence.offline",
                  )}
                  className="absolute rounded-full"
                  role="img"
                  style={{
                    background: online ? "hsl(var(--success))" : "hsl(var(--text-muted))",
                    border: `${settingsSections.membersPresenceDotBorderWidth}px solid hsl(var(--surface-card))`,
                    bottom: pxToRem(settingsSections.membersPresenceDotOffset),
                    height: pxToRem(settingsSections.membersPresenceDotSize),
                    right: pxToRem(settingsSections.membersPresenceDotOffset),
                    width: pxToRem(settingsSections.membersPresenceDotSize),
                  }}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center"
                  style={{ gap: pxToRem(settingsSections.membersNameGap) }}
                >
                  <span
                    className="min-w-0 truncate text-[hsl(var(--foreground))]"
                    style={{
                      fontSize: pxToRem(settingsSections.membersNameFontSize),
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}
                  >
                    {member.displayName}
                  </span>
                  <span
                    className="flex-none"
                    style={{
                      background: tone.background,
                      borderRadius: pxToRem(settingsSections.membersTagChipRadius),
                      color: tone.color,
                      fontFamily: DISPLAY_FONT,
                      fontSize: pxToRem(settingsSections.membersTagChipFontSize),
                      fontWeight: 600,
                      lineHeight: 1,
                      padding: `${pxToRem(settingsSections.membersTagChipPaddingY)} ${pxToRem(
                        settingsSections.membersTagChipPaddingX,
                      )}`,
                    }}
                  >
                    {t(`server.settings.members.badge.${badge}`)}
                  </span>
                  {remaining ? (
                    <span
                      className="flex-none"
                      data-testid={`server-settings-member-timeout-${member.id}`}
                      style={{
                        background: "hsl(var(--warning)/0.14)",
                        borderRadius: pxToRem(settingsSections.membersTagChipRadius),
                        color: "hsl(var(--warning))",
                        fontFamily: DISPLAY_FONT,
                        fontSize: pxToRem(settingsSections.membersTagChipFontSize),
                        fontWeight: 600,
                        lineHeight: 1,
                        padding: `${pxToRem(settingsSections.membersTagChipPaddingY)} ${pxToRem(
                          settingsSections.membersTagChipPaddingX,
                        )}`,
                      }}
                    >
                      {t("server.settings.members.timeout.chip", {
                        remaining: t(
                          `server.settings.members.timeout.remaining.${remaining.unit}`,
                          { count: remaining.value },
                        ),
                      })}
                    </span>
                  ) : null}
                </div>
                <div
                  className="text-[hsl(var(--text-muted))]"
                  style={{
                    fontSize: pxToRem(settingsSections.membersUsernameFontSize),
                    fontWeight: 500,
                    lineHeight: 1,
                    marginTop: pxToRem(settingsSections.membersUsernameMarginTop),
                  }}
                >
                  @{member.username}
                </div>
              </div>

              {canAssignRoles && !isOwner ? (
                <>
                  <button
                    aria-expanded={openRoleMenuMemberId === member.id}
                    aria-haspopup="menu"
                    aria-label={t("server.settings.members.role.open", {
                      name: member.displayName,
                    })}
                    className="flex flex-none items-center border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid={`server-settings-member-role-${member.id}`}
                    onClick={() =>
                      onToggleRoleMenu(openRoleMenuMemberId === member.id ? null : member.id)
                    }
                    style={{
                      borderRadius: pxToRem(settingsSections.membersRoleButtonRadius),
                      fontSize: pxToRem(settingsSections.membersRoleButtonFontSize),
                      fontWeight: 600,
                      gap: pxToRem(settingsSections.membersRoleButtonGap),
                      height: pxToRem(settingsSections.membersRoleButtonHeight),
                      lineHeight: 1,
                      padding: `0 ${pxToRem(settingsSections.membersRoleButtonPaddingX)}`,
                      whiteSpace: "nowrap",
                    }}
                    type="button"
                  >
                    {roleName}
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height={pxToEm(12, settingsSections.membersRoleButtonFontSize)}
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                      width={pxToEm(12, settingsSections.membersRoleButtonFontSize)}
                    >
                      <path d={CHEVRON_PATH} />
                    </svg>
                  </button>
                  <button
                    aria-expanded={openRoleMenuMemberId === member.id}
                    aria-haspopup="menu"
                    className="flex flex-none items-center border border-dashed border-[hsl(var(--border))] bg-transparent text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/0.1)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    onClick={() =>
                      onToggleRoleMenu(openRoleMenuMemberId === member.id ? null : member.id)
                    }
                    style={{
                      borderRadius: pxToRem(settingsSections.membersRoleButtonRadius),
                      fontSize: pxToRem(settingsSections.membersRoleButtonFontSize),
                      fontWeight: 600,
                      gap: pxToRem(settingsSections.membersAddRoleGap),
                      height: pxToRem(settingsSections.membersRoleButtonHeight),
                      lineHeight: 1,
                      padding: `0 ${pxToRem(settingsSections.membersRoleButtonPaddingX)}`,
                      whiteSpace: "nowrap",
                    }}
                    type="button"
                  >
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height={pxToEm(12, settingsSections.membersRoleButtonFontSize)}
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.4}
                      viewBox="0 0 24 24"
                      width={pxToEm(12, settingsSections.membersRoleButtonFontSize)}
                    >
                      <path d={PLUS_PATH} />
                    </svg>
                    {t("server.settings.members.role.add")}
                  </button>
                </>
              ) : null}

              {actions.length > 0 ? (
                <button
                  aria-expanded={openMenuMemberId === member.id}
                  aria-haspopup="menu"
                  aria-label={t("server.settings.members.menu.open", {
                    name: member.displayName,
                  })}
                  className="grid flex-none place-items-center border-0 bg-transparent text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid={`server-settings-member-menu-${member.id}`}
                  onClick={() => onToggleMenu(openMenuMemberId === member.id ? null : member.id)}
                  style={{
                    borderRadius: pxToRem(settingsSections.membersKickRadius),
                    cursor: "pointer",
                    height: pxToRem(settingsSections.membersKickSize),
                    width: pxToRem(settingsSections.membersKickSize),
                  }}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height={pxToEm(14)}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.6}
                    viewBox="0 0 24 24"
                    width={pxToEm(14)}
                  >
                    <path d={MORE_PATH} />
                  </svg>
                </button>
              ) : null}

              <button
                aria-disabled={isOwner}
                aria-label={t("server.settings.members.kick")}
                className="grid flex-none place-items-center border-0 bg-transparent text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                data-testid={`server-settings-member-kick-${member.id}`}
                onClick={() => {
                  if (!isOwner) {
                    onKick(member);
                  }
                }}
                style={{
                  borderRadius: pxToRem(settingsSections.membersKickRadius),
                  cursor: isOwner ? "not-allowed" : "pointer",
                  height: pxToRem(settingsSections.membersKickSize),
                  opacity: isOwner ? settingsSections.membersKickDisabledOpacity : 1,
                  width: pxToRem(settingsSections.membersKickSize),
                }}
                title={isOwner ? t("server.settings.members.kick.ownerDisabled") : undefined}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height={pxToEm(14)}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  width={pxToEm(14)}
                >
                  <path d={KICK_PATH} />
                </svg>
              </button>
              {isOwner ? (
                <span className="sr-only">{t("server.settings.members.kick.ownerDisabled")}</span>
              ) : null}

              {openRoleMenuMemberId === member.id ? (
                <div
                  className="absolute right-0 z-20 border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card))]"
                  data-testid={`server-settings-member-role-menu-${member.id}`}
                  role="menu"
                  style={{
                    borderRadius: pxToRem(sidebar.menuRadius),
                    boxShadow: `${sidebar.menuShadow.x}px ${pxToRem(sidebar.menuShadow.y)} ${pxToRem(
                      sidebar.menuShadow.blur,
                    )} ${pxToRem(sidebar.menuShadow.spread)} hsl(var(--shadow-color)/0.42)`,
                    padding: pxToRem(sidebar.menuPadding),
                    top: `calc(100% + ${pxToRem(settingsSections.moderationMenuOffsetY)})`,
                    width: pxToRem(settingsSections.moderationMenuWidth),
                  }}
                >
                  <div
                    className="uppercase text-[hsl(var(--text-muted))]"
                    style={{
                      fontFamily: DISPLAY_FONT,
                      fontSize: pxToRem(settingsSections.moderationMenuLabelFontSize),
                      fontWeight: 600,
                      letterSpacing: `${settingsSections.moderationMenuLabelLetterSpacing}em`,
                      padding: `${pxToRem(settingsSections.moderationMenuLabelPaddingY)} ${pxToRem(
                        settingsSections.moderationMenuLabelPaddingX,
                      )}`,
                    }}
                  >
                    {t("server.settings.members.role.menuLabel")}
                  </div>
                  {assignableRoles.length === 0 ? (
                    <div
                      className="text-[hsl(var(--text-muted))]"
                      style={{
                        fontSize: pxToRem(sidebar.menuRowFontSize),
                        padding: `${pxToRem(sidebar.menuRowPaddingY)} ${pxToRem(
                          sidebar.menuRowPaddingX,
                        )}`,
                      }}
                    >
                      {t("server.settings.members.role.empty")}
                    </div>
                  ) : null}
                  {assignableRoles.map((role) => {
                    const selected = memberRoleIds.includes(role.id);

                    return (
                      <button
                        aria-checked={selected}
                        className="flex w-full items-center border-0 bg-transparent text-left text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                        key={role.id}
                        onClick={() => onToggleRole(member, role.id)}
                        role="menuitemcheckbox"
                        style={{
                          borderRadius: pxToRem(sidebar.menuRowRadius),
                          fontSize: pxToRem(sidebar.menuRowFontSize),
                          gap: pxToRem(sidebar.menuRowGap),
                          padding: `${pxToRem(sidebar.menuRowPaddingY)} ${pxToRem(
                            sidebar.menuRowPaddingX,
                          )}`,
                        }}
                        type="button"
                      >
                        <span className="min-w-0 flex-1 truncate">{role.name}</span>
                        {selected ? (
                          <svg
                            aria-hidden="true"
                            fill="none"
                            height={pxToEm(13, sidebar.menuRowFontSize)}
                            stroke="hsl(var(--primary))"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.6}
                            viewBox="0 0 24 24"
                            width={pxToEm(13, sidebar.menuRowFontSize)}
                          >
                            <path d={CHECK_PATH} />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {openMenuMemberId === member.id ? (
                <div
                  className="absolute right-0 z-20 border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card))]"
                  data-testid={`server-settings-member-moderation-${member.id}`}
                  role="menu"
                  style={{
                    borderRadius: pxToRem(sidebar.menuRadius),
                    boxShadow: `${sidebar.menuShadow.x}px ${pxToRem(sidebar.menuShadow.y)} ${pxToRem(
                      sidebar.menuShadow.blur,
                    )} ${pxToRem(sidebar.menuShadow.spread)} hsl(var(--shadow-color)/0.42)`,
                    padding: pxToRem(sidebar.menuPadding),
                    top: `calc(100% + ${pxToRem(settingsSections.moderationMenuOffsetY)})`,
                    width: pxToRem(settingsSections.moderationMenuWidth),
                  }}
                >
                  {actions.includes("timeout") ? (
                    <>
                      <div
                        className="uppercase text-[hsl(var(--text-muted))]"
                        style={{
                          fontFamily: DISPLAY_FONT,
                          fontSize: pxToRem(settingsSections.moderationMenuLabelFontSize),
                          fontWeight: 600,
                          letterSpacing: `${settingsSections.moderationMenuLabelLetterSpacing}em`,
                          padding: `${pxToRem(
                            settingsSections.moderationMenuLabelPaddingY,
                          )} ${pxToRem(settingsSections.moderationMenuLabelPaddingX)}`,
                        }}
                      >
                        {t("server.settings.members.menu.timeoutLabel")}
                      </div>
                      {SERVER_TIMEOUT_DURATIONS.map((option) => (
                        <button
                          className="flex w-full items-center border-0 bg-transparent text-left text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                          key={option.id}
                          onClick={() => onTimeout(member, option.id)}
                          role="menuitem"
                          style={{
                            borderRadius: pxToRem(sidebar.menuRowRadius),
                            fontSize: pxToRem(sidebar.menuRowFontSize),
                            padding: `${pxToRem(sidebar.menuRowPaddingY)} ${pxToRem(
                              sidebar.menuRowPaddingX,
                            )}`,
                          }}
                          type="button"
                        >
                          {t(`server.settings.members.timeout.${option.id}`)}
                        </button>
                      ))}
                    </>
                  ) : null}
                  {actions.includes("removeTimeout") ? (
                    <button
                      className="flex w-full items-center border-0 bg-transparent text-left text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                      data-testid={`server-settings-member-remove-timeout-${member.id}`}
                      onClick={() => onRemoveTimeout(member)}
                      role="menuitem"
                      style={{
                        borderRadius: pxToRem(sidebar.menuRowRadius),
                        fontSize: pxToRem(sidebar.menuRowFontSize),
                        padding: `${pxToRem(sidebar.menuRowPaddingY)} ${pxToRem(
                          sidebar.menuRowPaddingX,
                        )}`,
                      }}
                      type="button"
                    >
                      {t("server.settings.members.menu.removeTimeout")}
                    </button>
                  ) : null}
                  {actions.includes("ban") ? (
                    <>
                      <div
                        aria-hidden="true"
                        style={{
                          background: "hsl(var(--border)/0.6)",
                          height: 1,
                          margin: `${pxToRem(settingsSections.moderationMenuSeparatorMarginY)} 0`,
                        }}
                      />
                      <button
                        className="flex w-full items-center border-0 bg-transparent text-left text-[hsl(var(--danger))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                        data-testid={`server-settings-member-ban-${member.id}`}
                        onClick={() => onBan(member)}
                        role="menuitem"
                        style={{
                          borderRadius: pxToRem(sidebar.menuRowRadius),
                          fontSize: pxToRem(sidebar.menuRowFontSize),
                          gap: pxToRem(sidebar.menuRowGap),
                          padding: `${pxToRem(sidebar.menuRowPaddingY)} ${pxToRem(
                            sidebar.menuRowPaddingX,
                          )}`,
                        }}
                        type="button"
                      >
                        <svg
                          aria-hidden="true"
                          fill="none"
                          height={pxToEm(15, sidebar.menuRowFontSize)}
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.9}
                          viewBox="0 0 24 24"
                          width={pxToEm(15, sidebar.menuRowFontSize)}
                        >
                          <path d={BAN_ICON_PATH} />
                        </svg>
                        {t("server.settings.members.menu.ban")}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <CollapsibleList
        expanded={bansExpanded}
        label={t("server.settings.members.banned.toggle", { count: bans.length })}
        onToggle={onToggleBans}
        testId="server-settings-bans-toggle"
      >
        {bans.length === 0 ? (
          <CollapsibleEmpty>{t("server.settings.members.banned.empty")}</CollapsibleEmpty>
        ) : (
          <div
            className="flex flex-col"
            style={{ gap: pxToRem(settingsSections.collapsibleRowsGap) }}
          >
            {bans.map((entry) => (
              <div
                className="flex items-center border bg-[hsl(var(--surface-card))]"
                data-testid={`server-settings-ban-${entry.userId}`}
                key={entry.userId}
                style={{
                  borderColor: `hsl(var(--border)/${settingsSections.membersRowBorderAlpha})`,
                  borderRadius: pxToRem(settingsSections.membersRowRadius),
                  gap: pxToRem(settingsSections.membersRowGap),
                  padding: `${pxToRem(settingsSections.membersRowPaddingY)} ${pxToRem(
                    settingsSections.membersRowPaddingX,
                  )}`,
                }}
              >
                <div
                  className="grid flex-none place-items-center rounded-full"
                  style={{
                    background: "hsl(var(--danger)/0.16)",
                    color: "hsl(var(--danger))",
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(settingsSections.membersAvatarFontSize),
                    fontWeight: 600,
                    height: pxToRem(settingsSections.membersAvatarSize),
                    lineHeight: 1,
                    width: pxToRem(settingsSections.membersAvatarSize),
                  }}
                >
                  {initials(entry.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[hsl(var(--foreground))]"
                    style={{
                      fontSize: pxToRem(settingsSections.membersNameFontSize),
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}
                  >
                    {entry.displayName}
                  </div>
                  <div
                    className="text-[hsl(var(--text-muted))]"
                    style={{
                      fontSize: pxToRem(settingsSections.membersUsernameFontSize),
                      fontWeight: 500,
                      lineHeight: 1.4,
                      marginTop: pxToRem(settingsSections.membersUsernameMarginTop),
                    }}
                  >
                    {t("server.settings.members.banned.meta", {
                      date: dateFormatter.format(new Date(entry.bannedAt)),
                      name: entry.bannedByDisplayName ?? "—",
                    })}
                    {" · "}
                    {entry.reason
                      ? t("server.settings.members.banned.reason", { reason: entry.reason })
                      : t("server.settings.members.banned.noReason")}
                  </div>
                </div>
                <button
                  className="flex-none border text-[hsl(var(--danger))] transition-colors hover:bg-[hsl(var(--danger)/0.12)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  data-testid={`server-settings-unban-${entry.userId}`}
                  onClick={() => onUnban(entry)}
                  style={{
                    background: "transparent",
                    borderColor: "hsl(var(--danger)/0.35)",
                    borderRadius: pxToRem(settingsSections.invitesActionRadius),
                    fontSize: pxToRem(settingsSections.invitesActionFontSize),
                    fontWeight: 600,
                    height: pxToRem(settingsSections.invitesActionHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(settingsSections.invitesActionPaddingX)}`,
                    whiteSpace: "nowrap",
                  }}
                  type="button"
                >
                  {t("server.settings.members.banned.unban")}
                </button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleList>
    </div>
  );
}

export type MemberBanDialogProps = {
  readonly displayName: string;
  readonly onCancel: () => void;
  readonly onSubmit: (input: { deleteMessageSeconds?: number; reason?: string }) => void;
  readonly open: boolean;
  readonly submitting: boolean;
};

export function MemberBanDialog({
  displayName,
  onCancel,
  onSubmit,
  open,
  submitting,
}: MemberBanDialogProps) {
  const { t } = useI18n();
  const { modal } = SERVER_METRICS;
  /**
   * Alanlar hedef değiştiğinde sıfırlanır ama bunu bir efekt yapmaz: çağıran pencereyi
   * hedefin kimliğiyle `key`liyor ve bileşen yeniden mount oluyor. Efektle sıfırlamak bir
   * render boyunca önceki üyenin sebebini yeni üyenin penceresinde göstermek olurdu.
   */
  const [reason, setReason] = useState("");
  const [windowId, setWindowId] = useState<ServerBanDeleteWindowId>("none");

  return (
    <ServerModalShell
      closeLabel={t("server.settings.members.ban.cancel")}
      description={t("server.settings.members.ban.description", { name: displayName })}
      footer={
        <>
          <button
            className="flex-none border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--surface-soft))]"
            onClick={onCancel}
            style={{
              borderRadius: pxToRem(modal.secondaryRadius),
              fontSize: pxToRem(modal.secondaryFontSize),
              fontWeight: 600,
              height: pxToRem(modal.secondaryHeight),
              padding: `0 ${pxToRem(modal.secondaryPaddingX)}`,
            }}
            type="button"
          >
            {t("server.settings.members.ban.cancel")}
          </button>
          <button
            className="flex-none border-0 text-[hsl(var(--danger-foreground))] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="server-settings-ban-submit"
            disabled={submitting}
            onClick={() => {
              const seconds = selectBanDeleteWindow(windowId).seconds;

              onSubmit({
                ...(seconds > 0 ? { deleteMessageSeconds: seconds } : {}),
                ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
              });
            }}
            style={{
              background: "hsl(var(--danger))",
              borderRadius: pxToRem(modal.primaryRadius),
              fontSize: pxToRem(modal.primaryFontSize),
              fontWeight: 600,
              height: pxToRem(modal.primaryHeight),
              padding: `0 ${pxToRem(modal.primaryPaddingX)}`,
            }}
            type="button"
          >
            {t("server.settings.members.ban.submit")}
          </button>
        </>
      }
      icon={
        <svg
          aria-hidden="true"
          fill="none"
          height={pxToEm(modal.iconBoxGlyphSize)}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.9}
          viewBox="0 0 24 24"
          width={pxToEm(modal.iconBoxGlyphSize)}
        >
          <path d={BAN_ICON_PATH} />
        </svg>
      }
      layerId="server-member-ban"
      onClose={onCancel}
      open={open}
      title={t("server.settings.members.ban.title")}
      tone="danger"
      width="invite"
    >
      <label
        className="uppercase text-[hsl(var(--text-muted))]"
        htmlFor="server-member-ban-reason"
        style={{
          display: "block",
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(modal.labelFontSize),
          fontWeight: 600,
          letterSpacing: `${modal.labelLetterSpacing}em`,
        }}
      >
        {t("server.settings.members.ban.reasonLabel")}
      </label>
      <input
        className="w-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] text-[hsl(var(--foreground))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        id="server-member-ban-reason"
        maxLength={SERVER_MODERATION_REASON_MAX_LENGTH}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t("server.settings.members.ban.reasonPlaceholder")}
        style={{
          borderRadius: pxToRem(modal.inputRadius),
          fontSize: pxToRem(modal.inputFontSize),
          marginTop: pxToRem(modal.inputMarginTop),
          padding: `${pxToRem(modal.inputPaddingY)} ${pxToRem(modal.inputPaddingX)}`,
        }}
        value={reason}
      />
      <div style={{ marginTop: pxToRem(modal.noteMarginTop) }}>
        <OptionChipGroup
          description={t("server.settings.members.ban.windowDescription")}
          onChange={setWindowId}
          options={SERVER_BAN_DELETE_WINDOWS.map((option) => ({
            label: t(`server.settings.members.ban.window.${option.id}`),
            value: option.id,
          }))}
          testId="server-settings-ban-window"
          title={t("server.settings.members.ban.windowTitle")}
          value={windowId}
          variant="settings"
        />
      </div>
    </ServerModalShell>
  );
}

export function MembersSection({
  currentUserId,
  detail,
  draft,
  patch,
  permissions,
}: ServerSettingsSectionProps) {
  const queryClient = useQueryClient();
  const serverId = detail.server.id;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<WorkspaceMemberFilter>("all");
  const [openMenuMemberId, setOpenMenuMemberId] = useState<string | null>(null);
  const [openRoleMenuMemberId, setOpenRoleMenuMemberId] = useState<string | null>(null);
  const [bansExpanded, setBansExpanded] = useState(false);
  const [banTarget, setBanTarget] = useState<WorkspaceMember | null>(null);
  /**
   * "Şimdi" render başına **bir kez** okunur. Her satır kendi `Date.now()`unu çağırsaydı aynı
   * listedeki iki zaman aşımı çipi farklı saniyeleri gösterebilirdi; ayrıca sunucuda render
   * edilirken de tek bir değer gerekiyor.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const canBan = viewerCan(permissions, "BAN_MEMBERS");
  const canTimeout = viewerCan(permissions, "TIMEOUT_MEMBERS");
  const canKick = viewerCan(permissions, "KICK_MEMBERS");
  const canAssignRoles = viewerCan(permissions, "MANAGE_ROLES");
  const canManageServer = viewerCan(permissions, "MANAGE_SERVER");

  /**
   * Ş14 (SPEC §12): satır menüleri de birer katmandır. `Esc` **önce** menüyü kapatır; kayıt
   * olmasaydı tuş kaplamanın kendi dinleyicisine düşer ve kullanıcıyı ayarlardan atardı.
   * `kind: "menu"` ayarları altta bırakır (K11 kural 3) ve iki menünün aynı anda açık
   * kalmasını engeller.
   */
  const closeRowMenus = useCallback(() => {
    setOpenMenuMemberId(null);
    setOpenRoleMenuMemberId(null);
  }, []);

  useLayerStack({
    id: "server-settings-member-row-menu",
    kind: "menu",
    onClose: closeRowMenus,
    open: openMenuMemberId !== null || openRoleMenuMemberId !== null,
  });

  /**
   * Dış tıklama menüyü kapatır; `ui/modal` gibi bir kabuğu olmayan tek yüzey bu.
   *
   * "Dışarı" bir kutu değil bir **rol** sorusu: menünün kendisi ve menüyü açan düğme içeridedir,
   * kalan her şey dışarıdadır. Bölümün köküne bir `ref` takmak, başka bir satırın düğmesine
   * basıldığında menüyü açık bırakırdı.
   */
  useEffect(() => {
    if (openMenuMemberId === null && openRoleMenuMemberId === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const element =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null;

      if (element?.closest('[role="menu"], [aria-haspopup="menu"]')) {
        return;
      }

      closeRowMenus();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [closeRowMenus, openMenuMemberId, openRoleMenuMemberId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 220);

    return () => clearTimeout(timer);
  }, [query]);

  /** Zaman aşımı çipi kendiliğinden sönmeli; en kısa süre 60 sn, dakikada bir tazelemek yeter. */
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);

    return () => clearInterval(timer);
  }, []);

  const membersQuery = useQuery({
    placeholderData: (previous) => previous,
    queryFn: () => fetchWorkspaceServerMembers(serverId, { filter, q: debouncedQuery }),
    queryKey: workspaceQueryKeys.serverMembers(serverId, filter, debouncedQuery),
    staleTime: 15_000,
  });

  const bansQuery = useQuery({
    enabled: canBan && bansExpanded,
    queryFn: () => fetchServerBans(serverId),
    queryKey: workspaceQueryKeys.serverBans(serverId),
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
    void queryClient.invalidateQueries({
      queryKey: ["workspace", "server", serverId, "members"],
    });
    void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.serverBans(serverId) });
  };

  const timeoutMutation = useMutation({
    mutationFn: (input: { memberId: string; until: string | null }) =>
      timeoutServerMember(serverId, input.memberId, { until: input.until }),
    onSettled: invalidate,
  });

  const banMutation = useMutation({
    mutationFn: (input: { deleteMessageSeconds?: number; memberId: string; reason?: string }) => {
      const { memberId, ...body } = input;

      return banServerMember(serverId, memberId, body);
    },
    onSettled: invalidate,
    onSuccess: () => setBanTarget(null),
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => unbanServerMember(serverId, userId),
    onSettled: invalidate,
  });

  const kickMutation = useMutation({
    mutationFn: (memberId: string) => kickMemberRequest(serverId, memberId),
    onSettled: invalidate,
  });

  const rolesMutation = useMutation({
    mutationFn: (input: { memberId: string; roleIds: string[] }) =>
      updateWorkspaceMemberRolesRequest(serverId, input.memberId, { roleIds: input.roleIds }),
    onSettled: invalidate,
  });

  const members = membersQuery.data?.members ?? detail.members;
  const counts = membersQuery.data?.memberCounts ?? {
    filtered: detail.members.length,
    total: detail.server.memberCount,
  };

  const moderationActions = useMemo(
    () => (member: WorkspaceMember) =>
      listMemberModerationActions(
        { canBan, canKick, canTimeout, userId: currentUserId },
        {
          accessLevel: member.accessLevel,
          communicationDisabledUntil: member.communicationDisabledUntil,
          userId: member.userId,
        },
        nowMs,
      ),
    [canBan, canKick, canTimeout, currentUserId, nowMs],
  );

  return (
    <>
      <MembersSectionView
        allowMemberAdds={draft.allowMemberAdds}
        bans={bansQuery.data?.bans ?? []}
        bansExpanded={bansExpanded}
        canAssignRoles={canAssignRoles}
        canManageServer={canManageServer}
        counts={counts}
        filter={filter}
        members={members}
        moderationActions={moderationActions}
        nowMs={nowMs}
        onBan={(member) => {
          setOpenMenuMemberId(null);
          setBanTarget(member);
        }}
        onFilterChange={setFilter}
        onKick={(member) => kickMutation.mutate(member.id)}
        onQueryChange={setQuery}
        onRemoveTimeout={(member) => {
          setOpenMenuMemberId(null);
          timeoutMutation.mutate({ memberId: member.id, until: null });
        }}
        onTimeout={(member, id) => {
          setOpenMenuMemberId(null);
          timeoutMutation.mutate({
            memberId: member.id,
            until: resolveTimeoutUntil(Date.now(), selectTimeoutDuration(id).seconds),
          });
        }}
        onToggleAllowMemberAdds={(allowMemberAdds) => patch({ allowMemberAdds })}
        onToggleBans={() => setBansExpanded((current) => !current)}
        onToggleMenu={(memberId) => {
          setOpenRoleMenuMemberId(null);
          setOpenMenuMemberId(memberId);
        }}
        onToggleRole={(member, roleId) => {
          const current = member.roles.map((role) => role.id);

          rolesMutation.mutate({
            memberId: member.id,
            roleIds: current.includes(roleId)
              ? current.filter((id) => id !== roleId)
              : [...current, roleId],
          });
        }}
        onToggleRoleMenu={(memberId) => {
          setOpenMenuMemberId(null);
          setOpenRoleMenuMemberId(memberId);
        }}
        onUnban={(entry) => unbanMutation.mutate(entry.userId)}
        openMenuMemberId={openMenuMemberId}
        openRoleMenuMemberId={openRoleMenuMemberId}
        query={query}
        roles={detail.roles}
      />
      {banTarget ? (
        <MemberBanDialog
          displayName={banTarget.displayName}
          key={banTarget.id}
          onCancel={() => setBanTarget(null)}
          onSubmit={(input) => banMutation.mutate({ ...input, memberId: banTarget.id })}
          open
          submitting={banMutation.isPending}
        />
      ) : null}
    </>
  );
}

export default MembersSection;
