import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import {
  GROUP_AVATAR_COLORS,
  toGroupAvatarInitials,
  type DMConversationDTO,
  type GroupCreateState,
} from "@wizards/types";

import { copy } from "../../mobile-root-screen-shared";
import {
  GROUP_INFO_MEMBER_PREVIEW_COUNT,
  getGroupCapabilities,
  getGroupMediaTiles,
  getGroupMemberRows,
  getGroupQuickActions,
  type MobileGroupMediaSource,
  type MobileGroupMemberRow,
  type MobileGroupMemberSheetAction,
  type MobileGroupMemberSource,
} from "../../mobile-group-chat-model";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { AvatarMark } from "../../components/ui-atoms";
import { GroupMemberActionsSheet } from "../../components/group-management-sheets";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { formatMobileRelativeTime } from "../../../locale/mobile-relative-time";
import { useGroupChatStyles, useGroupPressStyle } from "../group-chat.styles";
import { MobileGroupIdentityStep } from "../group-create/identity-step";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §C — 2e, grup bilgisi.
 *
 * Presentational: the conversation, the media page and the capability answers
 * arrive as props, so this screen is rendered whole in a component test without
 * a query client. Every measurement comes from `theme.groupChat`.
 */

export interface MobileGroupInfoScreenProps {
  readonly conversation: DMConversationDTO | null;
  readonly media: { readonly items: readonly MobileGroupMediaSource[]; readonly total: number };
  readonly viewerId: string;
  onBack(): void;
  onInvite(): void;
  onMemberAction(action: MobileGroupMemberSheetAction, userId: string): void;
  onOpenMedia(): void;
  onOpenMembers(): void;
  onOpenPinnedMessage(): void;
  /** Resolves to the uploaded URL; null when cancelled or refused. */
  onPickPhoto?(): Promise<string | null>;
  onSaveIdentity(patch: {
    avatarColor: string;
    description: string;
    iconUrl: string | null;
    name: string;
  }): Promise<unknown>;
  onSearch(): void;
  onStartVideoCall(): void;
  onToggleMuted(): void;
}

/** 2e §2's `6 üye · 12 Mart'ta oluşturuldu`. */
function formatCreatedAtMeta(
  memberCount: number,
  createdAt: string | null,
  locale: string,
): string {
  const date = createdAt
    ? new Date(createdAt).toLocaleDateString(locale, { day: "numeric", month: "long" })
    : "";

  return copy.groupInfoCreatedAt
    .replace("{count}", String(memberCount))
    .replace("{date}", date)
    .trim();
}

