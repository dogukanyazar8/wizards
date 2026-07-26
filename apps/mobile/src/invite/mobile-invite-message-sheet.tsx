import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { MobileDMConversationListItem } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { BottomSheet, Skeleton, useSheetPresentation, useToast } from "../app/components/kit";
import { AvatarMark } from "../app/components/ui-atoms";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { sendMobileDMMessage } from "../dm/mobile-dm-client";
import { mobileCopy } from "../locale/mobile-copy";
import {
  flattenMobileDMConversationPages,
  useMobileDMConversationsQuery,
} from "../query/mobile-dm-conversations-query";
import { createMobileInviteSheetStyles } from "./mobile-invite-sheet.styles";

export interface MobileInviteMessageSheetProps {
  onClose(): void;
  readonly open: boolean;
  readonly shareUrl: string | null;
}

function conversationLabel(conversation: MobileDMConversationListItem): string {
  if (conversation.name) {
    return conversation.name;
  }

  const [participant] = conversation.participants;
  return participant?.displayName ?? participant?.username ?? "";
}

/**
 * 2a "Mesajla" — the invite link sent into an existing Whispr conversation.
 * Same picker shape as the message-forward sheet: pick one target, the sheet
 * sends and closes, a failure keeps it open with a toast.
 */
export function MobileInviteMessageSheet({
  onClose,
  open,
  shareUrl,
}: MobileInviteMessageSheetProps) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const theme = useTheme();
  const presentation = useSheetPresentation();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const conversationsQuery = useMobileDMConversationsQuery(apiClient, open);
  const conversations = flattenMobileDMConversationPages(conversationsQuery.data);

  const send = async (conversationId: string) => {
    if (!shareUrl || sendingId !== null) {
      return;
    }

    setSendingId(conversationId);
    try {
      await sendMobileDMMessage(apiClient, { content: shareUrl, conversationId });
      showToast({ title: labels.inviteSheetMessageSent, variant: "success" });
      onClose();
    } catch {
      showToast({ title: labels.inviteSheetMessageFailed, variant: "error" });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <BottomSheet
      accessibilityLabel={labels.inviteSheetMessageTitle}
      onClose={onClose}
      open={open}
      presentation={presentation}
      sizing="content"
      testID="mobile-invite-message-sheet"
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={styles.title}>
              {labels.inviteSheetMessageTitle}
            </Text>
            {shareUrl ? (
              <Text numberOfLines={1} style={styles.subtitle}>
                {shareUrl}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={labels.sheetCloseAction}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            testID="mobile-invite-message-sheet-close"
          >
            <Ionicons color={theme.text.visualPlaceholder} name="close" size={18} />
          </Pressable>
        </View>

        {conversationsQuery.isPending ? (
          <View style={styles.loadingBlock} testID="mobile-invite-message-sheet-loading">
            <Skeleton height={48} />
            <Skeleton height={48} />
          </View>
        ) : conversations.length === 0 ? (
          <Text style={styles.searchHint} testID="mobile-invite-message-sheet-empty">
            {labels.inviteSheetMessageEmpty}
          </Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.listScroll}>
            {conversations.map((conversation) => {
              const label = conversationLabel(conversation);
              return (
                <Pressable
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  accessibilityState={{ busy: sendingId === conversation.id }}
                  disabled={sendingId !== null}
                  key={conversation.id}
                  onPress={() => void send(conversation.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  testID={`mobile-invite-message-target-${conversation.id}`}
                >
                  <View style={styles.rowAvatarWrap}>
                    <AvatarMark
                      avatarBorderRadius={15}
                      avatarBorderWidth={0}
                      dimension={40}
                      identityId={conversation.id}
                      imageUrl={conversation.iconUrl}
                      label={label}
                    />
                  </View>
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      {label}
                    </Text>
                  </View>
                  <Ionicons color={theme.text.visualFaint} name="send-outline" size={16} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}
