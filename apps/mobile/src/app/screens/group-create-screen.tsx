import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  GROUP_DM_NAME_MAX_LENGTH,
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type DMConversationDTO,
  type GroupCreateState,
  type GroupDMCreateRequest,
} from "@wizards/types";

import { copy } from "../mobile-root-screen-shared";
import { AvatarMark } from "../components/ui-atoms";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { useTheme } from "../providers/mobile-theme-provider";
import { useDmScreenStyles } from "./dm-screen.styles";

/** The slice of a friend the picker draws — deliberately not the whole DTO. */
export interface MobileGroupCreateFriend {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly id: string;
  readonly username: string;
}

export interface MobileGroupCreateScreenProps {
  readonly friends: readonly MobileGroupCreateFriend[];
  readonly isPending?: boolean;
  onCancel(): void;
  onCreated(conversationId: string): void;
  /** Resolves to an https icon URL, or null when the user backs out. */
  onPickPhoto?(): Promise<string | null>;
  onSubmit(input: GroupDMCreateRequest): Promise<DMConversationDTO>;
}

function getFriendLabel(friend: MobileGroupCreateFriend): string {
  return friend.displayName ?? friend.username;
}

/**
 * Faz 5 §15.2. Two steps behind one route: pick the members, then name the
 * group. Every rule about what may be picked and what may be submitted comes
 * from `@wizards/types` — this file owns pixels and nothing else, so the web
 * dialog can enforce the identical ceiling without a second implementation.
 */