export function MobileGroupInfoScreen({
  conversation,
  media,
  onBack,
  onInvite,
  onMemberAction,
  onOpenMedia,
  onOpenMembers,
  onOpenPinnedMessage,
  onPickPhoto,
  onSaveIdentity,
  onSearch,
  onStartVideoCall,
  onToggleMuted,
  viewerId,
}: MobileGroupInfoScreenProps) {
  const styles = useGroupChatStyles();
  const theme = useTheme();
  const tokens = theme.groupChat;
  const pressStyle = useGroupPressStyle();
  const { locale } = useMobileLocaleRuntime();
  const [sheetTarget, setSheetTarget] = useState<MobileGroupMemberSource | null>(null);
  const [isEditing, setEditing] = useState(false);

  const members = useMemo<readonly MobileGroupMemberSource[]>(
    () => conversation?.participants ?? [],
    [conversation?.participants],
  );
  const capabilities = getGroupCapabilities(conversation?.role, conversation?.permissions);
  const rows = useMemo(() => getGroupMemberRows(members, viewerId), [members, viewerId]);
  const quickActions = getGroupQuickActions(capabilities);
  const tiles = getGroupMediaTiles(media.items, media.total);
  const memberCount = conversation?.memberCount ?? members.length;
  const title =
    conversation?.name?.trim() ??
    (conversation ? formatCreatedAtMeta(memberCount, null, locale) : "");

  if (isEditing && conversation) {
    return (
      <MobileGroupIdentityEditor
        conversation={conversation}
        onCancel={() => setEditing(false)}
        onSave={async (patch) => {
          await onSaveIdentity(patch);
          setEditing(false);
        }}
        {...(onPickPhoto ? { onPickPhoto } : {})}
        viewerId={viewerId}
      />
    );
  }

  return (
    <View style={styles.screen} testID="mobile-group-info-screen">
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityLabel={copy.dmBackAction}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onBack}
          style={styles.stepHeaderBack}
          testID="mobile-group-info-back"
        >
          <MobileLineIcon
            color={tokens.stepHeader.backIconColor}
            name="back-arrow"
            size={tokens.stepHeader.backIcon}
          />
        </Pressable>
        <Text numberOfLines={1} style={styles.detailHeaderTitle}>
          {copy.groupInfoTitle}
        </Text>
        {/* §C1.1: the pencil exists only for somebody who may use it. */}
        {capabilities.canEditInfo ? (
          <Pressable
            accessibilityLabel={copy.groupInfoEditAction}
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={({ pressed }) => [styles.detailHeaderAction, pressed && pressStyle]}
            testID="mobile-group-info-edit"
          >
            <MobileLineIcon color={tokens.chatHeader.actionIconColor} name="edit" size={17} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={[styles.detailBody, styles.detailScrollContent]}
        style={{ flex: 1 }}
      >
        <View style={styles.infoIdentity}>
          <View
            style={[
              styles.infoAvatar,
              { backgroundColor: conversation?.avatarColor ?? tokens.bottomBar.buttonBg },
            ]}
          >
            {conversation?.iconUrl ? (
              <Image source={{ uri: conversation.iconUrl }} style={styles.mediaTileImage} />
            ) : (
              <Text style={styles.infoAvatarInitials}>
                {toGroupAvatarInitials({ displayName: title, username: title || "?" })}
              </Text>
            )}
          </View>
          <View style={styles.infoIdentityText}>
            <Text style={styles.infoName} testID="mobile-group-info-name">
              {title}
            </Text>
            <Text style={styles.infoMeta}>
              {formatCreatedAtMeta(memberCount, conversation?.lastMessageAt ?? null, locale)}
            </Text>
          </View>
        </View>

        <View style={styles.quickActionRow}>
          {quickActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action}
              onPress={
                action === "mute"
                  ? onToggleMuted
                  : action === "video"
                    ? onStartVideoCall
                    : action === "search"
                      ? onSearch
                      : onInvite
              }
              style={({ pressed }) => [styles.quickAction, pressed && pressStyle]}
              testID={`mobile-group-info-action-${action}`}
            >
              <MobileLineIcon
                color={tokens.quickAction.iconColor}
                name={
                  action === "mute"
                    ? conversation?.notifyLevel === "NONE"
                      ? "bell"
                      : "bell-off"
                    : action === "video"
                      ? "video"
                      : action === "search"
                        ? "search"
                        : "person-plus"
                }
                size={tokens.quickAction.icon}
              />
              <Text style={styles.quickActionLabel}>
                {action === "mute"
                  ? conversation?.notifyLevel === "NONE"
                    ? copy.groupInfoActionUnmute
                    : copy.groupInfoActionMute
                  : action === "video"
                    ? copy.groupInfoActionVideo
                    : action === "search"
                      ? copy.groupInfoActionSearch
                      : copy.groupInfoActionInvite}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* §C1.4: no pin, no card — never an empty one. */}
        {conversation?.pinnedMessage ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenPinnedMessage}
            style={({ pressed }) => [styles.pinnedCard, pressed && pressStyle]}
            testID="mobile-group-info-pinned"
          >
            <MobileLineIcon color={tokens.pinnedStrip.pinIconColor} name="pin" size={16} />
            <View style={styles.pinnedStripText}>
              <Text style={styles.pinnedStripLabel}>{copy.groupInfoPinnedMessage}</Text>
              <Text numberOfLines={1} style={styles.pinnedStripPreview}>
                {`${conversation.pinnedMessage.authorName}: ${conversation.pinnedMessage.excerpt}`}
              </Text>
            </View>
            <MobileLineIcon
              color={tokens.settingsCard.chevronColor}
              name="chevron-right"
              size={tokens.settingsCard.chevron}
            />
          </Pressable>
        ) : null}

        <View style={styles.fieldLabelRow}>
          <Text style={styles.listSectionLabel}>
            {copy.groupInfoMedia} <Text style={styles.listSectionCount}>{media.total}</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenMedia}
            testID="mobile-group-info-media-all"
          >
            <Text style={styles.listSectionAction}>{copy.groupInfoSeeAll}</Text>
          </Pressable>
        </View>
        <View style={styles.mediaRow}>
          {tiles.map((tile) => (
            <View
              key={tile.id}
              style={[
                styles.mediaTile,
                tile.kind === "file" && styles.mediaTileFile,
                tile.kind === "overflow" && styles.mediaTileOverflow,
              ]}
              testID={`mobile-group-info-media-${tile.kind}`}
            >
              {tile.kind === "overflow" ? (
                <Text style={styles.mediaTileOverflowLabel}>{`+${tile.count}`}</Text>
              ) : tile.kind === "file" ? (
                <>
                  <MobileLineIcon
                    color={tokens.mediaTile.fileIconColor}
                    name="file"
                    size={tokens.mediaTile.fileIcon}
                  />
                  <Text style={styles.mediaTileFileLabel}>
                    {copy.groupInfoMediaFileCount.replace("{count}", String(tile.count))}
                  </Text>
                </>
              ) : tile.thumbnailUrl ? (
                <Image source={{ uri: tile.thumbnailUrl }} style={styles.mediaTileImage} />
              ) : (
                <MobileLineIcon
                  color={tokens.mediaTile.iconColor}
                  name={tile.kind === "video" ? "video" : "image"}
                  size={tokens.mediaTile.icon}
                />
              )}
            </View>
          ))}
        </View>

        <View style={styles.fieldLabelRow}>
          <Text style={styles.listSectionLabel}>
            {copy.groupInfoMembers} <Text style={styles.listSectionCount}>{memberCount}</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenMembers}
            testID="mobile-group-info-members-all"
          >
            <Text style={styles.listSectionAction}>{copy.groupInfoSeeAll}</Text>
          </Pressable>
        </View>
        <View style={styles.memberCard}>
          {/* §C1.6: the add row exists only for somebody who may add. */}
          {capabilities.canAddMembers ? (
            <Pressable
              accessibilityRole="button"
              onPress={onInvite}
              style={({ pressed }) => [
                styles.memberRow,
                styles.memberRowDivider,
                pressed && pressStyle,
              ]}
              testID="mobile-group-info-add-member"
            >
              <View style={styles.memberAddIcon}>
                <MobileLineIcon
                  color={tokens.memberRow.addIconColor}
                  name="plus"
                  size={tokens.memberRow.addIcon}
                />
              </View>
              <Text style={styles.memberAddLabel}>{copy.groupAddMemberAction}</Text>
            </Pressable>
          ) : null}
          {rows.slice(0, GROUP_INFO_MEMBER_PREVIEW_COUNT).map((row, index, shown) => (
            <GroupMemberCardRow
              key={row.member.userId}
              onOpenActions={() => setSheetTarget(row.member)}
              row={row}
              showDivider={index < shown.length - 1}
            />
          ))}
        </View>
      </ScrollView>
      <GroupMemberActionsSheet
        onClose={() => setSheetTarget(null)}
        onSelect={(action, userId) => {
          setSheetTarget(null);
          onMemberAction(action, userId);
        }}
        open={sheetTarget !== null}
        target={sheetTarget}
        viewerId={viewerId}
        viewerRole={conversation?.role}
      />
    </View>
  );
}

