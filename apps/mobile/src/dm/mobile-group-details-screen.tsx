import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_NAME_MAX_LENGTH,
  type MobileDMGroupMember,
} from "@wizards/types";

import { AvatarMark } from "../app/components/ui-atoms";
import { DestructiveConfirmationSheet, Toggle } from "../app/components/kit";
import { copy } from "../app/mobile-root-screen-shared";
import { useDmScreenStyles } from "../app/screens/dm-screen.styles";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";

export interface MobileGroupDetailsFriend {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly id: string;
  readonly username: string;
}

export interface MobileGroupDetailsScreenProps {
  readonly conversation: {
    readonly iconUrl: string | null;
    readonly id: string;
    readonly name: string | null;
    readonly ownerId: string | null;
  };
  readonly currentUserId: string;
  /** Candidates for "add member"; already-joined ids are filtered out here. */
  readonly friends?: readonly MobileGroupDetailsFriend[];
  readonly isMuted?: boolean;
  readonly isPending?: boolean;
  readonly members: readonly MobileDMGroupMember[];
  onAddMembers(userIds: readonly string[]): void | Promise<unknown>;
  onBack(): void;
  /** K8: hiding drops the conversation from the inbox until it moves again. */
  onHide?(): void | Promise<unknown>;
  onLeave(): void | Promise<unknown>;
  onSetMuted?(muted: boolean): void | Promise<unknown>;
  onOpenSharedMedia?(): void;
  /** Owner-only. Resolves to an https icon URL, or null when the user backs out. */
  onPickPhoto?(): Promise<string | null>;
  onRemoveMember(userId: string): void | Promise<unknown>;
  /** Owner-only metadata write. Absent keys mean "leave as is". */
  onUpdate?(patch: { iconUrl?: string | null; name?: string | null }): void | Promise<unknown>;
}

function getMemberLabel(member: {
  readonly displayName: string | null;
  readonly username: string;
}): string {
  return member.displayName ?? member.username;
}

/**
 * Faz 5 §17.1. A group has no counterpart to describe, so this is not the 1:1
 * profile page with pieces hidden — it is its own surface: the roster, who runs
 * it, and the two exits (remove someone, or leave). Mutual servers, the 1:1
 * profile blocks and the call buttons are absent by construction, not toggled
 * off.
 */