export function MobileGroupCreateScreen({
  friends,
  isPending = false,
  onCancel,
  onCreated,
  onPickPhoto,
  onSubmit,
}: MobileGroupCreateScreenProps) {
  const theme = useTheme();
  const styles = useDmScreenStyles();
  const [state, setState] = useState<GroupCreateState>(createInitialGroupCreateState);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isIdentityStep = state.step === "identity";
  const isFull = isGroupSelectionFull(state);
  const busy = isPending || isSubmitting;
  const selectedFriends = state.selectedUserIds
    .map((userId) => friends.find((friend) => friend.id === userId))
    .filter((friend): friend is MobileGroupCreateFriend => Boolean(friend));

  const toggle = useCallback((userId: string) => {
    setState((current) => toggleGroupMember(current, userId));
  }, []);

  const pickPhoto = useCallback(async () => {
    if (!onPickPhoto) {
      return;
    }

    const picked = await onPickPhoto();
    if (picked) {
      setIconUrl(picked);
    }
  }, [onPickPhoto]);

  const submit = useCallback(async () => {
    if (!canSubmitGroup(state) || busy) {
      return;
    }

    setIsSubmitting(true);
    try {
      const conversation = await onSubmit(toGroupCreateRequest(state, iconUrl));
      onCreated(conversation.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [busy, iconUrl, onCreated, onSubmit, state]);

  return (
    <View style={styles.groupCreateScreen} testID="mobile-group-create-screen">
      <View style={styles.groupCreateHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.dmBackAction}
          onPress={() => {
            // Back out of the identity step first: the picked members are the
            // expensive part of the flow and leaving the route would drop them.
            if (isIdentityStep) {
              setState((current) => ({ ...current, step: "members" }));
              return;
            }

            onCancel();
          }}
          style={styles.dmBackButton}
          testID={isIdentityStep ? "mobile-group-create-back" : "mobile-group-create-cancel"}
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} />
        </Pressable>
        <Text style={styles.groupCreateHeaderTitle}>{copy.groupCreateTitle}</Text>
        <Text style={styles.groupCreateCounter} testID="mobile-group-create-counter">
          {copy.groupCreateCounter.replace("{count}", String(getGroupSelectionCount(state)))}
        </Text>
      </View>

      <Text style={[styles.groupCreateFieldLabel, styles.groupCreateStepLabel]}>
        {isIdentityStep ? copy.groupCreateIdentityStepTitle : copy.groupCreateMembersStepTitle}
      </Text>

      {isIdentityStep ? (
        <ScrollView
          contentContainerStyle={styles.groupCreateIdentityBody}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.groupCreatePhotoAction}
            onPress={pickPhoto}
            style={styles.groupCreatePhotoButton}
            testID="mobile-group-create-photo"
          >
            <View style={styles.groupCreatePhotoBadge}>
              {iconUrl ? (
                <AvatarMark dimension={54} imageUrl={iconUrl} label={state.name || "#"} />
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
              onChangeText={(name) => setState((current) => ({ ...current, name }))}
              placeholder={copy.groupCreateNamePlaceholder}
              placeholderTextColor={theme.messaging.textSecondary}
              style={styles.groupCreateNameInput}
              testID="mobile-group-create-name-input"
              value={state.name}
            />
          </View>
          <Text style={styles.groupCreateHint}>{copy.groupCreateNameHint}</Text>
        </ScrollView>
      ) : (
        <>
          {selectedFriends.length > 0 ? (
            <View style={styles.groupCreateChipStrip}>
              {selectedFriends.map((friend) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={getFriendLabel(friend)}
                  key={friend.id}
                  onPress={() => toggle(friend.id)}
                  style={styles.groupCreateChip}
                  testID={`mobile-group-create-selected-${friend.id}`}
                >
                  <Text style={styles.groupCreateChipText}>{getFriendLabel(friend)}</Text>
                  <MobileLineIcon color={theme.messaging.textSecondary} name="close" size={12} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <ScrollView keyboardShouldPersistTaps="handled">
            {friends.map((friend) => {
              const selected = state.selectedUserIds.includes(friend.id);
              // A full selection freezes the rows that are not part of it; the
              // picked ones stay live so the ceiling is never a dead end.
              const disabled = isFull && !selected;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected }}
                  disabled={disabled}
                  key={friend.id}
                  onPress={() => toggle(friend.id)}
                  style={[
                    styles.groupCreateFriendRow,
                    disabled ? styles.groupCreateFriendRowDisabled : null,
                  ]}
                  testID={`mobile-group-create-friend-${friend.id}`}
                >
                  <AvatarMark
                    identityId={friend.id}
                    imageUrl={friend.avatarUrl}
                    label={getFriendLabel(friend)}
                  />
                  <View style={styles.groupCreateFriendText}>
                    <Text numberOfLines={1} style={styles.groupCreateFriendName}>
                      {getFriendLabel(friend)}
                    </Text>
                    <Text numberOfLines={1} style={styles.groupCreateFriendUsername}>
                      {friend.username}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.groupCreateSelectionMark,
                      selected ? styles.groupCreateSelectionMarkOn : null,
                    ]}
                  >
                    {selected ? (
                      <MobileLineIcon color={theme.messaging.surface} name="check" size={13} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      <View style={styles.groupCreateFooter}>
        <Text style={styles.groupCreateHint}>
          {isFull ? copy.groupCreateLimitReached : copy.groupCreateMinimumHint}
        </Text>
        {isIdentityStep ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmitGroup(state) || busy }}
            disabled={!canSubmitGroup(state) || busy}
            onPress={submit}
            style={[
              styles.groupCreatePrimaryButton,
              !canSubmitGroup(state) || busy ? styles.groupCreatePrimaryButtonDisabled : null,
            ]}
            testID="mobile-group-create-submit"
          >
            <Text style={styles.groupCreatePrimaryButtonText}>{copy.groupCreateSubmitAction}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAdvanceToIdentity(state) }}
            disabled={!canAdvanceToIdentity(state)}
            onPress={() => setState((current) => ({ ...current, step: "identity" }))}
            style={[
              styles.groupCreatePrimaryButton,
              canAdvanceToIdentity(state) ? null : styles.groupCreatePrimaryButtonDisabled,
            ]}
            testID="mobile-group-create-next"
          >
            <Text style={styles.groupCreatePrimaryButtonText}>{copy.groupCreateNextAction}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
