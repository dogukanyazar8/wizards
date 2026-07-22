import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { MobileTheme } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";
import { BottomSheet } from "./kit";

export type MobileForwardTarget = {
  readonly id: string;
  readonly label: string;
  readonly type: "channel" | "dm";
};

export type MobileForwardSendInput = {
  readonly content: string;
  readonly forwardOfMessageId: string;
  readonly target: MobileForwardTarget;
};

export function MessageForwardSheet({
  onClose,
  onForward,
  open,
  targets,
}: {
  readonly onClose: () => void;
  readonly onForward: (target: MobileForwardTarget) => Promise<boolean>;
  readonly open: boolean;
  readonly targets: readonly MobileForwardTarget[];
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { notification, selection } = useMobileHaptics();
  const [isSending, setSending] = useState(false);
  const [didFail, setDidFail] = useState(false);
  const dmTargets = useMemo(() => targets.filter((target) => target.type === "dm"), [targets]);
  const channelTargets = useMemo(
    () => targets.filter((target) => target.type === "channel"),
    [targets],
  );

  const handleSelect = async (target: MobileForwardTarget) => {
    if (isSending) return;
    selection();
    setSending(true);
    setDidFail(false);
    const didForward = await onForward(target);
    setSending(false);
    if (didForward) {
      onClose();
      return;
    }
    notification("error");
    setDidFail(true);
  };

  const renderTarget = (target: MobileForwardTarget) => (
    <Pressable
      accessibilityLabel={target.label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isSending }}
      disabled={isSending}
      key={`${target.type}:${target.id}`}
      onPress={() => void handleSelect(target)}
      style={({ pressed }) => [
        styles.targetRow,
        isSending && styles.targetRowDisabled,
        pressed && styles.targetRowPressed,
      ]}
      testID={`mobile-message-forward-target-${target.type}-${target.id}`}
    >
      <View style={styles.targetIcon}>
        {target.type === "dm" ? (
          <Ionicons name="chatbubble-outline" size={16} color={theme.accent.strong} />
        ) : (
          <Text style={styles.targetHash}>#</Text>
        )}
      </View>
      <Text numberOfLines={1} style={styles.targetLabel}>
        {target.label}
      </Text>
      <Ionicons name="arrow-redo-outline" size={16} color={theme.text.visualFaint} />
    </Pressable>
  );

  return (
    <BottomSheet
      accessibilityLabel={copy.messageForwardSheetTitle}
      onClose={onClose}
      open={open}
      snapPoint={520}
      testID="mobile-message-forward-sheet"
    >
      <Text style={styles.title}>{copy.messageForwardSheetTitle}</Text>
      {didFail ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {copy.messageForwardFailedNotice}
        </Text>
      ) : null}
      {targets.length === 0 ? (
        <Text style={styles.emptyText}>{copy.messageForwardEmptyNotice}</Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {dmTargets.length > 0 ? (
            <Text style={styles.sectionLabel}>{copy.messageForwardSectionDms}</Text>
          ) : null}
          {dmTargets.map(renderTarget)}
          {channelTargets.length > 0 ? (
            <Text style={styles.sectionLabel}>{copy.messageForwardSectionChannels}</Text>
          ) : null}
          {channelTargets.map(renderTarget)}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const createStyles = (theme: MobileTheme) =>
  StyleSheet.create({
    title: {
      color: theme.text.primary,
      fontSize: 18,
      lineHeight: 23,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    errorText: {
      overflow: "hidden",
      borderRadius: theme.radii.control,
      backgroundColor: theme.status.dangerSoft,
      color: theme.status.onStatus,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilyBold,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    emptyText: {
      color: theme.text.muted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 12,
    },
    list: { marginTop: 6 },
    sectionLabel: {
      color: theme.text.visualFaint,
      fontSize: 11.5,
      lineHeight: 15,
      fontFamily: theme.typography.fontFamilyBold,
      letterSpacing: 1.15,
      textTransform: "uppercase",
      marginTop: 12,
      marginBottom: 6,
    },
    targetRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: theme.radii.row,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    targetRowDisabled: { opacity: 0.56 },
    targetRowPressed: { backgroundColor: theme.surface.soft },
    targetIcon: {
      width: 36,
      height: 36,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accent.soft,
      flexShrink: 0,
    },
    targetHash: {
      color: theme.accent.strong,
      fontSize: 15,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    targetLabel: {
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
  });
