import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ServerNotificationLevel } from "@wizards/types";

import { BottomSheet, useSheetPresentation } from "../components/kit";
import { AvatarMark } from "../components/ui-atoms";
import { MobileLineIcon, type MobileLineIconName } from "../../design/mobile-line-icons";
import { copy } from "../mobile-root-screen-shared";
import { getMobileServerNameLayout } from "../mobile-sunucular-model";
import { useTheme } from "../providers/mobile-theme-provider";
import { useHomeScreenStyles } from "./home-screen.styles";

type WorkspaceServerMenuRow = {
  /** The `YÖNETİCİ` pill; only the settings row carries one. */
  readonly chip?: string;
  /** The one destructive row is drawn in the danger tone, never as a plain entry. */
  readonly danger?: boolean;
  readonly icon: MobileLineIconName;
  readonly label: string;
  readonly onPress: () => void;
  /**
   * The action's established id, not a menu-local one: these entries moved out
   * of the header, they were not replaced, and the e2e flow identifies them by
   * what they do rather than by where they happen to live this phase.
   */
  readonly testID: string;
  /** Right-hand value: the member count, the current notification level. */
  readonly value?: string;
};

type WorkspaceServerQuickAction = {
  /** A toggle card wears the primary tint while its preference is on. */
  readonly active?: boolean;
  readonly icon: MobileLineIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
};

const NOTIFICATION_LEVELS: readonly ServerNotificationLevel[] = ["all", "mentions", "none"];

function notificationLevelLabel(level: ServerNotificationLevel): string {
  switch (level) {
    case "mentions":
      return copy.notificationLevelMentions;
    case "none":
      return copy.notificationLevelNone;
    default:
      return copy.notificationLevelAll;
  }
}

/**
 * 6c — the server "⋯" menu: identity, quick actions, list card.
 *
 * Presentational on purpose. The browser owns the bootstrap summary the three
 * preferences are read from and the one endpoint they are written through, so
 * this component never fetches and never mutates; it reports presses.
 *
 * Nothing here is disabled-but-visible: an entry the viewer may not use is not
 * rendered at all (PROMPT.md §0.2), quick action cards included — the quartet
 * shares its width between whatever cards survive.
 *
 * "Sunucudan ayrıl" is the last row and the only destructive one. `leaveAccess`
 * carries all three of its states rather than a boolean that cannot express the
 * middle one: the owner sees the row the handoff draws, but pressing it reports
 * `onOwnerTransferNotice` instead of a confirmation — the service refuses an
 * owner's leave, and a request that can only answer 400 is never sent.
 */
