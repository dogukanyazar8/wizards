import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useMemo } from "react";
import type { MobileVoiceChannelState } from "@wizards/types";
import {
  Ionicons,
  Pressable,
  Text,
  View,
  copy,
  formatMobileUnreadCount,
  getMobileChannelPriority,
  type MobileVisibleWorkspaceChannelSection,
  type MobileWorkspaceChannelSummary,
} from "../mobile-root-screen-shared";
import { AvatarMark } from "../components/ui-atoms";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import type { MobileWorkspaceLayout } from "../providers/mobile-workspace-layout-provider";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { formatMobileChannelRowTimestamp } from "../../locale/mobile-date-separator";
import {
  getMobileCategoryHeaderState,
  getMobileChannelRowPreview,
  getMobileChannelRowTone,
  getMobileVoiceRowPresence,
} from "../mobile-sunucular-model";
import { useHomeScreenStyles } from "./home-screen.styles";
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";

/** Stacked avatars on the live voice row; more people than this read as a count. */
const VOICE_ROW_AVATAR_LIMIT = 3;
const EMPTY_VOICE_STATES: readonly MobileVoiceChannelState[] = Object.freeze([]);

type WorkspaceChannelListItem =
  | {
      readonly channel: MobileWorkspaceChannelSummary;
      readonly id: string;
      readonly kind: "channel";
    }
  | {
      readonly id: string;
      readonly kind: "section";
      readonly section: MobileVisibleWorkspaceChannelSection;
    };