export function MobileGroupDetailsScreen({
  conversation,
  currentUserId,
  friends = [],
  isMuted = false,
  isPending = false,
  members,
  onAddMembers,
  onBack,
  onHide,
  onLeave,
  onSetMuted,
  onOpenSharedMedia,
  onPickPhoto,
  onRemoveMember,
  onUpdate,
}: MobileGroupDetailsScreenProps) {
  const styles = useDmScreenStyles();
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Faz 7: the picker adds several friends in one write. The server enforces the
  // ceiling too (`GROUP_FULL`); this only stops a request that cannot succeed.
  const [pickedUserIds, setPickedUserIds] = useState<readonly string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [draftName, setDraftName] = useState<string | null>(null);

  const isOwner = conversation.ownerId !== null && conversation.ownerId === currentUserId;
  const title = conversation.name ?? members.map(getMemberLabel).join(", ");
  const candidates = friends.filter((friend) => !members.some((member) => member.id === friend.id));
  const remainingSeats = Math.max(0, GROUP_DM_MAX_PARTICIPANTS - members.length);
  const canPickMore = pickedUserIds.length < remainingSeats;
  // A 30-friend list is a scroll, not a choice.
  const visibleCandidates = candidateSearch.trim()
    ? candidates.filter((friend) =>
        `${friend.displayName ?? friend.username} ${friend.username}`
          .toLocaleLowerCase()
          .includes(candidateSearch.trim().toLocaleLowerCase()),
      )
    : candidates;

  return (
    <View style={styles.groupCreateScreen} testID="mobile-group-details-screen">
      <View style={styles.groupCreateHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.dmBackAction}
          onPress={onBack}
          style={styles.dmBackButton}
          testID="mobile-group-details-back"
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} />
        </Pressable>
        <Text numberOfLines={1} style={styles.groupCreateHeaderTitle}>
          {title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.groupCreateIdentityBody}>
        {/*
         * K4 sahip-yönetir: the same block is the identity for everyone and the
         * editor for the owner. A member sees the photo and the name as text;
         * only the owner gets a picker and a field.
         */}
        {isOwner && onUpdate ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.groupCreatePhotoAction}
              disabled={isPending || !onPickPhoto}
              onPress={async () => {
                const picked = await onPickPhoto?.();
                if (picked) {
                  await onUpdate({ iconUrl: picked });
                }
              }}
              style={styles.groupCreatePhotoButton}
              testID="mobile-group-photo"
            >
              <View style={styles.groupCreatePhotoBadge}>
                {conversation.iconUrl ? (
                  <AvatarMark dimension={54} imageUrl={conversation.iconUrl} label={title || "#"} />
                ) : (
                  <MobileLineIcon color={theme.messaging.textSecondary} name="camera" size={20} />
                )}
              </View>
              <Text style={styles.groupCreatePhotoLabel}>{copy.groupCreatePhotoAction}</Text>
            </Pressable>

            <Text style={styles.groupCreateFieldLabel}>{copy.groupCreateNameLabel}</Text>
            <View style={styles.groupCreateNameField}>
              <TextInput
                accessibilityLabel={copy.groupCreateNameLabel}
                maxLength={GROUP_DM_NAME_MAX_LENGTH}
                onChangeText={setDraftName}
                placeholder={copy.groupCreateNamePlaceholder}
                placeholderTextColor={theme.messaging.textSecondary}
                style={styles.groupCreateNameInput}
                testID="mobile-group-name-input"
                value={draftName ?? conversation.name ?? ""}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.groupSaveAction}
              // A blank field is "clear the name", which is a real edit; only an
              // untouched field has nothing to send.
              disabled={isPending || draftName === null}
              onPress={async () => {
                const trimmed = (draftName ?? "").trim();
                await onUpdate({ name: trimmed.length > 0 ? trimmed : null });
                setDraftName(null);
              }}
              style={[
                styles.groupCreatePrimaryButton,
                isPending || draftName === null ? styles.groupCreatePrimaryButtonDisabled : null,
              ]}
              testID="mobile-group-name-save"
            >
              <Text style={styles.groupCreatePrimaryButtonText}>{copy.groupSaveAction}</Text>
            </Pressable>
            <Text style={styles.groupCreateHint}>{copy.groupCreateNameHint}</Text>
          </>
        ) : (
          <View style={styles.groupCreatePhotoButton}>
            <AvatarMark dimension={56} imageUrl={conversation.iconUrl} label={title || "#"} />
            <Text numberOfLines={2} style={styles.groupCreateFriendName}>
              {title}
            </Text>
          </View>
        )}

        {onSetMuted ? (
          <View style={styles.groupCreateFriendRow}>
            <MobileLineIcon
              color={theme.messaging.textSecondary}
              name={isMuted ? "bell-off" : "bell"}
              size={18}
            />
            <Text style={[styles.groupCreateFriendName, styles.groupCreateFriendText]}>
              {copy.dmMutedLabel}
            </Text>
            <Toggle
              accessibilityLabel={copy.dmMutedLabel}
              onValueChange={(next) => void onSetMuted(next)}
              readOnly={isPending}
              testID="mobile-group-mute"
              value={isMuted}
            />
          </View>
        ) : null}

        {onHide ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.groupHideAction}
            disabled={isPending}
            onPress={() => void onHide()}
            style={styles.groupCreateFriendRow}
            testID="mobile-group-hide"
          >
            <MobileLineIcon color={theme.messaging.textSecondary} name="close" size={18} />
            <Text style={styles.groupCreateFriendName}>{copy.groupHideAction}</Text>
          </Pressable>
        ) : null}

        {onOpenSharedMedia ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.sharedMediaTitle}
            onPress={onOpenSharedMedia}
            style={styles.groupCreateFriendRow}
            testID="mobile-group-shared-media"
          >
            <Text style={styles.groupCreateFriendName}>{copy.sharedMediaTitle}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.groupCreateFieldLabel}>{copy.groupMembersTitle}</Text>
        {members.map((member) => (
          <View key={member.id} style={styles.groupCreateFriendRow}>
            <AvatarMark
              identityId={member.id}
              imageUrl={member.avatarUrl}
              label={getMemberLabel(member)}
            />
            <View style={styles.groupCreateFriendText}>
              <Text numberOfLines={1} style={styles.groupCreateFriendName}>
                {getMemberLabel(member)}
              </Text>
              <Text numberOfLines={1} style={styles.groupCreateFriendUsername}>
                {member.isOwner ? copy.groupOwnerBadge : member.username}
              </Text>
            </View>
            {/* Only the owner removes people, and never themselves — leaving is
                the same write but it is its own, clearly-labelled action. */}
            {isOwner && member.id !== currentUserId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.groupRemoveMemberAction}
                disabled={isPending}
                onPress={() => void onRemoveMember(member.id)}
                testID={`mobile-group-remove-user-${member.id}`}
              >
                <MobileLineIcon color={theme.status.dangerOnBase} name="close" size={16} />
              </Pressable>
            ) : null}
          </View>
        ))}

        {isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.groupAddMemberAction}
            onPress={() => setPickerOpen((current) => !current)}
            style={styles.groupCreateFriendRow}
            testID="mobile-group-add-member"
          >
            <MobileLineIcon color={theme.messaging.accent} name="person-plus" size={18} />
            <Text style={styles.groupCreateFriendName}>{copy.groupAddMemberAction}</Text>
          </Pressable>
        ) : null}

        {isOwner && pickerOpen ? (
          <>
            <View style={styles.groupCreateNameField}>
              <TextInput
                accessibilityLabel={copy.dmFriendSearchPlaceholder}
                onChangeText={setCandidateSearch}
                placeholder={copy.dmFriendSearchPlaceholder}
                placeholderTextColor={theme.messaging.textSecondary}
                style={styles.groupCreateNameInput}
                testID="mobile-group-add-search"
                value={candidateSearch}
              />
            </View>
            {visibleCandidates.map((friend) => {
              const picked = pickedUserIds.includes(friend.id);
              const disabled = !picked && !canPickMore;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected: picked }}
                  disabled={disabled}
                  key={friend.id}
                  onPress={() =>
                    setPickedUserIds((current) =>
                      current.includes(friend.id)
                        ? current.filter((userId) => userId !== friend.id)
                        : [...current, friend.id],
                    )
                  }
                  style={[
                    styles.groupCreateFriendRow,
                    disabled ? styles.groupCreateFriendRowDisabled : null,
                  ]}
                  testID={`mobile-group-add-user-${friend.id}`}
                >
                  <AvatarMark
                    identityId={friend.id}
                    imageUrl={friend.avatarUrl}
                    label={friend.displayName ?? friend.username}
                  />
                  <View style={styles.groupCreateFriendText}>
                    <Text numberOfLines={1} style={styles.groupCreateFriendName}>
                      {friend.displayName ?? friend.username}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.groupCreateSelectionMark,
                      picked ? styles.groupCreateSelectionMarkOn : null,
                    ]}
                  >
                    {picked ? (
                      <MobileLineIcon color={theme.messaging.surface} name="check" size={13} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.groupAddMemberAction}
              accessibilityState={{ disabled: isPending || pickedUserIds.length === 0 }}
              disabled={isPending || pickedUserIds.length === 0}
              onPress={() => {
                const userIds = pickedUserIds;
                setPickerOpen(false);
                setPickedUserIds([]);
                void onAddMembers(userIds);
              }}
              style={[
                styles.groupCreatePrimaryButton,
                isPending || pickedUserIds.length === 0
                  ? styles.groupCreatePrimaryButtonDisabled
                  : null,
              ]}
              testID="mobile-group-add-confirm"
            >
              <Text style={styles.groupCreatePrimaryButtonText}>{copy.groupSaveAction}</Text>
            </Pressable>
            <Text style={styles.groupCreateHint}>
              {canPickMore ? copy.groupCreateMinimumHint : copy.groupCreateLimitReached}
            </Text>
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.groupLeaveAction}
          disabled={isPending}
          onPress={() => setLeaveOpen(true)}
          style={styles.groupCreateFriendRow}
          testID="mobile-group-leave"
        >
          <MobileLineIcon color={theme.status.dangerOnBase} name="leave" size={18} />
          <Text style={styles.groupCreateFriendName}>{copy.groupLeaveAction}</Text>
        </Pressable>
      </ScrollView>

      <DestructiveConfirmationSheet
        body={copy.groupLeaveConfirmTitle}
        busy={isPending}
        confirmLabel={copy.groupLeaveAction}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={async () => {
          await onLeave();
          setLeaveOpen(false);
        }}
        open={leaveOpen}
        testID="mobile-group-leave-confirm"
        title={copy.groupLeaveConfirmTitle}
      />
    </View>
  );
}
