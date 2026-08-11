import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  GROUP_AVATAR_COLORS,
  GROUP_DM_DESCRIPTION_MAX_LENGTH,
  GROUP_DM_NAME_MAX_LENGTH,
  canSubmitGroup,
  toGroupAvatarInitials,
  type GroupAvatarColor,
  type GroupCreateState,
  type GroupHistoryVisibility,
  type GroupPermissionLevel,
} from "@wizards/types";

import { copy } from "../../mobile-root-screen-shared";
import {
  buildGroupNameHint,
  formatHistoryLabel,
  getGroupDescriptionCounter,
  getGroupNameCounter,
} from "../../mobile-group-chat-model";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { AvatarMark } from "../../components/ui-atoms";
import { OptionSheet } from "../../components/kit/sheet-primitives";
import { Toggle } from "../../components/kit/toggle";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useGroupChatStyles, useGroupPressStyle } from "../group-chat.styles";
import { getFriendLabel, type MobileGroupCreateFriend } from "./member-step";

type IdentitySheet = "history" | "permission" | null;

const HISTORY_OPTIONS: readonly GroupHistoryVisibility[] = ["NONE", "LAST_24H", "LAST_30D", "ALL"];
const PERMISSION_OPTIONS: readonly GroupPermissionLevel[] = ["ALL", "ADMINS"];

/**
 * 2c — the second step. Everything it collects travels on the same
 * `GroupCreateState` the picker writes, so "Düzenle" can walk back to step one
 * and return without losing a colour or a description.
 */