export function WorkspaceChannelSectionList({
  canEditCategories = false,
  isCollapseDisabled,
  layout,
  onEditSection,
  onOpenChannel,
  onToggleSection,
  sections,
  selectedChannelId,
  unreadSectionIds,
  voiceStates = EMPTY_VOICE_STATES,
}: {
  canEditCategories?: boolean;
  isCollapseDisabled: boolean;
  layout: MobileWorkspaceLayout;
  onEditSection?(sectionId: string, sectionName: string): void;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onToggleSection(sectionId: string): void;
  sections: MobileVisibleWorkspaceChannelSection[];
  selectedChannelId: string | null;
  /**
   * Which categories still hold an unread channel. A collapsed section arrives
   * here with an empty `channels` array — it has already been folded away — so
   * the dot that admits it is hiding something has to be told from outside.
   */
  unreadSectionIds?: ReadonlySet<string>;
  voiceStates?: readonly MobileVoiceChannelState[];
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const isRailLayout = layout === "rail";
  // The caller already memoizes `sections`; rebuilding the flattened array here
  // discarded that work and made FlashList treat an unchanged feed as new data.
  const items = useMemo<WorkspaceChannelListItem[]>(
    () =>
      sections.flatMap((section) => [
        { id: `section:${section.id}`, kind: "section" as const, section },
        ...section.channels.map((channel) => ({
          channel,
          id: `channel:${channel.id}`,
          kind: "channel" as const,
        })),
      ]),
    [sections],
  );
  // Presence changes frequently. Index once per snapshot instead of scanning
  // the full voice-state array for every visible channel row.
  const voiceStateByChannelId = useMemo(
    () => new Map(voiceStates.map((state) => [state.channelId, state] as const)),
    [voiceStates],
  );
  const renderItem = useCallback(
    ({ item }: { item: WorkspaceChannelListItem }) => {
      if (item.kind === "channel") {
        return (
          <WorkspaceChannelCompactRow
            channel={item.channel}
            isSelected={item.channel.id === selectedChannelId}
            layout={layout}
            onOpenChannel={onOpenChannel}
            voiceState={voiceStateByChannelId.get(item.channel.id) ?? null}
          />
        );
      }

      const { section } = item;
      const headerState = getMobileCategoryHeaderState(section, section.isCollapsed);
      const canEditSection =
        canEditCategories && onEditSection !== undefined && section.id !== "ungrouped";

      return (
        <View
          style={
            isRailLayout
              ? styles.mobileWorkspaceSectionHeaderRail
              : styles.mobileWorkspaceSectionHeader
          }
        >
          <Pressable
            accessibilityLabel={`${section.name} ${
              section.isCollapsed
                ? copy.workspaceSectionExpandAction
                : copy.workspaceSectionCollapseAction
            }`}
            accessibilityRole="button"
            accessibilityState={{ disabled: isCollapseDisabled, expanded: !section.isCollapsed }}
            disabled={isCollapseDisabled}
            hitSlop={12}
            onLongPress={
              canEditSection ? () => onEditSection?.(section.id, section.name) : undefined
            }
            onPress={() => onToggleSection(section.id)}
            style={({ pressed }) => [
              styles.mobileWorkspaceSectionHeaderToggle,
              pressed && styles.compactListRowPressed,
            ]}
            testID={`mobile-workspace-section-${section.id}`}
          >
            <MobileLineIcon
              color={
                headerState.isCollapsed
                  ? theme.workspace.categoryCollapsed.chevron
                  : theme.workspace.categoryLabel.color
              }
              name={headerState.isCollapsed ? "chevron-right" : "chevron-down"}
              size={11}
            />
            <Text
              style={[
                isRailLayout
                  ? styles.mobileWorkspaceSectionTitleRail
                  : styles.mobileWorkspaceSectionTitle,
                headerState.isCollapsed && styles.mobileWorkspaceSectionCollapsedLabel,
              ]}
            >
              {section.name}
            </Text>
            <Text
              style={[
                styles.mobileWorkspaceSectionCountText,
                headerState.isCollapsed && styles.mobileWorkspaceSectionCollapsedCount,
              ]}
              testID={`mobile-workspace-section-count-${section.id}`}
            >
              {section.totalChannelCount}
            </Text>
            {headerState.isCollapsed && unreadSectionIds?.has(section.id) === true ? (
              <View
                style={styles.mobileWorkspaceSectionCollapsedDot}
                testID={`mobile-workspace-section-unread-${section.id}`}
              />
            ) : null}
          </Pressable>
        </View>
      );
    },
    [
      canEditCategories,
      isCollapseDisabled,
      isRailLayout,
      layout,
      onEditSection,
      onOpenChannel,
      onToggleSection,
      selectedChannelId,
      styles,
      theme.workspace.categoryCollapsed.chevron,
      theme.workspace.categoryLabel.color,
      unreadSectionIds,
      voiceStateByChannelId,
    ],
  );

  if (sections.length === 0) {
    return <Text style={styles.contractDescription}>{copy.workspaceNoChannels}</Text>;
  }

  return (
    <FlashList
      contentContainerStyle={
        isRailLayout ? styles.mobileWorkspaceSectionListRail : styles.mobileWorkspaceSectionList
      }
      data={items}
      // Section headers and channel rows are structurally different; typing them
      // keeps FlashList from recycling one shape into the other.
      getItemType={(item) => item.kind}
      keyExtractor={(item) => item.id}
      onLoad={mobileListLoadHandlers.workspaceChannels}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.mobileWorkspaceSectionListViewport}
      testID="mobile-workspace-channel-list"
    />
  );
}