/**
 * 2e §6's row, shared with the full roster behind `Tümü`. The right edge is a
 * role chip **or** the `⋯`: an admin is named, and a member is actionable.
 */
export function GroupMemberCardRow({
  onOpenActions,
  row,
  showDivider,
}: {
  onOpenActions(): void;
  readonly row: MobileGroupMemberRow;
  readonly showDivider: boolean;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();
  const { locale } = useMobileLocaleRuntime();
  const label = row.member.displayName?.trim() ? row.member.displayName : row.member.username;
  const isAdmin = row.role === "OWNER" || row.role === "ADMIN";

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onOpenActions}
      style={({ pressed }) => [
        styles.memberRow,
        showDivider && styles.memberRowDivider,
        pressed && pressStyle,
      ]}
      testID={`mobile-group-member-row-${row.member.userId}`}
    >
      <View style={styles.memberAvatarWrap}>
        <AvatarMark
          avatarBorderRadius={tokens.memberRow.avatarRadius}
          dimension={tokens.memberRow.avatarSize}
          fallbackTextStyle={styles.memberAvatarText}
          identityId={row.member.userId}
          imageUrl={row.member.avatarUrl ?? null}
          label={label}
        />
        {row.online ? <View style={styles.memberDot} /> : null}
      </View>
      <View style={styles.memberText}>
        <View style={styles.memberNameRow}>
          <Text numberOfLines={1} style={styles.memberName}>
            {label}
          </Text>
          {row.isSelf ? (
            <View style={styles.selfChip}>
              <Text style={styles.selfChipText}>{copy.groupRoleYou}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.memberSub}>
          {row.subtitle === "creator"
            ? copy.groupSystemCreated.replace("{actor}", "").trim()
            : row.subtitle === "lastSeen" && row.member.lastSeenAt
              ? copy.groupCreateLastSeen.replace(
                  "{time}",
                  formatMobileRelativeTime(row.member.lastSeenAt, locale),
                )
              : row.member.username}
        </Text>
      </View>
      {isAdmin ? (
        <View
          style={[
            styles.roleChip,
            row.role === "OWNER" ? styles.roleChipOwner : styles.roleChipAdmin,
          ]}
        >
          <Text
            style={[
              styles.roleChipText,
              row.role === "OWNER" ? styles.roleChipOwnerText : styles.roleChipAdminText,
            ]}
          >
            {row.role === "OWNER" ? copy.groupRoleOwner : copy.groupRoleAdmin}
          </Text>
        </View>
      ) : (
        <MobileLineIcon
          color={tokens.memberRow.more}
          name="dots-horizontal"
          size={tokens.memberRow.moreIcon}
        />
      )}
    </Pressable>
  );
}

