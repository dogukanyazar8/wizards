import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { MobileServerInvite } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Button, DestructiveConfirmationSheet, EmptyState, Skeleton } from "../app/components/kit";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { shareMobileInviteUrl } from "../invite/mobile-invite-share";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { useMobileServerInvitesQuery } from "./mobile-server-management-query";
import { createMobileServerInvitesStyles } from "./mobile-server-invites-screen.styles";
import { mobileCopy } from "../locale/mobile-copy";

export interface MobileServerInvitesScreenProps {
  readonly serverId: string;
  onBack(): void;
}

function inviteCode(shareUrl: string): string {
  try {
    const segment = new URL(shareUrl).pathname.split("/").filter(Boolean).pop();
    return segment ?? shareUrl;
  } catch {
    return shareUrl;
  }
}

/** The invite-usage chip reads differently once a maximum exists. */
function formatInviteUses(
  labels: (typeof mobileCopy)[keyof typeof mobileCopy],
  used: number,
  max: number | null,
): string {
  return max === null
    ? labels.serverInvitesUses.replace("{used}", String(used))
    : labels.serverInvitesUsesLimited
        .replace("{used}", String(used))
        .replace("{max}", String(max));
}

function formatExpiry(expiresAt: string | null, locale: string, neverLabel: string): string {
  if (!expiresAt) {
    return neverLabel;
  }
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return neverLabel;
  }
  return parsed.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MobileServerInvitesScreen({ onBack, serverId }: MobileServerInvitesScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerInvitesStyles);
  const invitesQuery = useMobileServerInvitesQuery(apiClient, serverId, true);
  const mutations = useMobileServerManagementMutations(apiClient);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MobileServerInvite | null>(null);
  const invites = invitesQuery.data?.invites ?? [];

  const createInvite = async () => {
    if (mutations.createInvite.isPending) {
      return;
    }
    try {
      await mutations.createInvite.mutateAsync({ serverId });
      await invitesQuery.refetch();
    } catch {
      // Failed creates leave the existing list untouched; the user can retry.
    }
  };

  const copyInvite = async (invite: MobileServerInvite) => {
    try {
      await Clipboard.setStringAsync(invite.shareUrl);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId((current) => (current === invite.id ? null : current)), 2_000);
    } catch {
      // Clipboard access is best-effort; the share action remains available.
    }
  };

  const headerNode = (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={labels.serverInvitesBack}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        testID="mobile-server-invites-back"
      >
        <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} strokeWidth={2.2} />
      </Pressable>
      <View style={styles.headerBody}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
          {labels.serverInvitesTitle}
        </Text>
      </View>
    </View>
  );

  const createButton = (
    <Pressable
      accessibilityLabel={labels.serverInvitesCreate}
      accessibilityRole="button"
      accessibilityState={{ busy: mutations.createInvite.isPending }}
      disabled={mutations.createInvite.isPending}
      onPress={() => void createInvite()}
      style={({ pressed }) => [
        styles.createButton,
        mutations.createInvite.isPending && styles.createButtonDisabled,
        pressed && !mutations.createInvite.isPending && styles.pressed,
      ]}
      testID="mobile-server-invites-create"
    >
      <Ionicons color={theme.text.onPrimary} name="add" size={18} />
      <Text style={styles.createButtonText}>{labels.serverInvitesCreate}</Text>
    </Pressable>
  );

  if (invitesQuery.isLoading) {
    return (
      <View style={styles.root} testID="mobile-server-invites-screen">
        {headerNode}
        {createButton}
        <View testID="mobile-server-invites-loading">
          {[0, 1, 2].map((index) => (
            <View key={index} style={styles.skeletonCard}>
              <Skeleton height={38} />
              <Skeleton height={14} width="70%" />
              <Skeleton height={44} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (invitesQuery.isError) {
    return (
      <View style={styles.root} testID="mobile-server-invites-screen">
        {headerNode}
        <Text accessibilityRole="alert" style={styles.error}>
          {labels.serverInvitesError}
        </Text>
        <View style={{ marginHorizontal: 20, marginTop: 16 }}>
          <Button label={labels.serverInvitesRetry} onPress={() => void invitesQuery.refetch()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="mobile-server-invites-screen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {headerNode}
        {createButton}

        {invites.length === 0 ? (
          <EmptyState
            description={labels.serverInvitesEmptyBody}
            icon="link-outline"
            style={styles.state}
            testID="mobile-server-invites-empty"
            title={labels.serverInvitesEmptyTitle}
          />
        ) : (
          invites.map((invite) => {
            const copied = copiedId === invite.id;
            return (
              <View
                key={invite.id}
                style={styles.card}
                testID={`mobile-server-invite-${invite.id}`}
              >
                <View style={styles.codeRow}>
                  <View style={styles.codeBadge}>
                    <Ionicons color={theme.accent.default} name="link" size={17} />
                  </View>
                  <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.codeText}>
                    {inviteCode(invite.shareUrl)}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>{formatInviteUses(labels, invite.uses, invite.maxUses)}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      {formatExpiry(invite.expiresAt, locale, labels.serverInvitesNeverExpires)}
                    </Text>
                  </View>
                  {invite.maxUses === null ? (
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{labels.serverInvitesUnlimited}</Text>
                    </View>
                  ) : null}
                </View>
                <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.createdBy}>
                  {labels.serverInvitesCreatedBy.replace("{name}", invite.createdByDisplayName)}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityLabel={copied ? labels.serverInvitesCopied : labels.serverInvitesCopy}
                    accessibilityRole="button"
                    onPress={() => void copyInvite(invite)}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                    testID={`mobile-server-invite-${invite.id}-copy`}
                  >
                    <Ionicons
                      color={copied ? theme.status.success : theme.text.primary}
                      name={copied ? "checkmark" : "copy-outline"}
                      size={16}
                    />
                    <Text style={styles.actionText}>{copied ? labels.serverInvitesCopied : labels.serverInvitesCopy}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={labels.serverInvitesShare}
                    accessibilityRole="button"
                    onPress={() => void shareMobileInviteUrl(invite.shareUrl)}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                    testID={`mobile-server-invite-${invite.id}-share`}
                  >
                    <Ionicons color={theme.text.primary} name="share-outline" size={16} />
                    <Text style={styles.actionText}>{labels.serverInvitesShare}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={labels.serverInvitesDelete}
                    accessibilityRole="button"
                    onPress={() => setPendingDelete(invite)}
                    style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}
                    testID={`mobile-server-invite-${invite.id}-delete`}
                  >
                    <Ionicons color={theme.status.danger} name="trash-outline" size={16} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <DestructiveConfirmationSheet
        body={labels.serverInvitesDeleteBody}
        busy={mutations.deleteInvite.isPending}
        confirmLabel={labels.serverInvitesDelete}
        icon="trash-outline"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mutations.deleteInvite.mutateAsync({
              inviteId: pendingDelete.id,
              serverId,
            });
          } finally {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
        testID="mobile-server-invite-delete-confirm"
        title={labels.serverInvitesDeleteTitle}
      />
    </View>
  );
}
