import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type {
  DMConversationDTO,
  DMNotifyLevel,
  GroupAction,
  GroupDisappearingWindow,
  GroupInviteDTO,
  GroupPermissionLevel,
} from "@wizards/types";

import { copy } from "../../mobile-root-screen-shared";
import {
  MOBILE_GROUP_NOTIFY_LEVELS,
  formatDisappearingLabel,
  getGroupCapabilities,
  getGroupPermissionRows,
  type MobileGroupMemberSource,
} from "../../mobile-group-chat-model";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { GroupLeaveFlow } from "../../components/group-management-sheets";
import { ActionSheet, OptionSheet } from "../../components/kit/sheet-primitives";
import { Toggle } from "../../components/kit/toggle";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useGroupChatStyles, useGroupPressStyle } from "../group-chat.styles";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §D — 2f, grup ayarları ve izinler.
 *
 * Presentational. The two rules that decide what is on screen are §11.3/30's:
 * the permissions block is **absent** for a member who cannot change it (not
 * disabled), and leaving asks — with a handover in front of it for the last
 * owner.
 */

const DISAPPEARING_OPTIONS: readonly GroupDisappearingWindow[] = ["OFF", "H24", "D7", "D90"];
const PERMISSION_OPTIONS: readonly GroupPermissionLevel[] = ["ALL", "ADMINS"];

const PERMISSION_TITLES: Record<GroupAction, () => string> = {
  addMembers: () => copy.groupPermAddMembers,
  editInfo: () => copy.groupPermEditInfo,
  pinMessage: () => copy.groupPermPinMessage,
  sendMessage: () => copy.groupPermSendMessage,
};

const NOTIFY_TITLES: Record<DMNotifyLevel, () => string> = {
  ALL: () => copy.groupNotifyAll,
  MENTIONS: () => copy.groupNotifyMentions,
  NONE: () => copy.groupNotifyNone,
};

const NOTIFY_HINTS: Partial<Record<DMNotifyLevel, () => string>> = {
  MENTIONS: () => copy.groupNotifyMentionsHint,
  NONE: () => copy.groupNotifyNoneHint,
};

export interface MobileGroupSettingsScreenProps {
  readonly conversation: DMConversationDTO | null;
  readonly hidden: boolean;
  readonly invite: GroupInviteDTO | null;
  readonly viewerId: string;
  onBack(): void;
  onCopyInvite(url: string): void;
  onLeave(input: { transferOwnershipTo?: string }): void;
  onRotateInvite(): void;
  onSetDisappearing(window: GroupDisappearingWindow): void;
  onSetHidden(hidden: boolean): void;
  onSetInviteEnabled(enabled: boolean): void;
  onSetNotifyLevel(level: DMNotifyLevel): void;
  onSetPermission(action: GroupAction, level: GroupPermissionLevel): void;
  onShareInvite(url: string): void;
}

type SettingsSheet =
  | { readonly kind: "disappearing" }
  | { readonly kind: "invite" }
  | { readonly kind: "leave" }
  | { readonly kind: "permission"; readonly action: GroupAction }
  | null;

