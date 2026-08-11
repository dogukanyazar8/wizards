import { useState } from "react";

import type { DMParticipantRole } from "@wizards/types";

import { copy } from "../mobile-root-screen-shared";
import {
  getGroupLeaveIntent,
  getGroupReadStack,
  getMemberSheetActions,
  type MobileGroupMemberSheetAction,
  type MobileGroupMemberSource,
} from "../mobile-group-chat-model";
import { ActionSheet, OptionSheet, type SheetAction } from "./kit/sheet-primitives";

/**
 * Grup sohbetleri 2a–2f, Faz 5. The sheets more than one group surface opens.
 *
 * They live together because each one has two callers — the chat's `⋯` and the
 * settings screen both leave a group, the info card and the full roster both
 * moderate a member — and a second copy of "which actions may this viewer take"
 * is exactly the drift Faz 3 karar 7 forbids.
 */

/** §B1. The `⋯` menu behind 2d's second header button. */
export function GroupChatMenuSheet({
  muted,
  onClose,
  onLeave,
  onOpenInfo,
  onOpenSettings,
  onSearch,
  onToggleMuted,
  open,
}: {
  readonly muted: boolean;
  readonly onClose: () => void;
  readonly onLeave: () => void;
  readonly onOpenInfo: () => void;
  readonly onOpenSettings: () => void;
  readonly onSearch: () => void;
  readonly onToggleMuted: () => void;
  readonly open: boolean;
}) {
  const actions: SheetAction[] = [
    {
      icon: "information-circle-outline",
      id: "info",
      label: copy.groupInfoTitle,
      onPress: onOpenInfo,
    },
    {
      icon: muted ? "notifications-outline" : "notifications-off-outline",
      id: "mute",
      label: muted ? copy.groupInfoActionUnmute : copy.groupInfoActionMute,
      onPress: onToggleMuted,
    },
    { icon: "search-outline", id: "search", label: copy.groupInfoActionSearch, onPress: onSearch },
    {
      icon: "settings-outline",
      id: "settings",
      label: copy.groupSettingsTitle,
      onPress: onOpenSettings,
    },
    {
      destructive: true,
      icon: "exit-outline",
      id: "leave",
      label: copy.groupLeaveAction,
      onPress: onLeave,
    },
  ];

  return (
    <ActionSheet
      actions={actions}
      closeAccessibilityLabel={copy.sheetCloseAction}
      onClose={onClose}
      open={open}
      testID="mobile-group-chat-menu-sheet"
      title={copy.groupChatMenuLabel}
    />
  );
}

/** §B3. Who has read the last outgoing message, opened from the receipt row. */
export function GroupReadersSheet({
  members,
  onClose,
  open,
  readerIds,
}: {
  readonly members: readonly MobileGroupMemberSource[];
  readonly onClose: () => void;
  readonly open: boolean;
  readonly readerIds: readonly string[];
}) {
  // The stack caps at three faces; the sheet is where the rest of them are, so
  // it resolves the full list rather than reusing the capped one.
  const readers = getGroupReadStack(readerIds, members).length;
  const rows = members.filter((member) => readerIds.includes(member.userId));

  return (
    <ActionSheet
      actions={rows.map((member) => ({
        icon: "checkmark-circle-outline",
        id: member.userId,
        label: member.displayName?.trim() ? member.displayName : member.username,
        onPress: () => undefined,
        tone: "neutral" as const,
      }))}
      closeAccessibilityLabel={copy.sheetCloseAction}
      onClose={onClose}
      open={open}
      subtitle={copy.groupChatReadBy.replace("{count}", String(rows.length || readers))}
      testID="mobile-group-readers-sheet"
      title={copy.groupChatReadersTitle}
    />
  );
}

const MEMBER_ACTION_LABELS: Record<MobileGroupMemberSheetAction, () => string> = {
  demote: () => copy.groupMemberSheetDemote,
  message: () => copy.groupMemberSheetMessage,
  profile: () => copy.groupMemberSheetProfile,
  promote: () => copy.groupMemberSheetPromote,
  remove: () => copy.groupRemoveMemberAction,
};

/**
 * 2e §7. Faz 3 karar 7 is binding: an action the viewer may not take is **not in
 * the list**, never a greyed-out row that says the control exists and only the
 * tap is missing.
 */
export function GroupMemberActionsSheet({
  onClose,
  onSelect,
  open,
  target,
  viewerId,
  viewerRole,
}: {
  readonly onClose: () => void;
  readonly onSelect: (action: MobileGroupMemberSheetAction, userId: string) => void;
  readonly open: boolean;
  readonly target: MobileGroupMemberSource | null;
  readonly viewerId: string;
  readonly viewerRole: DMParticipantRole | undefined;
}) {
  if (!target) {
    return null;
  }

  const actions = getMemberSheetActions(viewerRole, target.role, target.userId === viewerId);

  return (
    <ActionSheet
      actions={actions.map((action) => ({
        destructive: action === "remove",
        id: action,
        label: MEMBER_ACTION_LABELS[action](),
        onPress: () => onSelect(action, target.userId),
      }))}
      closeAccessibilityLabel={copy.sheetCloseAction}
      onClose={onClose}
      open={open && actions.length > 0}
      subtitle={target.displayName?.trim() ? target.displayName : target.username}
      testID="mobile-group-member-sheet"
      title={copy.groupMemberSheetTitle}
    />
  );
}

/**
 * §D1.5 / V8. Leaving, with the handover in front of it when the viewer is the
 * last person who can run the group. The transfer is not a separate write: the
 * chosen member rides on the same DELETE, so the promotion cannot land without
 * the departure.
 */
export function GroupLeaveFlow({
  members,
  onClose,
  onLeave,
  open,
  viewerId,
  viewerRole,
}: {
  readonly members: readonly MobileGroupMemberSource[];
  readonly onClose: () => void;
  readonly onLeave: (input: { transferOwnershipTo?: string }) => void;
  readonly open: boolean;
  readonly viewerId: string;
  readonly viewerRole: DMParticipantRole | undefined;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const intent = getGroupLeaveIntent(viewerRole, members);
  const candidates = members.filter((member) => member.userId !== viewerId);

  return (
    <>
      <ActionSheet
        actions={[
          {
            destructive: true,
            icon: "exit-outline",
            id: "leave",
            label: copy.groupLeaveAction,
            onPress: () => {
              if (intent === "transfer") {
                setTransferOpen(true);
                return;
              }

              onLeave({});
            },
          },
        ]}
        closeAccessibilityLabel={copy.sheetCloseAction}
        onClose={onClose}
        open={open && !transferOpen}
        {...(intent === "transfer" ? { subtitle: copy.groupLeaveOwnerTransfer } : {})}
        testID="mobile-group-leave-sheet"
        title={copy.groupLeaveConfirmTitle}
        tone="danger"
      />
      <OptionSheet
        closeAccessibilityLabel={copy.sheetCloseAction}
        onClose={() => {
          setTransferOpen(false);
          onClose();
        }}
        onSelect={(userId) => {
          setTransferOpen(false);
          onLeave({ transferOwnershipTo: userId });
        }}
        open={transferOpen}
        options={candidates.map((member) => ({
          label: member.displayName?.trim() ? member.displayName : member.username,
          value: member.userId,
        }))}
        subtitle={copy.groupLeaveOwnerTransfer}
        testID="mobile-group-transfer-sheet"
        title={copy.groupLeaveTransferTitle}
      />
    </>
  );
}
