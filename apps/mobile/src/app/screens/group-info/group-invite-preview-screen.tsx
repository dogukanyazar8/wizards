import { Image, Pressable, Text, View } from "react-native";
import {
  getGroupAvatarColorHsl,
  mapLegacyGroupAvatarColor,
  toGroupAvatarInitials,
  type GroupInvitePreviewDTO,
} from "@wizards/types";

import { copy } from "../../mobile-root-screen-shared";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useGroupChatStyles, useGroupPressStyle } from "../group-chat.styles";

/**
 * Grup sohbetleri 2a–2f, K2's last mile: what `/g/<code>` opens on the phone.
 *
 * Faz 2 shipped the endpoints and the web page, Faz 3 pointed the deep link at a
 * placeholder that rendered `null`. Closing the package with a white screen
 * behind a link the settings sheet hands out was not an option, so this is the
 * preview: the stranger's view of the group (name, avatar, member *count*) and
 * one button. There is deliberately no roster — that is B2's rule, enforced by
 * the endpoint too.
 */

/** The eight join branches, in the copy each of them owns. */
function resolveBlockedReason(preview: GroupInvitePreviewDTO): string | null {
  if (preview.alreadyMember) {
    return copy.groupInviteAlreadyMember;
  }

  switch (preview.reason) {
    case "disabled":
      return copy.groupInviteDisabled;
    case "expired":
    case "exhausted":
      return copy.groupInviteExpired;
    case "full":
      return copy.groupInviteFull;
    case "blocked":
      return copy.groupErrorNoPermission;
    case null:
    case undefined:
      return null;
  }
}

export function MobileGroupInvitePreviewScreen({
  busy = false,
  onBack,
  onJoin,
  preview,
}: {
  readonly busy?: boolean;
  onBack(): void;
  onJoin(): void;
  readonly preview: GroupInvitePreviewDTO | null;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();
  const blocked = preview ? resolveBlockedReason(preview) : copy.groupInviteNotFound;
  const label = preview?.name ?? "";
  const canJoin = preview?.joinable === true && !preview.alreadyMember && !busy;
  const avatarColor = preview?.avatarColor
    ? getGroupAvatarColorHsl(mapLegacyGroupAvatarColor(preview.avatarColor))
    : tokens.bottomBar.buttonBg;

  return (
    <View style={styles.screen} testID="mobile-group-invite-preview-screen">
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityLabel={copy.dmBackAction}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onBack}
          style={styles.stepHeaderBack}
          testID="mobile-group-invite-preview-back"
        >
          <MobileLineIcon
            color={tokens.stepHeader.backIconColor}
            name="back-arrow"
            size={tokens.stepHeader.backIcon}
          />
        </Pressable>
        <Text numberOfLines={1} style={styles.detailHeaderTitle}>
          {copy.groupInvitePreviewTitle}
        </Text>
      </View>
      <View style={[styles.detailBody, { flex: 1 }]}>
        <View style={styles.infoIdentity}>
          <View style={[styles.infoAvatar, { backgroundColor: avatarColor }]}>
            {preview?.iconUrl ? (
              <Image source={{ uri: preview.iconUrl }} style={styles.mediaTileImage} />
            ) : (
              <Text style={styles.infoAvatarInitials}>
                {toGroupAvatarInitials({ displayName: label, username: label || "?" })}
              </Text>
            )}
          </View>
          <View style={styles.infoIdentityText}>
            <Text style={styles.infoName} testID="mobile-group-invite-preview-name">
              {label}
            </Text>
            <Text style={styles.infoMeta}>
              {copy.groupInvitePreviewMembers.replace("{count}", String(preview?.memberCount ?? 0))}
            </Text>
          </View>
        </View>
        {blocked ? (
          <Text style={styles.filterEmptyState} testID="mobile-group-invite-preview-blocked">
            {blocked}
          </Text>
        ) : null}
      </View>
      <View style={styles.bottomBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: !canJoin }}
          disabled={!canJoin}
          onPress={onJoin}
          style={({ pressed }) => [
            styles.bottomBarButton,
            !canJoin && styles.bottomBarButtonDisabled,
            pressed && canJoin && pressStyle,
          ]}
          testID="mobile-group-invite-preview-join"
        >
          <Text style={styles.bottomBarLabel}>{copy.groupInviteJoin}</Text>
        </Pressable>
      </View>
    </View>
  );
}