export function MobileGroupSettingsScreen({
  conversation,
  hidden,
  invite,
  onBack,
  onCopyInvite,
  onLeave,
  onRotateInvite,
  onSetDisappearing,
  onSetHidden,
  onSetInviteEnabled,
  onSetNotifyLevel,
  onSetPermission,
  onShareInvite,
  viewerId,
}: MobileGroupSettingsScreenProps) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();
  const [sheet, setSheet] = useState<SettingsSheet>(null);
  const [pendingWindow, setPendingWindow] = useState<GroupDisappearingWindow | null>(null);

  const capabilities = getGroupCapabilities(conversation?.role, conversation?.permissions);
  const permissionRows = getGroupPermissionRows(conversation?.permissions);
  const notifyLevel = conversation?.notifyLevel ?? "ALL";
  const members: readonly MobileGroupMemberSource[] = conversation?.participants ?? [];
  const inviteUrl = invite?.displayUrl ?? invite?.url ?? null;
  // §11.3/30: not disabled — absent. `canEditInfo` is the gate the server uses
  // for the very same writes.
  const showPermissions = capabilities.canEditInfo && permissionRows.length > 0;

  return (
    <View style={styles.screen} testID="mobile-group-settings-screen">
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityLabel={copy.dmBackAction}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onBack}
          style={styles.stepHeaderBack}
          testID="mobile-group-settings-back"
        >
          <MobileLineIcon
            color={tokens.stepHeader.backIconColor}
            name="back-arrow"
            size={tokens.stepHeader.backIcon}
          />
        </Pressable>
        <View style={styles.settingsHeaderText}>
          <Text numberOfLines={1} style={styles.detailHeaderTitle}>
            {copy.groupSettingsTitle}
          </Text>
          <Text numberOfLines={1} style={styles.stepHeaderSubtitle}>
            {conversation?.name ?? ""}
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.detailBody, styles.detailScrollContent]}
        style={{ flex: 1 }}
      >
        <View style={styles.fieldLabelRow}>
          <Text style={styles.listSectionLabel}>{copy.groupSettingsNotifications}</Text>
        </View>
        <View style={styles.settingsCard}>
          {MOBILE_GROUP_NOTIFY_LEVELS.map((level, index) => {
            const hint = NOTIFY_HINTS[level];

            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: notifyLevel === level }}
                key={level}
                onPress={() => onSetNotifyLevel(level)}
                style={({ pressed }) => [
                  styles.radioRow,
                  index < MOBILE_GROUP_NOTIFY_LEVELS.length - 1 && styles.settingsRowDivider,
                  pressed && pressStyle,
                ]}
                testID={`mobile-group-notify-${level}`}
              >
                <View
                  style={[styles.radioMark, notifyLevel === level && styles.radioMarkSelected]}
                  testID={`mobile-group-notify-${level}-mark`}
                >
                  {notifyLevel === level ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.settingsRowText}>
                  <Text style={styles.radioTitle}>{NOTIFY_TITLES[level]()}</Text>
                  {hint ? <Text style={styles.radioHint}>{hint()}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {showPermissions ? (
          <>
            <View style={styles.fieldLabelRow}>
              <View style={styles.listSectionRow}>
                <Text style={styles.listSectionLabel}>{copy.groupSettingsPermissions}</Text>
                <View style={styles.adminChip}>
                  <Text style={styles.adminChipText}>{copy.groupRoleAdmin}</Text>
                </View>
              </View>
            </View>
            <View style={styles.settingsCard} testID="mobile-group-permissions-card">
              {permissionRows.map((row, index) => (
                <Pressable
                  accessibilityRole="button"
                  key={row.action}
                  onPress={() => setSheet({ action: row.action, kind: "permission" })}
                  style={({ pressed }) => [
                    styles.settingsRow,
                    index < permissionRows.length - 1 && styles.settingsRowDivider,
                    pressed && pressStyle,
                  ]}
                  testID={`mobile-group-permission-${row.action}`}
                >
                  <View style={styles.settingsRowText}>
                    <Text style={styles.settingsRowTitle}>{PERMISSION_TITLES[row.action]()}</Text>
                  </View>
                  <Text style={styles.settingsRowValue}>
                    {row.level === "ALL" ? copy.groupPermValueAll : copy.groupPermValueAdmins}
                  </Text>
                  <MobileLineIcon
                    color={tokens.settingsCard.chevronColor}
                    name="chevron-right"
                    size={tokens.settingsCard.chevron}
                  />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.fieldLabelRow}>
          <Text style={styles.listSectionLabel}>{copy.groupSettingsPrivacy}</Text>
        </View>
        <View style={styles.settingsCard}>
          <Pressable
            accessibilityRole="button"
            disabled={!inviteUrl}
            onPress={() => setSheet({ kind: "invite" })}
            style={({ pressed }) => [
              styles.settingsRow,
              styles.settingsRowDivider,
              pressed && inviteUrl && pressStyle,
            ]}
            testID="mobile-group-invite-row"
          >
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsRowTitle}>{copy.groupInviteLink}</Text>
              {/* K2: closed means no code at all, so there is nothing to print. */}
              {inviteUrl ? (
                <Text
                  numberOfLines={1}
                  style={styles.settingsRowSubtitle}
                  testID="mobile-group-invite-url"
                >
                  {inviteUrl}
                </Text>
              ) : (
                <Text style={styles.settingsRowSubtitle}>{copy.groupInviteLinkHint}</Text>
              )}
            </View>
            <Toggle
              accessibilityLabel={copy.groupInviteLink}
              disabled={!capabilities.canEditInfo}
              onValueChange={onSetInviteEnabled}
              testID="mobile-group-invite-toggle"
              value={invite?.enabled === true}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!capabilities.canEditInfo}
            onPress={() => setSheet({ kind: "disappearing" })}
            style={({ pressed }) => [
              styles.settingsRow,
              styles.settingsRowDivider,
              pressed && capabilities.canEditInfo && pressStyle,
            ]}
            testID="mobile-group-disappearing-row"
          >
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsRowTitle}>{copy.groupDisappearing}</Text>
            </View>
            <Text style={styles.settingsRowValue} testID="mobile-group-disappearing-value">
              {formatDisappearingLabel(conversation?.disappearingAfter ?? "OFF", copy)}
            </Text>
            <MobileLineIcon
              color={tokens.settingsCard.chevronColor}
              name="chevron-right"
              size={tokens.settingsCard.chevron}
            />
          </Pressable>
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsRowTitle}>{copy.groupHideAction}</Text>
              <Text style={styles.settingsRowSubtitle}>{copy.groupHideChatHint}</Text>
            </View>
            <Toggle
              accessibilityLabel={copy.groupHideAction}
              onValueChange={onSetHidden}
              testID="mobile-group-hide-toggle"
              value={hidden}
            />
          </View>
        </View>

        <View style={styles.dangerCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheet({ kind: "leave" })}
            style={({ pressed }) => [styles.dangerRow, pressed && pressStyle]}
            testID="mobile-group-leave-row"
          >
            <MobileLineIcon
              color={tokens.dangerRow.iconColor}
              name="log-out"
              size={tokens.dangerRow.icon}
            />
            <Text style={styles.dangerLabel}>{copy.groupLeaveAction}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <OptionSheet
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          if (sheet?.kind === "permission") {
            onSetPermission(sheet.action, value);
          }
          setSheet(null);
        }}
        open={sheet?.kind === "permission"}
        options={PERMISSION_OPTIONS.map((value) => ({
          label: value === "ALL" ? copy.groupPermValueAll : copy.groupPermValueAdmins,
          value,
        }))}
        {...(sheet?.kind === "permission" && conversation?.permissions
          ? { selectedValue: conversation.permissions[sheet.action] }
          : {})}
        testID="mobile-group-permission-sheet"
        title={sheet?.kind === "permission" ? PERMISSION_TITLES[sheet.action]() : ""}
      />

      {/* V6: the window applies to new messages only, and the warning says so
       *before* the write rather than after it. */}
      <OptionSheet
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          setSheet(null);
          setPendingWindow(value);
        }}
        open={sheet?.kind === "disappearing"}
        options={DISAPPEARING_OPTIONS.map((value) => ({
          label: formatDisappearingLabel(value, copy),
          value,
        }))}
        selectedValue={conversation?.disappearingAfter ?? "OFF"}
        subtitle={copy.groupSettingsDisappearingWarning}
        testID="mobile-group-disappearing-sheet"
        title={copy.groupDisappearing}
      />
      <ActionSheet
        actions={[
          {
            id: "confirm",
            label: pendingWindow ? formatDisappearingLabel(pendingWindow, copy) : "",
            onPress: () => {
              if (pendingWindow) {
                onSetDisappearing(pendingWindow);
              }
              setPendingWindow(null);
            },
          },
        ]}
        onClose={() => setPendingWindow(null)}
        open={pendingWindow !== null}
        subtitle={copy.groupSettingsDisappearingWarning}
        testID="mobile-group-disappearing-confirm"
        title={copy.groupDisappearing}
      />

      <ActionSheet
        actions={[
          {
            icon: "copy-outline",
            id: "copy",
            label: copy.groupInviteCopy,
            onPress: () => inviteUrl && onCopyInvite(inviteUrl),
          },
          {
            icon: "share-outline",
            id: "share",
            label: copy.groupInviteShare,
            onPress: () => inviteUrl && onShareInvite(inviteUrl),
          },
          {
            destructive: true,
            icon: "refresh-outline",
            id: "rotate",
            label: copy.groupInviteRotate,
            description: copy.groupInviteRotateConfirm,
            onPress: onRotateInvite,
          },
        ]}
        onClose={() => setSheet(null)}
        open={sheet?.kind === "invite" && inviteUrl !== null}
        subtitle={inviteUrl ?? ""}
        testID="mobile-group-invite-sheet"
        title={copy.groupInviteLink}
      />

      <GroupLeaveFlow
        members={members}
        onClose={() => setSheet(null)}
        onLeave={(input) => {
          setSheet(null);
          onLeave(input);
        }}
        open={sheet?.kind === "leave"}
        viewerId={viewerId}
        viewerRole={conversation?.role}
      />
    </View>
  );
}