export function MobileGroupIdentityStep({
  iconUrl,
  mode = "create",
  onChange,
  onEditMembers,
  onPickPhoto,
  onRemovePhoto,
  selectedFriends,
  state,
  viewerLabel,
}: {
  readonly iconUrl: string | null;
  /**
   * Faz 5 §C2. 2e's pencil reuses this block rather than writing a second form:
   * `edit` keeps the identity half (avatar, colour, name, description) and drops
   * the member strip and the KATILIM card, which 2e and 2f already own.
   */
  readonly mode?: "create" | "edit";
  onChange(patch: Partial<GroupCreateState>): void;
  onEditMembers(): void;
  onPickPhoto?(): void;
  onRemovePhoto(): void;
  readonly selectedFriends: readonly MobileGroupCreateFriend[];
  readonly state: GroupCreateState;
  /** The "Sen" tile's own initials; the viewer is never in `selectedUserIds`. */
  readonly viewerLabel: string;
}) {
  const theme = useTheme();
  const styles = useGroupChatStyles();
  const groupTokens = theme.groupChat;
  const { locale } = useMobileLocaleRuntime();
  const [sheet, setSheet] = useState<IdentitySheet>(null);
  const [nameFocused, setNameFocused] = useState(false);

  const nameCounter = getGroupNameCounter(state.name);
  const descriptionCounter = getGroupDescriptionCounter(state.description);
  /**
   * §4.4. The hint is not a sentence about the members — it is the name the
   * group will actually get, produced by the rule the server uses, so the two
   * can never disagree.
   */
  const derivedName = buildGroupNameHint(selectedFriends.map(getFriendLabel), locale);
  const avatarLabel = state.name.trim() || derivedName;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.identityBody}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        <View style={styles.identityRow}>
          <View style={styles.identityAvatarWrap}>
            {iconUrl ? (
              <AvatarMark
                avatarBorderRadius={groupTokens.identityAvatar.radius}
                dimension={groupTokens.identityAvatar.size}
                imageUrl={iconUrl}
                label={avatarLabel}
              />
            ) : (
              <View
                style={[styles.identityAvatar, { backgroundColor: state.avatarColor }]}
                testID="mobile-group-create-avatar"
              >
                <Text style={styles.identityAvatarInitials}>
                  {toGroupAvatarInitials({ displayName: avatarLabel, username: avatarLabel })}
                </Text>
              </View>
            )}
            <Pressable
              accessibilityLabel={copy.groupCreatePhotoAction}
              accessibilityRole="button"
              onPress={onPickPhoto}
              style={styles.identityCameraButton}
              testID="mobile-group-create-photo"
            >
              <MobileLineIcon
                color={groupTokens.identityAvatar.cameraIconColor}
                name="camera"
                size={groupTokens.identityAvatar.cameraIcon}
              />
            </Pressable>
          </View>
          <View style={styles.identityColorColumn}>
            {iconUrl ? (
              // 2c §2: a picked photo is the avatar, so the swatches have
              // nothing left to colour and give way to the way back.
              <Pressable
                accessibilityRole="button"
                onPress={onRemovePhoto}
                testID="mobile-group-create-remove-photo"
              >
                <Text style={styles.removePhotoAction}>{copy.groupCreateRemovePhoto}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.fieldLabel}>{copy.groupCreateColor}</Text>
                <View style={styles.colorSwatchRow}>
                  {GROUP_AVATAR_COLORS.map((color: GroupAvatarColor) => {
                    const selected = color === state.avatarColor;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={color}
                        onPress={() => onChange({ avatarColor: color })}
                        style={
                          selected ? [styles.colorSwatchSelectedRing, { borderColor: color }] : null
                        }
                        testID={`mobile-group-create-color-${color.replace("#", "")}`}
                      >
                        <View
                          style={[
                            styles.colorSwatch,
                            { backgroundColor: color },
                            selected ? styles.colorSwatchSelected : null,
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </View>

        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>{copy.groupCreateNameLabel}</Text>
          <Text
            style={[styles.fieldCounter, nameCounter.over ? styles.fieldCounterOver : null]}
            testID="mobile-group-create-name-counter"
          >
            {nameCounter.label}
          </Text>
        </View>
        <View style={[styles.nameField, nameFocused ? styles.nameFieldFocused : null]}>
          <TextInput
            accessibilityLabel={copy.groupCreateNameLabel}
            maxLength={GROUP_DM_NAME_MAX_LENGTH}
            onBlur={() => setNameFocused(false)}
            onChangeText={(name) => onChange({ name })}
            onFocus={() => setNameFocused(true)}
            placeholder={copy.groupCreateNamePlaceholder}
            placeholderTextColor={groupTokens.formField.counter}
            style={styles.nameInput}
            testID="mobile-group-create-name-input"
            value={state.name}
          />
        </View>
        {state.name.trim().length === 0 ? (
          <View style={styles.hintRow} testID="mobile-group-create-hint">
            <MobileLineIcon
              color={groupTokens.formHint.iconColor}
              name="info"
              size={groupTokens.formHint.icon}
            />
            <Text style={styles.hintText}>
              {(() => {
                const [before, after] = copy.groupCreateNameHintTemplate.split("{names}");
                return (
                  <>
                    {before}
                    <Text style={styles.hintStrong}>{derivedName}</Text>
                    {after}
                  </>
                );
              })()}
            </Text>
          </View>
        ) : null}

        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>
            {copy.groupCreateDescriptionLabel}{" "}
            <Text style={styles.fieldLabelOptional}>{copy.groupCreateDescriptionOptional}</Text>
          </Text>
          <Text
            style={[styles.fieldCounter, descriptionCounter.over ? styles.fieldCounterOver : null]}
            testID="mobile-group-create-description-counter"
          >
            {descriptionCounter.label}
          </Text>
        </View>
        <View style={styles.descriptionField}>
          <TextInput
            accessibilityLabel={copy.groupCreateDescriptionLabel}
            maxLength={GROUP_DM_DESCRIPTION_MAX_LENGTH}
            multiline
            onChangeText={(description) => onChange({ description })}
            placeholder={copy.groupCreateDescriptionPlaceholder}
            placeholderTextColor={groupTokens.formTextArea.placeholder}
            style={styles.descriptionInput}
            testID="mobile-group-create-description-input"
            value={state.description}
          />
        </View>

        {/*
         * Faz 5 §C2. The member strip and the KATILIM card belong to the
         * create flow: in edit mode 2e already lists the roster and 2f owns
         * the permissions, so drawing them here would be a second place to
         * change the same three settings.
         */}
        {mode === "create" ? (
          <>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>
                {copy.groupCreateMembers}{" "}
                <Text style={styles.fieldLabelOptional}>{selectedFriends.length + 1}</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onEditMembers}
                testID="mobile-group-create-edit-members"
              >
                <Text style={styles.listSectionAction}>{copy.groupCreateEdit}</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.memberStripRow}>
                <View style={styles.memberStripCell}>
                  <AvatarMark
                    avatarBorderRadius={groupTokens.memberStrip.tileRadius}
                    dimension={groupTokens.memberStrip.tileSize}
                    fallbackTextStyle={styles.memberStripTileText}
                    identityId="viewer"
                    imageUrl={null}
                    label={viewerLabel}
                  />
                  <Text style={[styles.memberStripLabel, styles.memberStripLabelSelf]}>
                    {copy.groupCreateYou}
                  </Text>
                </View>
                {selectedFriends.map((friend) => (
                  <View key={friend.id} style={styles.memberStripCell}>
                    <AvatarMark
                      avatarBorderRadius={groupTokens.memberStrip.tileRadius}
                      dimension={groupTokens.memberStrip.tileSize}
                      fallbackTextStyle={styles.memberStripTileText}
                      identityId={friend.id}
                      imageUrl={friend.avatarUrl}
                      label={getFriendLabel(friend)}
                    />
                    <Text numberOfLines={1} style={styles.memberStripLabel}>
                      {getFriendLabel(friend)}
                    </Text>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={onEditMembers}
                  style={styles.memberStripCell}
                  testID="mobile-group-create-add-members"
                >
                  <View style={styles.memberStripAddTile}>
                    <MobileLineIcon
                      color={groupTokens.memberStrip.addIconColor}
                      name="plus"
                      size={groupTokens.memberStrip.addIcon}
                    />
                  </View>
                  <Text style={[styles.memberStripLabel, styles.memberStripLabelAdd]}>
                    {copy.groupCreateAdd}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>{copy.groupCreateJoin}</Text>
            </View>
            <View style={styles.settingsCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSheet("permission")}
                style={[styles.settingsRow, styles.settingsRowDivider]}
                testID="mobile-group-create-perm-row"
              >
                <MobileLineIcon
                  color={groupTokens.settingsCard.iconColor}
                  name="person-plus"
                  size={groupTokens.settingsCard.icon}
                />
                <View style={styles.settingsRowText}>
                  <Text style={styles.settingsRowTitle}>{copy.groupPermAddMembers}</Text>
                </View>
                <Text style={styles.settingsRowValue} testID="mobile-group-create-perm-value">
                  {state.permAddMembers === "ALL"
                    ? copy.groupCreatePermAllShort
                    : copy.groupPermValueAdmins}
                </Text>
                <MobileLineIcon
                  color={groupTokens.settingsCard.chevronColor}
                  name="chevron-right"
                  size={groupTokens.settingsCard.chevron}
                />
              </Pressable>
              <View style={[styles.settingsRow, styles.settingsRowDivider]}>
                <MobileLineIcon
                  color={groupTokens.settingsCard.iconColor}
                  name="link"
                  size={groupTokens.settingsCard.icon}
                />
                <View style={styles.settingsRowText}>
                  <Text style={styles.settingsRowTitle}>{copy.groupInviteLink}</Text>
                  <Text style={styles.settingsRowSubtitle}>{copy.groupInviteLinkHint}</Text>
                </View>
                {/*
                 * The shared kit switch rather than a hand-drawn track: one control
                 * for every toggle in the app is a repo contract, and it costs two
                 * pixels against HTML 261's 44x26.
                 */}
                <Toggle
                  accessibilityLabel={copy.groupInviteLink}
                  onValueChange={(inviteEnabled) => onChange({ inviteEnabled })}
                  testID="mobile-group-create-invite-toggle"
                  value={state.inviteEnabled}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSheet("history")}
                style={styles.settingsRow}
                testID="mobile-group-create-history-row"
              >
                <MobileLineIcon
                  color={groupTokens.settingsCard.iconColor}
                  name="clock"
                  size={groupTokens.settingsCard.icon}
                />
                <View style={styles.settingsRowText}>
                  <Text style={styles.settingsRowTitle}>{copy.groupHistoryVisibility}</Text>
                </View>
                <Text style={styles.settingsRowValue} testID="mobile-group-create-history-value">
                  {formatHistoryLabel(state.historyVisibility, copy)}
                </Text>
                <MobileLineIcon
                  color={groupTokens.settingsCard.chevronColor}
                  name="chevron-right"
                  size={groupTokens.settingsCard.chevron}
                />
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>

      <OptionSheet
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          onChange({ permAddMembers: value });
          setSheet(null);
        }}
        open={sheet === "permission"}
        options={PERMISSION_OPTIONS.map((value) => ({
          label: value === "ALL" ? copy.groupCreatePermAllShort : copy.groupPermValueAdmins,
          value,
        }))}
        selectedValue={state.permAddMembers}
        testID="mobile-group-create-perm-sheet"
        title={copy.groupPermAddMembers}
      />
      <OptionSheet
        onClose={() => setSheet(null)}
        onSelect={(value) => {
          onChange({ historyVisibility: value });
          setSheet(null);
        }}
        open={sheet === "history"}
        options={HISTORY_OPTIONS.map((value) => ({
          label: formatHistoryLabel(value, copy),
          value,
        }))}
        selectedValue={state.historyVisibility}
        testID="mobile-group-create-history-sheet"
        title={copy.groupHistoryVisibility}
      />
    </>
  );
}

/** 2c §8's footer. */
export function MobileGroupIdentityStepFooter({
  busy,
  onSubmit,
  state,
}: {
  readonly busy: boolean;
  onSubmit(): void;
  readonly state: GroupCreateState;
}) {
  const styles = useGroupChatStyles();
  const pressedStyle = useGroupPressStyle();
  const enabled = canSubmitGroup(state) && !busy;

  return (
    <View style={styles.bottomBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.bottomBarButton,
          enabled ? null : styles.bottomBarButtonDisabled,
          pressed && enabled ? pressedStyle : null,
        ]}
        testID="mobile-group-create-submit"
      >
        <Text style={styles.bottomBarLabel}>{copy.groupCreateSubmit}</Text>
      </Pressable>
    </View>
  );
}
