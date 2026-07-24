import { FlashList } from "@shopify/flash-list";
import { memo } from "react";
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
import type { MobileWorkspaceLayout } from "../providers/mobile-workspace-layout-provider";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { useHomeScreenStyles } from "./home-screen.styles";
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";

export function WorkspaceChannelSectionList({
  canCreateChannels = false,
  isCollapseDisabled,
  layout,
  onCreateInSection,
  onOpenChannel,
  onToggleSection,
  sections,
  selectedChannelId,
  voiceStates = [],
}: {
  canCreateChannels?: boolean;
  isCollapseDisabled: boolean;
  layout: MobileWorkspaceLayout;
  onCreateInSection?(sectionId: string): void;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onToggleSection(sectionId: string): void;
  sections: MobileVisibleWorkspaceChannelSection[];
  selectedChannelId: string | null;
  voiceStates?: readonly MobileVoiceChannelState[];
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const isRailLayout = layout === "rail";
  if (sections.length === 0) {
    return <Text style={styles.contractDescription}>{copy.workspaceNoChannels}</Text>;
  }

  const items = sections.flatMap((section) => [
    { id: `section:${section.id}`, kind: "section" as const, section },
    ...section.channels.map((channel) => ({
      channel,
      id: `channel:${channel.id}`,
      kind: "channel" as const,
    })),
  ]);
  // Only a channel-manager sees the per-category create (+); it opens 1d with
  // that category preselected.
  const showSectionAdd = canCreateChannels && onCreateInSection !== undefined;

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
      renderItem={({ item }) => {
        if (item.kind === "channel") {
          return (
            <WorkspaceChannelCompactRow
              channel={item.channel}
              isSelected={item.channel.id === selectedChannelId}
              layout={layout}
              onOpenChannel={onOpenChannel}
              voiceState={voiceStates.find((state) => state.channelId === item.channel.id) ?? null}
            />
          );
        }

        const { section } = item;
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
              onPress={() => onToggleSection(section.id)}
              style={({ pressed }) => [
                styles.mobileWorkspaceSectionHeaderToggle,
                pressed && styles.compactListRowPressed,
              ]}
            >
              <MobileLineIcon
                color={theme.text.visualFaint}
                name={section.isCollapsed ? "chevron-right" : "chevron-down"}
                size={12}
              />
              <Text
                style={
                  isRailLayout
                    ? styles.mobileWorkspaceSectionTitleRail
                    : styles.mobileWorkspaceSectionTitle
                }
              >
                {section.name}
              </Text>
            </Pressable>
            {showSectionAdd ? (
              <Pressable
                accessibilityLabel={copy.workspaceCreateMenuTitle}
                accessibilityRole="button"
                onPress={() => onCreateInSection?.(section.id)}
                style={({ pressed }) => [
                  styles.mobileWorkspaceSectionAddButton,
                  pressed && styles.compactListRowPressed,
                ]}
                testID={`mobile-workspace-section-create-${section.id}`}
              >
                <Ionicons color={theme.text.visualSecondary} name="add" size={12} />
              </Pressable>
            ) : null}
          </View>
        );
      }}
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
  const isRailLayout = layout === "rail";
  const priority = getMobileChannelPriority(channel);
  const participants = channel.type === "VOICE" ? (voiceState?.participants ?? []) : [];

  // Live voice channel: a bordered card with the live count, stacked participant
  // avatars and a green Katıl pill that connects straight to the room.
  if (channel.type === "VOICE" && participants.length > 0) {
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
        <View style={styles.mobileWorkspaceLiveIcon} testID={`mobile-voice-state-${channel.id}`}>
          <MobileLineIcon color={theme.status.visualText} name="speaker" size={16} />
        </View>
        <View style={styles.mobileWorkspaceLiveText}>
          <Text style={styles.mobileWorkspaceLiveName} numberOfLines={1}>
            {channel.name}
          </Text>
          <Text style={styles.mobileWorkspaceVoicePresenceText} numberOfLines={1}>
            {copy.workspaceLiveLabel} · {participants.length} {copy.workspacePeopleSuffix}
          </Text>
        </View>
        <View style={styles.mobileWorkspaceVoiceAvatars}>
          {participants.slice(0, 2).map((participant, index) => (
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
        <View style={styles.mobileWorkspaceJoinPill}>
          <Text style={styles.mobileWorkspaceJoinPillText}>{copy.workspaceJoinVoiceAction}</Text>
        </View>
      </Pressable>
    );
  }

  const lastMessagePreview =
    channel.type === "TEXT" && channel.lastMessage
      ? `${channel.lastMessage.author.displayName ?? channel.lastMessage.author.username}: ${channel.lastMessage.text}`
      : null;

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
      {isRailLayout ? (
        channel.type === "TEXT" ? (
          <Text
            style={[
              styles.mobileWorkspaceChannelHashRail,
              isSelected && styles.mobileWorkspaceChannelHashRailActive,
            ]}
            testID="mobile-workspace-text-channel-hash"
          >
            #
          </Text>
        ) : (
          <MobileLineIcon color={theme.status.visualText} name="speaker" size={16} />
        )
      ) : (
        <View
          style={[
            styles.mobileWorkspaceChannelIcon,
            channel.type === "TEXT" && isSelected && styles.mobileWorkspaceChannelIconSelected,
            channel.type === "VOICE" && styles.mobileWorkspaceChannelIconVoice,
          ]}
          testID={channel.type === "TEXT" ? "mobile-workspace-text-channel-icon" : undefined}
        >
          {channel.type === "TEXT" ? (
            <Text
              style={[
                styles.mobileWorkspaceChannelHash,
                isSelected && styles.mobileWorkspaceChannelHashActive,
              ]}
              testID="mobile-workspace-text-channel-hash"
            >
              #
            </Text>
          ) : (
            <MobileLineIcon color={theme.status.visualText} name="speaker" size={17} />
          )}
        </View>
      )}
      <View
        style={
          isRailLayout ? styles.mobileWorkspaceChannelTextRail : styles.mobileWorkspaceChannelText
        }
      >
        <View style={styles.compactListTitleRow}>
          <Text
            numberOfLines={1}
            style={[
              isRailLayout
                ? styles.mobileWorkspaceChannelNameRail
                : styles.mobileWorkspaceChannelName,
              isSelected &&
                (isRailLayout
                  ? styles.mobileWorkspaceChannelNameRailActive
                  : styles.mobileWorkspaceChannelNameActive),
            ]}
          >
            {channel.name}
          </Text>
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
        {!isRailLayout && lastMessagePreview ? (
          <Text style={styles.mobileWorkspaceChannelMeta} numberOfLines={1}>
            {lastMessagePreview}
          </Text>
        ) : null}
      </View>
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
