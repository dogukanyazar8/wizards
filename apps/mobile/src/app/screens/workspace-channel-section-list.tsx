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
import { mobileListLoadHandlers } from "../../performance/mobile-performance-metrics";

export function WorkspaceChannelSectionList({
  isCollapseDisabled,
  canManageChannels = false,
  onOpenChannel,
  onOpenChannelSettings,
  onToggleSection,
  sections,
  selectedChannelId,
}: {
  isCollapseDisabled: boolean;
  canManageChannels?: boolean;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenChannelSettings?(channelId: string): void;
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
      onLoad={mobileListLoadHandlers.workspaceChannels}
      renderItem={({ item }) => {
        if (item.kind === "channel") {
          return (
            <WorkspaceChannelCompactRow
              channel={item.channel}
              isSelected={item.channel.id === selectedChannelId}
              onOpenChannel={onOpenChannel}
              canManageChannels={canManageChannels}
              {...(onOpenChannelSettings ? { onOpenChannelSettings } : {})}
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
  canManageChannels = false,
  isSelected,
  onOpenChannel,
  onOpenChannelSettings,
}: {
  channel: MobileWorkspaceChannelSummary;
  canManageChannels?: boolean;
  isSelected: boolean;
  onOpenChannel(channel: MobileWorkspaceChannelSummary): void;
  onOpenChannelSettings?(channelId: string): void;
}) {
  const styles = useHomeScreenStyles();
  const theme = useTheme();
  const priority = getMobileChannelPriority(channel);
  const iconName =
    channel.type === "TEXT" ? "chatbubble-ellipses-outline" : "volume-medium-outline";

  const channelRow = (
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

  if (!canManageChannels || !onOpenChannelSettings) {
    return channelRow;
  }

  return (
    <View style={{ alignItems: "stretch", flexDirection: "row", gap: 4 }}>
      <View style={{ flex: 1 }}>{channelRow}</View>
      <Pressable
        accessibilityLabel={`${channel.name} ${copy.workspaceChannelSettingsAction}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onOpenChannelSettings(channel.id)}
        style={{ alignItems: "center", justifyContent: "center", minWidth: 44 }}
        testID={`mobile-channel-settings-open-${channel.id}`}
      >
        <Ionicons name="settings-outline" size={16} color={theme.text.soft} />
      </Pressable>
    </View>
  );
}