/**
 * §C2. The pencil's page. It is 2c's identity block in `edit` mode — one form,
 * one set of counters, one live hint — with a save bar instead of "İleri".
 */
function MobileGroupIdentityEditor({
  conversation,
  onCancel,
  onPickPhoto,
  onSave,
  viewerId,
}: {
  readonly conversation: DMConversationDTO;
  onCancel(): void;
  /**
   * Resolves to the uploaded URL, or null when the reader backed out or the
   * upload failed. It used to be declared `void`, so the picked photo was
   * uploaded and then dropped on the floor — the tile never changed.
   */
  onPickPhoto?(): Promise<string | null>;
  onSave(patch: {
    avatarColor: string;
    description: string;
    iconUrl: string | null;
    name: string;
  }): Promise<void>;
  readonly viewerId: string;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();
  const [iconUrl, setIconUrl] = useState<string | null>(conversation.iconUrl);
  const [busy, setBusy] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const pickPhoto = onPickPhoto
    ? async () => {
        setIsUploadingPhoto(true);
        try {
          const picked = await onPickPhoto();
          if (picked) {
            setIconUrl(picked);
          }
        } finally {
          setIsUploadingPhoto(false);
        }
      }
    : null;
  const [state, setState] = useState<GroupCreateState>({
    // P2: the fallback is the palette's own first swatch, never a literal.
    avatarColor: (conversation.avatarColor ??
      GROUP_AVATAR_COLORS[0]) as GroupCreateState["avatarColor"],
    description: conversation.description ?? "",
    historyVisibility: conversation.historyVisibility ?? "LAST_30D",
    inviteEnabled: false,
    name: conversation.name ?? "",
    permAddMembers: conversation.permissions?.addMembers ?? "ALL",
    selectedUserIds: [],
    step: "identity",
  });
  const viewerLabel =
    conversation.participants.find((participant) => participant.userId === viewerId)?.displayName ??
    "";

  return (
    <View style={styles.screen} testID="mobile-group-info-editor">
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityLabel={copy.dmBackAction}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onCancel}
          style={styles.stepHeaderBack}
          testID="mobile-group-info-editor-cancel"
        >
          <MobileLineIcon
            color={tokens.stepHeader.backIconColor}
            name="back-arrow"
            size={tokens.stepHeader.backIcon}
          />
        </Pressable>
        <Text numberOfLines={1} style={styles.detailHeaderTitle}>
          {copy.groupInfoEditAction}
        </Text>
      </View>
      <MobileGroupIdentityStep
        iconUrl={iconUrl}
        isUploadingPhoto={isUploadingPhoto}
        mode="edit"
        onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
        onEditMembers={onCancel}
        {...(pickPhoto ? { onPickPhoto: () => void pickPhoto() } : {})}
        onRemovePhoto={() => setIconUrl(null)}
        selectedFriends={[]}
        state={state}
        viewerLabel={viewerLabel}
      />
      <View style={styles.bottomBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void onSave({
              avatarColor: state.avatarColor,
              description: state.description,
              iconUrl,
              name: state.name,
            }).finally(() => setBusy(false));
          }}
          style={({ pressed }) => [styles.bottomBarButton, pressed && pressStyle]}
          testID="mobile-group-info-editor-save"
        >
          <Text style={styles.bottomBarLabel}>{copy.groupSaveAction}</Text>
        </Pressable>
      </View>
    </View>
  );
}