export function WorkspaceServerMenuSheet({
  canManageInvites,
  canManageServer,
  initialLayer = "menu",
  inviteAddress,
  leaveAccess,
  isMuted,
  isStarred,
  memberCount,
  notificationLevel,
  onClose,
  onLeave,
  onOpenInvite,
  onOwnerTransferNotice,
  onOpenMembers,
  onOpenProfile,
  onOpenSettings,
  onSelectNotificationLevel,
  onShare,
  onToggleMute,
  onToggleStar,
  open,
  serverIconUrl,
  serverId,
  serverName,
  serverShortName,
}: {
  canManageInvites: boolean;
  canManageServer: boolean;
  /**
   * Which of the panel's two layers opens first. 6d's bottom-bar bell points at
   * the notification settings, and Faz 4 §2.5 keeps that behind this same panel
   * rather than stacking a second overlay on top of it.
   */
  initialLayer?: "menu" | "notifications";
  /** `<origin host>/invite/<code>`; `null` hides the address line and the share card outright. */
  inviteAddress: string | null;
  /**
   * `hidden` for a non-member (and for an owner the profile could not resolve);
   * `allowed` for an ordinary member; `owner-must-transfer` for the owner, whose
   * row is drawn but answers with the transfer notice.
   */
  leaveAccess: "allowed" | "hidden" | "owner-must-transfer";
  isMuted: boolean;
  isStarred: boolean;
  memberCount: number;
  notificationLevel: ServerNotificationLevel;
  onClose(): void;
  onLeave(): void;
  onOpenInvite(): void;
  onOwnerTransferNotice(): void;
  onOpenMembers(): void;
  onOpenProfile(): void;
  onOpenSettings(): void;
  onSelectNotificationLevel(level: ServerNotificationLevel): void;
  onShare(): void;
  onToggleMute(next: boolean): void;
  onToggleStar(next: boolean): void;
  open: boolean;
  serverIconUrl: string | null;
  serverId: string;
  serverName: string;
  serverShortName: string;
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const maxHeight = useSheetPresentation();
  const [layer, setLayer] = useState<"menu" | "notifications">(initialLayer);

  // Reset on the way in rather than on the way out: the panel outlives `open`
  // by one exit animation, and swapping its content mid-slide reads as a flash.
  useEffect(() => {
    if (open) {
      setLayer(initialLayer);
    }
  }, [initialLayer, open]);

  const presentation = useMemo(
    () => ({
      backdropStyle: styles.mobileWorkspaceMenuBackdrop,
      handleAreaStyle: styles.mobileWorkspaceMenuHandleArea,
      handleStyle: styles.mobileWorkspaceMenuHandle,
      panelStyle: [maxHeight.panelStyle, styles.mobileWorkspaceMenuPanel],
    }),
    [maxHeight.panelStyle, styles],
  );

  const nameLayout = getMobileServerNameLayout(serverName, "card");

  const quickActions: WorkspaceServerQuickAction[] = [
    ...(canManageInvites
      ? [
          {
            icon: "invite-user" as const,
            label: copy.serverMenuInvite,
            onPress: onOpenInvite,
            testID: `mobile-server-invite-share-${serverId}`,
          },
        ]
      : []),
    {
      active: isMuted,
      icon: "bell",
      label: copy.serverMenuMute,
      onPress: () => onToggleMute(!isMuted),
      testID: `mobile-server-mute-toggle-${serverId}`,
    },
    {
      active: isStarred,
      icon: "star",
      label: copy.serverMenuStar,
      onPress: () => onToggleStar(!isStarred),
      testID: `mobile-server-star-toggle-${serverId}`,
    },
    ...(inviteAddress
      ? [
          {
            icon: "arrow-up-tray" as const,
            label: copy.serverMenuShare,
            onPress: onShare,
            testID: `mobile-server-share-${serverId}`,
          },
        ]
      : []),
  ];

  const rows: WorkspaceServerMenuRow[] = [
    {
      icon: "info",
      label: copy.serverMenuInfo,
      onPress: onOpenProfile,
      testID: `mobile-server-profile-open-${serverId}`,
    },
    {
      icon: "members",
      label: copy.serverMenuMembers,
      onPress: onOpenMembers,
      testID: `mobile-server-members-open-${serverId}`,
      value: String(memberCount),
    },
    {
      icon: "bell",
      label: copy.serverMenuNotifications,
      onPress: () => setLayer("notifications"),
      testID: `mobile-server-notifications-open-${serverId}`,
      value: notificationLevelLabel(notificationLevel),
    },
    // The settings screen serves invite managers too (its invites row is their
    // only way in), so the entry follows the screen's own gate; the ADMIN chip
    // stays behind `canManageServer`, which is what the chip claims.
    ...(canManageServer || canManageInvites
      ? [
          {
            ...(canManageServer ? { chip: copy.serverMenuAdminChip } : {}),
            icon: "settings" as const,
            label: copy.serverMenuSettings,
            onPress: onOpenSettings,
            testID: `mobile-server-settings-open-${serverId}`,
          },
        ]
      : []),
    ...(leaveAccess === "hidden"
      ? []
      : [
          {
            danger: true,
            icon: "log-out" as const,
            label: copy.serverMenuLeave,
            onPress: leaveAccess === "owner-must-transfer" ? onOwnerTransferNotice : onLeave,
            testID: `mobile-server-leave-open-${serverId}`,
          },
        ]),
  ];

  return (
    <BottomSheet
      accessibilityLabel={copy.workspaceServerMenuAction}
      onClose={onClose}
      open={open}
      presentation={presentation}
      sizing="content"
      testID="mobile-workspace-server-menu"
    >
      <View style={styles.mobileWorkspaceMenuSheet}>
        {layer === "notifications" ? (
          <>
            <View style={styles.mobileWorkspaceMenuLayerHeader}>
              <Pressable
                accessibilityLabel={copy.serverMenuNotificationsBack}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setLayer("menu")}
                style={({ pressed }) => [
                  styles.mobileWorkspaceHeaderIconButton,
                  pressed && styles.compactListRowPressed,
                ]}
                testID="mobile-server-notifications-back"
              >
                <MobileLineIcon
                  color={theme.workspace.menuRow.icon}
                  name="back-arrow"
                  size={theme.workspace.menuRow.iconSize}
                />
              </Pressable>
              <Text style={styles.mobileWorkspaceMenuLayerTitle}>
                {copy.serverMenuNotifications}
              </Text>
            </View>
            <View style={styles.mobileWorkspaceMenuCard}>
              {NOTIFICATION_LEVELS.map((level, index) => {
                const selected = level === notificationLevel;

                return (
                  <Pressable
                    accessibilityLabel={notificationLevelLabel(level)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={level}
                    onPress={() => {
                      onSelectNotificationLevel(level);
                      setLayer("menu");
                    }}
                    style={({ pressed }) => [
                      styles.mobileWorkspaceMenuRow,
                      index > 0 && styles.mobileWorkspaceMenuRowDivider,
                      pressed && styles.compactListRowPressed,
                    ]}
                    testID={`mobile-server-notification-level-${level}-${serverId}`}
                  >
                    <Text style={styles.mobileWorkspaceMenuRowLabel}>
                      {notificationLevelLabel(level)}
                    </Text>
                    {selected ? (
                      <MobileLineIcon
                        color={theme.workspace.menuRowCheck.color}
                        name="check"
                        size={theme.workspace.menuRowCheck.size}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View style={styles.mobileWorkspaceMenuIdentity}>
              <AvatarMark
                avatarBorderRadius={theme.workspace.menuIdentity.avatarRadius}
                avatarBorderWidth={0}
                dimension={theme.workspace.menuIdentity.avatarSize}
                imageUrl={serverIconUrl}
                label={serverShortName}
                size="regular"
              />
              <View style={styles.mobileWorkspaceMenuIdentityText}>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={nameLayout.numberOfLines}
                  style={[
                    styles.mobileWorkspaceMenuIdentityName,
                    {
                      fontSize: nameLayout.fontSize,
                      letterSpacing: nameLayout.letterSpacing,
                      lineHeight: nameLayout.lineHeight,
                    },
                  ]}
                  testID="mobile-workspace-menu-server-name"
                >
                  {serverName}
                </Text>
                {inviteAddress ? (
                  <Text numberOfLines={1} style={styles.mobileWorkspaceMenuIdentityAddress}>
                    {inviteAddress}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel={copy.serverMenuViewProfile}
                accessibilityRole="button"
                hitSlop={8}
                onPress={onOpenProfile}
                style={({ pressed }) => [
                  styles.mobileWorkspaceMenuProfileAction,
                  pressed && styles.compactListRowPressed,
                ]}
                testID={`mobile-server-profile-view-${serverId}`}
              >
                <Text style={styles.mobileWorkspaceMenuProfileActionText}>
                  {copy.serverMenuViewProfile}
                </Text>
              </Pressable>
            </View>

            <View style={styles.mobileWorkspaceMenuQuickRow} testID="mobile-workspace-menu-actions">
              {quickActions.map((action) => (
                <Pressable
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                  {...(action.active === undefined
                    ? {}
                    : { accessibilityState: { selected: action.active } })}
                  key={action.testID}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    styles.mobileWorkspaceMenuQuickCard,
                    action.active === true && styles.mobileWorkspaceMenuQuickCardActive,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID={action.testID}
                >
                  <MobileLineIcon
                    color={
                      action.active === true
                        ? theme.workspace.quickActionCard.activeTint
                        : theme.workspace.quickActionCard.iconColor
                    }
                    name={action.icon}
                    size={theme.workspace.quickActionCard.icon}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.mobileWorkspaceMenuQuickLabel,
                      action.active === true && styles.mobileWorkspaceMenuQuickLabelActive,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.mobileWorkspaceMenuCard}>
              {rows.map((row, index) => (
                <Pressable
                  accessibilityLabel={row.label}
                  accessibilityRole="button"
                  key={row.testID}
                  onPress={row.onPress}
                  style={({ pressed }) => [
                    styles.mobileWorkspaceMenuRow,
                    // The destructive row closes the card without a rule above
                    // it: it is an exit, not one more entry in the list.
                    index > 0 && row.danger !== true && styles.mobileWorkspaceMenuRowDivider,
                    pressed && styles.compactListRowPressed,
                  ]}
                  testID={row.testID}
                >
                  <MobileLineIcon
                    color={row.danger ? theme.workspace.dangerRow : theme.workspace.menuRow.icon}
                    name={row.icon}
                    size={theme.workspace.menuRow.iconSize}
                  />
                  <Text
                    style={[
                      styles.mobileWorkspaceMenuRowLabel,
                      row.danger === true && styles.mobileWorkspaceMenuRowLabelDanger,
                    ]}
                  >
                    {row.label}
                  </Text>
                  {row.value ? (
                    <Text style={styles.mobileWorkspaceMenuRowValue}>{row.value}</Text>
                  ) : null}
                  {row.chip ? (
                    <View style={styles.mobileWorkspaceMenuAdminChip}>
                      <Text style={styles.mobileWorkspaceMenuAdminChipText}>{row.chip}</Text>
                    </View>
                  ) : null}
                  {row.danger ? null : (
                    <MobileLineIcon
                      color={theme.workspace.menuRow.chevron}
                      name="chevron-right"
                      size={theme.workspace.menuRow.chevronSize}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}
