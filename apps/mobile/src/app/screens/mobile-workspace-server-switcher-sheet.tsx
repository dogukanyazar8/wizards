import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  Ionicons,
  copy,
  type MobileBootstrapPayload,
} from "../mobile-root-screen-shared";
import { AvatarMark } from "../components/ui-atoms";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";
import type { MobileTheme } from "../../design/themes";

type MobileServerSummary = MobileBootstrapPayload["home"]["servers"]["recent"][number];

export function MobileWorkspaceServerSwitcherSheet({
  activeServerId,
  onClose,
  onOpenCreateJoin,
  onOpenServer,
  open,
  servers,
}: {
  activeServerId: string | null;
  onClose(): void;
  onOpenCreateJoin(): void;
  onOpenServer(serverId: string): void;
  open: boolean;
  servers: readonly MobileServerSummary[];
}) {
  const styles = useThemedStyles(createMobileWorkspaceServerSwitcherSheetStyles);
  const theme = useTheme();
  const bottomSpacing = useMobileBottomSystemSpacing(28);

  if (!open) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible={open}
      onRequestClose={onClose}
      navigationBarTranslucent
      statusBarTranslucent
    >
      <View style={styles.root} testID="mobile-server-switcher-sheet">
        <Pressable
          accessibilityLabel={copy.messageThreadBackAction}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
          testID="mobile-server-switcher-dismiss"
        />
        <View
          style={[styles.sheet, { paddingBottom: bottomSpacing }]}
          testID="mobile-server-switcher-sheet-panel"
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Sunucuların</Text>
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
              <Text style={styles.createJoinActionText}>Katıl / Kur</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {servers.map((server) => {
              const selected = server.id === activeServerId;
              const unreadCount = Math.min(server.unreadCount, 99);

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
                    avatarBorderRadius={18}
                    dimension={52}
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
                    <Text style={styles.serverMeta} numberOfLines={1}>
                      {server.memberCount} {copy.membersSuffix} · {server.channelCount}{" "}
                      {copy.channelsSuffix}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark" size={20} color={theme.accent.strong} />
                  ) : unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
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
                <Text style={styles.newServerTitle}>Yeni sunucu</Text>
                <Text style={styles.newServerMeta}>Davet koduyla katıl veya kur</Text>
              </View>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const createMobileWorkspaceServerSwitcherSheetStyles = (theme: MobileTheme) => ({
  backdrop: {
    backgroundColor: theme.surface.scrim,
    bottom: 0,
    left: 0,
    position: "absolute" as const,
    right: 0,
    top: 0,
  },
  createJoinAction: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.soft,
    borderRadius: 12,
    flexDirection: "row" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createJoinActionText: {
    color: theme.accent.strong,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13,
  },
  handle: {
    alignSelf: "center" as const,
    backgroundColor: theme.authLanguage.handle,
    borderRadius: 3,
    height: 5,
    marginBottom: 18,
    width: 44,
  },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    paddingBottom: 14,
    paddingHorizontal: 4,
  },
  list: { gap: 6, paddingBottom: 4 },
  newServerIcon: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderRadius: 18,
    height: 52,
    justifyContent: "center" as const,
    width: 52,
  },
  newServerMeta: {
    color: theme.text.soft,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12.5,
  },
  newServerRow: {
    alignItems: "center" as const,
    borderColor: theme.border.subtle,
    borderRadius: 20,
    borderStyle: "dashed" as const,
    borderWidth: 1.5,
    flexDirection: "row" as const,
    gap: 14,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  newServerTitle: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 15,
  },
  pressed: { opacity: 0.78 },
  root: { flex: 1, justifyContent: "flex-end" as const },
  serverAvatarFallback: {
    fontSize: 16,
    lineHeight: 20,
  },
  serverMeta: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12.5,
  },
  serverName: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 15.5,
  },
  serverNameSelected: {
    color: theme.accent.strong,
    fontFamily: theme.typography.fontFamilyExtraBold,
  },
  serverRow: {
    alignItems: "center" as const,
    borderRadius: 20,
    flexDirection: "row" as const,
    gap: 14,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  serverRowSelected: {
    backgroundColor: theme.accent.soft,
    borderColor: theme.border.focus,
    borderWidth: 1,
  },
  serverText: { flex: 1, gap: 1, minWidth: 0 },
  sheet: {
    backgroundColor: theme.surface.card,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    maxHeight: "78%" as const,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    ...theme.elevation.bottomSheet,
  },
  title: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 19,
  },
  unreadBadge: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.action,
    borderRadius: 11,
    justifyContent: "center" as const,
    minHeight: 22,
    minWidth: 22,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: theme.text.onPrimary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 11,
  },
});
