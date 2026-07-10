import { FlashList } from "@shopify/flash-list";
import {
  Ionicons,
  Pressable,
  Text,
  View,
  copy,
  getMobileChannelPriority,
  type MobileVisibleWorkspaceChannelSection,
  type MobileWorkspaceChannelSummary,
} from "../mobile-root-screen-shared";
import { useTheme } from "../providers/mobile-theme-provider";
import { useHomeScreenStyles } from "./home-screen.styles";

export function WorkspaceChannelSectionList({
  isCollapseDisabled,
  onOpenChannel,
  onToggleSection,
  sections,
  selectedChannelId,
}: {
  isCollapseDisabled: boolean;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onToggleSection(sectionId: string): void;
  sections: MobileVisibleWorkspaceChannelSection[];
  selectedChannelId: string | null;
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
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
      contentContainerStyle={styles.mobileWorkspaceSectionList}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        if (item.kind === "channel") {
          return (
            <WorkspaceChannelCompactRow
              channel={item.channel}
              isSelected={item.channel.id === selectedChannelId}
              onOpenChannel={onOpenChannel}
            />
          );
        }

        const { section } = item;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${section.name} ${section.isCollapsed ? "ac" : "kapat"}`}
            accessibilityState={{ disabled: isCollapseDisabled, expanded: !section.isCollapsed }}
            disabled={isCollapseDisabled}
            onPress={() => onToggleSection(section.id)}
            style={({ pressed }) => [
              styles.mobileWorkspaceSectionHeader,
              pressed && styles.compactListRowPressed,
            ]}
          >
            <Text style={styles.mobileWorkspaceSectionTitle}>{section.name}</Text>
            <View style={styles.mobileWorkspaceSectionMeta}>
              <Text style={styles.mobileWorkspaceSectionCount}>{section.totalChannelCount}</Text>
              <Ionicons
                name={section.isCollapsed ? "chevron-forward" : "chevron-down"}
                size={14}
                color={theme.text.soft}
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

export function WorkspaceChannelCompactRow({
  channel,
  isSelected,
  onOpenChannel,
}: {
  channel: MobileWorkspaceChannelSummary;
  isSelected: boolean;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const priority = getMobileChannelPriority(channel);
  const iconName =
    channel.type === "TEXT" ? "chatbubble-ellipses-outline" : "volume-medium-outline";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${copy.openWorkspaceChannelAction}: ${channel.name}`}
      accessibilityState={{ selected: isSelected }}
      testID={`mobile-workspace-channel-${channel.type.toLowerCase()}`}
      onPress={() => onOpenChannel(channel)}
      style={({ pressed }) => [
        styles.mobileWorkspaceChannelRow,
        isSelected && styles.mobileWorkspaceChannelRowActive,
        pressed && styles.compactListRowPressed,
      ]}
    >
      <View
        style={[
          styles.mobileWorkspaceChannelIcon,
          channel.type === "VOICE" && styles.mobileWorkspaceChannelIconVoice,
        ]}
      >
        <Ionicons
          name={iconName}
          size={15}
          color={channel.type === "VOICE" ? theme.status.success : theme.accent.strong}
        />
      </View>
      <View style={styles.mobileWorkspaceChannelText}>
        <View style={styles.compactListTitleRow}>
          <Text style={styles.mobileWorkspaceChannelName} numberOfLines={1}>
            {channel.name}
          </Text>
          {priority.hasMentions ? (
            <Text style={styles.channelMentionBadge}>{channel.mentionCount}</Text>
          ) : priority.hasUnread ? (
            <Text style={styles.mobileWorkspaceUnreadDot}>{channel.unreadCount}</Text>
          ) : null}
        </View>
        {channel.topic ? (
          <Text style={styles.mobileWorkspaceChannelMeta} numberOfLines={1}>
            {channel.topic}
          </Text>
        ) : null}
      </View>
      {priority.isLocked || priority.isReadOnly ? (
        <Ionicons
          name={priority.isLocked ? "lock-closed-outline" : "eye-off-outline"}
          size={14}
          color={theme.text.soft}
        />
      ) : null}
    </Pressable>
  );
}
