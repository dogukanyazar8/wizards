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
  isCollapseDisabled,
  layout,
  onOpenChannel,
  onToggleSection,
  sections,
  selectedChannelId,
  voiceStates = [],
}: {
  isCollapseDisabled: boolean;
  layout: MobileWorkspaceLayout;
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

  return (
    <FlashList
      contentContainerStyle={
        isRailLayout ? styles.mobileWorkspaceSectionListRail : styles.mobileWorkspaceSectionList
      }
      data={items}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${section.name} ${
              section.isCollapsed
                ? copy.workspaceSectionExpandAction
                : copy.workspaceSectionCollapseAction
            }`}
            accessibilityState={{ disabled: isCollapseDisabled, expanded: !section.isCollapsed }}
            disabled={isCollapseDisabled}
            onPress={() => onToggleSection(section.id)}
            style={({ pressed }) => [
              isRailLayout
                ? styles.mobileWorkspaceSectionHeaderRail
                : styles.mobileWorkspaceSectionHeader,
              pressed && styles.compactListRowPressed,
            ]}
          >
            <Text
              style={
                isRailLayout
                  ? styles.mobileWorkspaceSectionTitleRail
                  : styles.mobileWorkspaceSectionTitle
              }
            >
              {section.name}
            </Text>
            <View style={styles.mobileWorkspaceSectionMeta}>
              <MobileLineIcon
                color={theme.text.visualFaint}
                name={section.isCollapsed ? "chevron-right" : "chevron-down"}
                size={16}
              />
            </View>
          </Pressable>
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
  const lastMessagePreview =
    channel.type === "TEXT" && channel.lastMessage
      ? `${channel.lastMessage.author.displayName ?? channel.lastMessage.author.username}: ${channel.lastMessage.text}`
      : null;

  const channelRow = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.openWorkspaceChannelAction}: ${channel.name}${
        participants.length > 0 ? `, ${participants.length} ${copy.voiceParticipantsSpeaking}` : ""
      }`}
      accessibilityState={{ selected: isSelected }}
      testID={`mobile-workspace-channel-${channel.type.toLowerCase()}`}
      onPress={() => onOpenChannel(channel)}
      style={({ pressed }) => [
        isRailLayout ? styles.mobileWorkspaceChannelRowRail : styles.mobileWorkspaceChannelRow,
        isSelected &&
          (isRailLayout
            ? styles.mobileWorkspaceChannelRowRailActive
            : styles.mobileWorkspaceChannelRowActive),
        pressed && styles.compactListRowPressed,
      ]}
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
          testID={channel.type === "TEXT" ? "mobile-workspace-text-channel-icon" : undefined}
          style={[
            styles.mobileWorkspaceChannelIcon,
            channel.type === "TEXT" && isSelected && styles.mobileWorkspaceChannelIconSelected,
            channel.type === "VOICE" && styles.mobileWorkspaceChannelIconVoice,
          ]}
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
            style={[
              isRailLayout
                ? styles.mobileWorkspaceChannelNameRail
                : styles.mobileWorkspaceChannelName,
              isSelected &&
                (isRailLayout
                  ? styles.mobileWorkspaceChannelNameRailActive
                  : styles.mobileWorkspaceChannelNameActive),
            ]}
            numberOfLines={1}
          >
            {channel.name}
          </Text>
          {priority.hasMentions ? (
            <Text style={styles.channelMentionBadge}>
              {formatMobileUnreadCount(channel.mentionCount)}
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
        {!isRailLayout && participants.length > 0 ? (
          <View
            style={styles.mobileWorkspaceVoicePresence}
            testID={`mobile-voice-state-${channel.id}`}
          >
            <Text style={styles.mobileWorkspaceVoicePresenceText} numberOfLines={1}>
              {participants.length} {copy.voiceParticipantsSpeaking}
            </Text>
          </View>
        ) : null}
      </View>
      {!isRailLayout && participants.length > 0 ? (
        <View style={styles.mobileWorkspaceVoiceAvatars}>
          {participants.slice(0, 3).map((participant, index) => (
            <AvatarMark
              key={participant.userId}
              avatarBorderColor={theme.surface.base}
              avatarBorderRadius={12}
              avatarBorderWidth={2}
              dimension={24}
              imageUrl={participant.avatarUrl}
              label={participant.displayName ?? participant.username}
              size="small"
              style={index === 0 ? undefined : { marginLeft: -8 }}
            />
          ))}
        </View>
      ) : null}
      {isRailLayout && channel.type === "VOICE" && participants.length > 0 ? (
        <Text style={styles.mobileWorkspaceVoicePresenceTextRail}>
          {participants.length} {copy.voiceParticipantsSpeaking}
        </Text>
      ) : null}
      {priority.isLocked || priority.isReadOnly ? (
        <Ionicons
          name={priority.isLocked ? "lock-closed-outline" : "eye-off-outline"}
          size={14}
          color={theme.text.soft}
        />
      ) : null}
    </Pressable>
  );

  return channelRow;
});