export const WorkspaceChannelCompactRow = memo(function WorkspaceChannelCompactRow({
  channel,
  isSelected,
  layout = "compact",
  onOpenChannel,
  voiceState,
}: {
  channel: MobileWorkspaceChannelSummary;
  isSelected: boolean;
  layout?: MobileWorkspaceLayout;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  voiceState: MobileVoiceChannelState | null;
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const isRailLayout = layout === "rail";
  const priority = getMobileChannelPriority(channel);
  const tone = getMobileChannelRowTone(channel, isSelected);
  const participants = channel.type === "VOICE" ? (voiceState?.participants ?? []) : [];

  // Live voice channel: a bordered card with the live presence, stacked participant
  // avatars and a green Katıl pill that connects straight to the room.
  if (channel.type === "VOICE" && participants.length > 0) {
    const presence = getMobileVoiceRowPresence(participants, layout);
    const presenceLabel =
      presence.kind === "count"
        ? `${presence.count} ${copy.workspacePeopleSuffix}`
        : presence.names.join(", ");

    return (
      <Pressable
        accessibilityLabel={`${copy.openWorkspaceChannelAction}: ${channel.name}, ${participants.length} ${copy.voiceParticipantsSpeaking}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        onPress={() => onOpenChannel(channel)}
        style={({ pressed }) => [
          styles.mobileWorkspaceLiveRow,
          pressed && styles.compactListRowPressed,
        ]}
        testID="mobile-workspace-channel-voice"
      >
        <View
          style={[
            isRailLayout
              ? styles.mobileWorkspaceChannelIconRail
              : styles.mobileWorkspaceChannelIcon,
            styles.mobileWorkspaceChannelIconVoice,
          ]}
          testID={`mobile-voice-state-${channel.id}`}
        >
          <MobileLineIcon
            color={theme.status.visualText}
            name="speaker"
            size={isRailLayout ? 14 : 15}
          />
        </View>
        <View style={styles.mobileWorkspaceLiveText}>
          <Text
            style={[
              styles.mobileWorkspaceLiveName,
              isRailLayout && styles.mobileWorkspaceLiveNameRail,
            ]}
            numberOfLines={1}
          >
            {channel.name}
          </Text>
          <Text style={styles.mobileWorkspaceVoicePresenceText} numberOfLines={1}>
            {copy.workspaceLiveLabel} · {presenceLabel}
          </Text>
        </View>
        {presence.kind === "count" ? (
          <View style={styles.mobileWorkspaceVoiceAvatars}>
            {participants.slice(0, VOICE_ROW_AVATAR_LIMIT).map((participant, index) => (
              <AvatarMark
                avatarBorderColor={theme.surface.card}
                avatarBorderRadius={11}
                avatarBorderWidth={2}
                dimension={22}
                imageUrl={participant.avatarUrl}
                key={participant.userId}
                label={participant.displayName ?? participant.username}
                size="small"
                style={index === 0 ? undefined : { marginLeft: -7 }}
              />
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={`${copy.workspaceJoinVoiceAction}: ${channel.name}`}
          accessibilityRole="button"
          hitSlop={12}
          // Opening a voice channel already connects and pushes the room, so the
          // pill is the same action with a direct label.
          onPress={() => onOpenChannel(channel)}
          style={({ pressed }) => [
            styles.mobileWorkspaceJoinPill,
            pressed && styles.compactListRowPressed,
          ]}
          testID={`mobile-workspace-voice-join-${channel.id}`}
        >
          <Text style={styles.mobileWorkspaceJoinPillText}>{copy.workspaceJoinVoiceAction}</Text>
        </Pressable>
      </Pressable>
    );
  }

  // 6a: an empty voice room is a plain row — no card, no Katıl pill. Tapping it
  // connects, which is the same thing the pill did on the live variant.
  const isEmptyVoiceRow = channel.type === "VOICE" && participants.length === 0;
  const preview = getMobileChannelRowPreview(channel);
  const timestamp =
    !isEmptyVoiceRow && channel.lastMessage
      ? formatMobileChannelRowTimestamp(channel.lastMessage.createdAt, locale)
      : "";

  return (
    <Pressable
      accessibilityLabel={`${copy.openWorkspaceChannelAction}: ${channel.name}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={() => onOpenChannel(channel)}
      style={({ pressed }) => [
        isRailLayout ? styles.mobileWorkspaceChannelRowRail : styles.mobileWorkspaceChannelRow,
        isSelected &&
          (isRailLayout
            ? styles.mobileWorkspaceChannelRowRailActive
            : styles.mobileWorkspaceChannelRowActive),
        pressed && styles.compactListRowPressed,
      ]}
      testID={`mobile-workspace-channel-${channel.type.toLowerCase()}`}
    >
      <View
        style={[
          isRailLayout ? styles.mobileWorkspaceChannelIconRail : styles.mobileWorkspaceChannelIcon,
          channel.type === "TEXT" && isSelected && styles.mobileWorkspaceChannelIconSelected,
          channel.type === "VOICE" && !isEmptyVoiceRow && styles.mobileWorkspaceChannelIconVoice,
          isEmptyVoiceRow && styles.mobileWorkspaceVoiceEmptyIcon,
        ]}
        testID={channel.type === "TEXT" ? "mobile-workspace-text-channel-icon" : undefined}
      >
        {channel.type === "TEXT" ? (
          <Text
            style={[
              isRailLayout
                ? styles.mobileWorkspaceChannelHashRail
                : styles.mobileWorkspaceChannelHash,
              (tone === "mention" || tone === "unread") && styles.mobileWorkspaceChannelHashStrong,
              isSelected &&
                (isRailLayout
                  ? styles.mobileWorkspaceChannelHashRailActive
                  : styles.mobileWorkspaceChannelHashActive),
            ]}
            testID="mobile-workspace-text-channel-hash"
          >
            #
          </Text>
        ) : (
          <MobileLineIcon
            color={isEmptyVoiceRow ? theme.workspace.voiceRowEmpty.icon : theme.status.visualText}
            name="speaker"
            size={isRailLayout ? 14 : 15}
          />
        )}
      </View>
      <View
        style={
          isRailLayout ? styles.mobileWorkspaceChannelTextRail : styles.mobileWorkspaceChannelText
        }
      >
        <Text
          numberOfLines={1}
          style={[
            isRailLayout
              ? styles.mobileWorkspaceChannelNameRail
              : styles.mobileWorkspaceChannelName,
            (tone === "mention" || tone === "unread") && styles.mobileWorkspaceChannelNameStrong,
            tone === "read" && styles.mobileWorkspaceChannelNameMuted,
            isSelected &&
              (isRailLayout
                ? styles.mobileWorkspaceChannelNameRailActive
                : styles.mobileWorkspaceChannelNameActive),
            isEmptyVoiceRow && styles.mobileWorkspaceVoiceEmptyName,
          ]}
        >
          {channel.name}
        </Text>
        {isEmptyVoiceRow ? (
          <Text
            numberOfLines={1}
            style={styles.mobileWorkspaceVoiceEmptySub}
            testID="mobile-workspace-voice-empty-sub"
          >
            {copy.workspaceVoiceRowEmpty}
          </Text>
        ) : preview ? (
          <Text
            numberOfLines={1}
            style={[
              styles.mobileWorkspaceChannelMeta,
              tone === "mention" && styles.mobileWorkspaceChannelMetaStrong,
              tone === "read" && styles.mobileWorkspaceChannelMetaFaint,
            ]}
            testID="mobile-workspace-channel-preview"
          >
            {`${preview.author}: `}
            {preview.segments.map((segment, index) =>
              segment.type === "mention" ? (
                <Text
                  key={`${segment.type}-${index}`}
                  style={styles.mobileWorkspaceChannelMetaMentionToken}
                >
                  {segment.value}
                </Text>
              ) : (
                segment.value
              ),
            )}
          </Text>
        ) : null}
      </View>
      {timestamp || priority.hasMentions || priority.hasUnread ? (
        <View style={styles.mobileWorkspaceChannelTrailing}>
          {timestamp ? (
            <Text
              style={styles.mobileWorkspaceChannelTimestamp}
              testID="mobile-workspace-channel-time"
            >
              {timestamp}
            </Text>
          ) : null}
          {priority.hasMentions ? (
            <Text style={styles.mobileWorkspaceChannelMentionBadge}>
              @{formatMobileUnreadCount(channel.mentionCount)}
            </Text>
          ) : priority.hasUnread ? (
            <Text style={styles.mobileWorkspaceUnreadDot}>
              {formatMobileUnreadCount(channel.unreadCount)}
            </Text>
          ) : null}
        </View>
      ) : null}
      {priority.isLocked || priority.isReadOnly ? (
        <Ionicons
          color={theme.text.soft}
          name={priority.isLocked ? "lock-closed-outline" : "eye-off-outline"}
          size={14}
        />
      ) : null}
    </Pressable>
  );
});
