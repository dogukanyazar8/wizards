import type { MobileNotificationItem } from "@wizards/types";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  Ionicons,
  copy,
  formatMobileDisplayTime,
  formatMobileUnreadCount,
  type MobileBootstrapPayload,
} from "../mobile-root-screen-shared";
import { AvatarMark } from "../components/ui-atoms";
import { BottomSheet } from "../components/kit";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";
import type { MobileTheme } from "../../design/themes";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import { getMobileServerBadge } from "../mobile-sunucular-model";

type MobileServerSummary = MobileBootstrapPayload["home"]["servers"]["recent"][number];

export function MobileWorkspaceServerSwitcherSheet({
  activeServerId,
  missedNotifications = [],
  onClose,
  onOpenCreateJoin,
  onOpenServer,
  onSeeAllMissed,
  open,
  servers,
}: {
  activeServerId: string | null;
  // "Kaçırdıkların": already merged/sorted/bounded by the browser, which owns the
  // notifications query context; the sheet stays presentational and testable.
  missedNotifications?: readonly MobileNotificationItem[];
  onClose(): void;
  onOpenCreateJoin(): void;
  onOpenServer(serverId: string): void;
  onSeeAllMissed?(): void;
  open: boolean;
  servers: readonly MobileServerSummary[];
}) {
  const styles = useThemedStyles(createMobileWorkspaceServerSwitcherSheetStyles);
  const theme = useTheme();
  const missed = missedNotifications;

  const goToNotifications = () => {
    onClose();
    onSeeAllMissed?.();
  };

  return (
    <BottomSheet
      accessibilityLabel={copy.workspaceServerSwitcherTitle}
      onClose={onClose}
      open={open}
      presentation={{
        handleAreaStyle: styles.handleArea,
        handleStyle: styles.handle,
        panelStyle: styles.panel,
      }}
      sizing="content"
      testID="mobile-server-switcher-sheet"
    >
      <>
        <View style={styles.header}>
          <Text style={styles.title}>{copy.workspaceServerSwitcherTitle}</Text>
          <Pressable
            accessibilityLabel={copy.workspaceAddServerAction}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onOpenCreateJoin();
            }}
            style={({ pressed }) => [styles.createJoinAction, pressed && styles.pressed]}
            testID="mobile-server-switcher-create-join"
          >
            <Ionicons name="add" size={16} color={theme.accent.strong} />
            <Text style={styles.createJoinActionText}>
              {copy.workspaceServerSwitcherCreateJoinAction}
            </Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {servers.map((server) => {
            const selected = server.id === activeServerId;
            const badge = getMobileServerBadge(server);
            const isMention = !selected && badge.kind === "mention";
            const subtitle = selected
              ? `${server.memberCount} ${copy.membersSuffix} · ${server.channelCount} ${copy.channelsSuffix} · ${copy.workspaceSwitcherCurrentServerLabel}`
              : isMention
                ? copy.workspaceSwitcherMentions.replace("{count}", String(badge.count))
                : `${server.memberCount} ${copy.membersSuffix} · ${server.channelCount} ${copy.channelsSuffix}`;

            return (
              <Pressable
                key={server.id}
                accessibilityLabel={`${copy.openWorkspaceServerAction}: ${server.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onOpenServer(server.id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.serverRow,
                  selected && styles.serverRowSelected,
                  pressed && styles.pressed,
                ]}
                testID={`mobile-server-switcher-option-${server.id}`}
              >
                <AvatarMark
                  avatarBorderRadius={16}
                  dimension={46}
                  fallbackTextStyle={styles.serverAvatarFallback}
                  imageUrl={server.iconUrl}
                  label={server.shortName ?? server.name}
                  size="large"
                />
                <View style={styles.serverText}>
                  <Text
                    style={[styles.serverName, selected && styles.serverNameSelected]}
                    numberOfLines={1}
                  >
                    {server.name}
                  </Text>
                  <Text
                    style={[styles.serverMeta, isMention && styles.serverMetaMention]}
                    numberOfLines={1}
                  >
                    {subtitle}
                  </Text>
                </View>
                {selected ? (
                  // 1c: the active ring reads as a deliberate mark, so the tick keeps
                  // a heavier stroke than the default line-icon weight.
                  <MobileLineIcon
                    color={theme.accent.strong}
                    name="check"
                    size={18}
                    strokeWidth={2.8}
                  />
                ) : badge.kind === "mention" ? (
                  <View style={styles.mentionBadge}>
                    <Text style={styles.mentionBadgeText}>
                      @{formatMobileUnreadCount(badge.count)}
                    </Text>
                  </View>
                ) : badge.kind === "unread" ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {formatMobileUnreadCount(badge.count)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          <Pressable
            accessibilityLabel={copy.workspaceAddServerAction}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onOpenCreateJoin();
            }}
            style={({ pressed }) => [styles.newServerRow, pressed && styles.pressed]}
            testID="mobile-server-switcher-new-server"
          >
            <View style={styles.newServerIcon}>
              <Ionicons name="add" size={21} color={theme.text.muted} />
            </View>
            <View style={styles.serverText}>
              <Text style={styles.newServerTitle}>
                {copy.workspaceServerSwitcherNewServerTitle}
              </Text>
              <Text style={styles.newServerMeta}>
                {copy.workspaceServerSwitcherNewServerDescription}
              </Text>
            </View>
          </Pressable>

          {missed.length > 0 ? (
            <View style={styles.missedSection}>
              <View style={styles.missedHeader}>
                <Text style={styles.missedTitle}>{copy.workspaceMissedTitle}</Text>
                <View style={styles.missedDivider} />
                <Pressable
                  accessibilityRole="button"
                  onPress={goToNotifications}
                  style={({ pressed }) => [pressed && styles.pressed]}
                  testID="mobile-server-switcher-missed-all"
                >
                  <Text style={styles.missedSeeAll}>{copy.workspaceMissedSeeAllAction}</Text>
                </Pressable>
              </View>
              {missed.map((item) => {
                const contextParts = [
                  item.server?.name,
                  item.channel ? `#${item.channel.name}` : null,
                ].filter((part): part is string => Boolean(part));
                const context = contextParts.join(" · ");
                const subtitle = item.messageQuote?.preview
                  ? `${context}${context ? " — " : ""}"${item.messageQuote.preview}"`
                  : context;
                const isVoiceStart = item.eventKind === "voice-room-started";

                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={goToNotifications}
                    style={({ pressed }) => [styles.missedCard, pressed && styles.pressed]}
                    testID={`mobile-server-switcher-missed-${item.id}`}
                  >
                    {isVoiceStart || !item.actor ? (
                      <View style={styles.missedIcon}>
                        <MobileLineIcon
                          color={theme.status.visualText}
                          name={isVoiceStart ? "speaker" : "bell"}
                          size={16}
                        />
                      </View>
                    ) : (
                      <AvatarMark
                        avatarBorderRadius={12}
                        dimension={34}
                        imageUrl={item.actor.avatarUrl}
                        label={item.actor.displayName ?? item.actor.username}
                        size="small"
                      />
                    )}
                    <View style={styles.serverText}>
                      <Text style={styles.missedCardTitle} numberOfLines={1}>
                        {item.body}
                      </Text>
                      {subtitle ? (
                        <Text style={styles.missedCardSubtitle} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.missedTime}>{formatMobileDisplayTime(item.createdAt)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </>
    </BottomSheet>
  );
}

export const createMobileWorkspaceServerSwitcherSheetStyles = (theme: MobileTheme) => ({
  createJoinAction: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.soft,
    borderRadius: 13,
    flexDirection: "row" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  createJoinActionText: {
    color: theme.accent.strong,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13,
  },
  handle: {
    backgroundColor: theme.authLanguage.handle,
    borderRadius: 3,
    height: 5,
    width: 44,
  },
  // 1c keeps the grabber tight so the sheet spends its height on rows, not chrome.
  handleArea: { paddingBottom: 6, paddingTop: 10 },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    paddingBottom: 12,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  list: { paddingBottom: 4 },
  mentionBadge: {
    alignItems: "center" as const,
    backgroundColor: theme.mention.badge,
    borderRadius: theme.radii.pill,
    justifyContent: "center" as const,
    minHeight: 20,
    minWidth: 20,
    paddingHorizontal: 6,
  },
  mentionBadgeText: {
    color: theme.text.onPrimary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 10.5,
  },
  missedCard: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderRadius: 15,
    flexDirection: "row" as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missedCardSubtitle: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
  },
  missedCardTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 12.5,
  },
  missedDivider: { backgroundColor: theme.border.subtle, flex: 1, height: 1 },
  missedHeader: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 10,
    paddingHorizontal: 4,
  },
  missedIcon: {
    alignItems: "center" as const,
    backgroundColor: theme.status.successSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: "center" as const,
    width: 34,
  },
  missedSeeAll: {
    color: theme.accent.strong,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 12.5,
  },
  missedSection: { gap: 6, marginTop: 10 },
  missedTime: {
    color: theme.text.visualPlaceholder,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11,
  },
  missedTitle: {
    color: theme.text.visualFaint,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  newServerIcon: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderRadius: 16,
    height: 46,
    justifyContent: "center" as const,
    width: 46,
  },
  newServerMeta: {
    color: theme.text.soft,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11.5,
  },
  newServerRow: {
    alignItems: "center" as const,
    borderColor: theme.border.subtle,
    borderRadius: 18,
    borderStyle: "dashed" as const,
    borderWidth: 1.5,
    flexDirection: "row" as const,
    gap: 12,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  newServerTitle: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 15,
  },
  panel: {
    backgroundColor: theme.surface.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 0,
    maxHeight: "78%" as const,
  },
  pressed: { opacity: 0.78 },
  serverAvatarFallback: {
    fontSize: 15,
    lineHeight: 19,
  },
  serverMeta: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11.5,
  },
  serverMetaMention: {
    color: theme.mention.badge,
    fontFamily: theme.typography.fontFamilySemiBold,
  },
  serverName: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 15,
  },
  serverNameSelected: {
    color: theme.accent.strong,
    fontFamily: theme.typography.fontFamilyExtraBold,
  },
  serverRow: {
    alignItems: "center" as const,
    borderRadius: 18,
    flexDirection: "row" as const,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // 1c draws the active ring in the accent itself; border.focus was too pale to
  // read as "you are here" next to the tick.
  serverRowSelected: {
    backgroundColor: theme.accent.soft,
    borderColor: theme.accent.strong,
    borderWidth: 1.5,
  },
  serverText: { flex: 1, gap: 1, minWidth: 0 },
  title: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 19,
  },
  unreadBadge: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.action,
    borderRadius: theme.radii.pill,
    justifyContent: "center" as const,
    minHeight: 20,
    minWidth: 20,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: theme.text.onPrimary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 10.5,
  },
});
