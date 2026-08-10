import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ServerScheduledEvent } from "@wizards/types";

import {
  cancelMobileServerEvent,
  fetchMobileServerEvents,
  fetchMobileServerProfile,
  setMobileServerEventInterest,
} from "../../../about/mobile-community-invite-client";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { mobileCopy } from "../../../locale/mobile-copy";
import { mobileQueryKeys } from "../../../query/mobile-query-keys";
import { DestructiveConfirmationSheet, Skeleton, useToast } from "../../components/kit";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import {
  formatMobileEventDateBlock,
  resolveMobileEventAction,
  splitMobileServerEvents,
} from "../../mobile-sunucular-model";
import { createMobileServerEventStyles } from "./server-events-screen.styles";

export interface MobileServerEventsScreenProps {
  readonly onBack: () => void;
  readonly onOpenChannel: (serverId: string, channelId: string) => void;
  readonly onOpenForm: (serverId: string, eventId?: string) => void;
  readonly serverId: string;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Faz 5 §D1. The 6d card's "see all" and the manager's way in. Both sections
 * come from one read (`includePast=true`) and are split by `status` in the pure
 * model, so the list never disagrees with the card about what is upcoming.
 */
export function MobileServerEventsScreen({
  onBack,
  onOpenChannel,
  onOpenForm,
  serverId,
}: MobileServerEventsScreenProps) {
  const auth = useMobileAuth();
  const queryClient = useQueryClient();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerEventStyles);
  const safeArea = useSafeAreaInsets();
  const { showToast } = useToast();
  const [pendingCancel, setPendingCancel] = useState<ServerScheduledEvent | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const signedIn = auth.status === "signed-in";
  const eventsQuery = useQuery({
    enabled: signedIn,
    queryFn: () => fetchMobileServerEvents(auth.apiClient, serverId, { includePast: true }),
    queryKey: mobileQueryKeys.serverEvents(serverId),
    retry: false,
  });
  // `canManageServer` lives on the profile read model, which this server's
  // profile screen has already cached; nothing else here needs a second read.
  const profileQuery = useQuery({
    enabled: signedIn,
    queryFn: () => fetchMobileServerProfile(auth.apiClient, serverId),
    queryKey: mobileQueryKeys.serverProfile(serverId),
    retry: false,
  });
  const canManageServer = profileQuery.data?.canManageServer === true;

  const sections = useMemo(
    () => splitMobileServerEvents(eventsQuery.data?.events ?? []),
    [eventsQuery.data?.events],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.serverEvents(serverId) });
    await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.serverProfile(serverId) });
  }, [queryClient, serverId]);

  const toggleInterest = useCallback(
    async (event: ServerScheduledEvent) => {
      try {
        await setMobileServerEventInterest(
          auth.apiClient,
          { eventId: event.id, serverId },
          !event.viewerInterested,
        );
        await refresh();
      } catch {
        showToast({ title: copy.serverEventInterestFailed, variant: "error" });
      }
    },
    [auth.apiClient, copy.serverEventInterestFailed, refresh, serverId, showToast],
  );

  const confirmCancel = useCallback(async () => {
    if (!pendingCancel) {
      return;
    }

    setCancelling(true);
    try {
      await cancelMobileServerEvent(auth.apiClient, {
        eventId: pendingCancel.id,
        serverId,
      });
      setPendingCancel(null);
      await refresh();
    } catch {
      showToast({ title: copy.serverEventCancelFailed, variant: "error" });
    } finally {
      setCancelling(false);
    }
  }, [auth.apiClient, copy.serverEventCancelFailed, pendingCancel, refresh, serverId, showToast]);

  const renderEvent = (event: ServerScheduledEvent) => {
    const now = Date.now();
    const dateBlock = formatMobileEventDateBlock(event, now, locale);
    const action = resolveMobileEventAction(event, now);

    return (
      <View key={event.id} style={styles.eventCard} testID={`mobile-server-event-${event.id}`}>
        <View style={styles.eventDateBlock}>
          <Text allowFontScaling={false} style={styles.eventDateLabel}>
            {dateBlock.label}
          </Text>
          <Text allowFontScaling={false} style={styles.eventDateTime}>
            {dateBlock.time}
          </Text>
        </View>
        <View style={styles.eventBody}>
          <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.eventName}>
            {event.name}
          </Text>
          <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.eventMeta}>
            {fill(copy.eventSubtitle, {
              channel: event.channelName ?? event.externalLocation ?? "",
              count: String(event.attendeeCount),
            })}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.eventMeta}>
            {fill(copy.serverEventInterestCount, { count: String(event.interestedCount) })}
          </Text>
          {event.status === "CANCELLED" || event.status === "COMPLETED" ? (
            <View style={styles.statusChip}>
              <Text allowFontScaling={false} style={styles.statusChipText}>
                {event.status === "CANCELLED"
                  ? copy.serverEventCancelled
                  : copy.serverEventCompleted}
              </Text>
            </View>
          ) : (
            <View style={styles.eventActions}>
              {action ? (
                <Pressable
                  accessibilityLabel={action.kind === "join" ? copy.eventJoin : copy.eventRemind}
                  accessibilityRole="button"
                  onPress={() => {
                    if (action.kind === "join" && event.channelId) {
                      onOpenChannel(serverId, event.channelId);
                      return;
                    }
                    void toggleInterest(event);
                  }}
                  style={({ pressed }) => [styles.eventPill, pressed && styles.pressed]}
                  testID={`mobile-server-event-action-${event.id}`}
                >
                  <Text allowFontScaling={false} style={styles.eventPillText}>
                    {action.kind === "join"
                      ? copy.eventJoin
                      : event.viewerInterested
                        ? copy.serverEventReminderOn
                        : copy.eventRemind}
                  </Text>
                </Pressable>
              ) : null}
              {canManageServer ? (
                <>
                  <Pressable
                    accessibilityLabel={copy.serverEventEdit}
                    accessibilityRole="button"
                    onPress={() => onOpenForm(serverId, event.id)}
                    style={({ pressed }) => [styles.eventPill, pressed && styles.pressed]}
                    testID={`mobile-server-event-edit-${event.id}`}
                  >
                    <Text allowFontScaling={false} style={styles.eventPillText}>
                      {copy.serverEventEdit}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={copy.serverEventCancelAction}
                    accessibilityRole="button"
                    onPress={() => setPendingCancel(event)}
                    style={({ pressed }) => [
                      styles.eventPill,
                      styles.eventPillDanger,
                      pressed && styles.pressed,
                    ]}
                    testID={`mobile-server-event-cancel-${event.id}`}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[styles.eventPillText, styles.eventPillDangerText]}
                    >
                      {copy.serverEventCancelAction}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root} testID="mobile-server-events-screen">
      <View style={[styles.header, { paddingTop: safeArea.top + 10 }]}>
        <Pressable
          accessibilityLabel={copy.authBackAction}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          testID="mobile-server-events-back"
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={16} />
        </Pressable>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.headerTitle}>
          {copy.serverEventsTitle}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-server-events-scroll"
      >
        {eventsQuery.isPending ? (
          <View testID="mobile-server-events-loading">
            <Skeleton height={84} width="100%" />
          </View>
        ) : eventsQuery.data === undefined ? (
          <View style={styles.empty} testID="mobile-server-events-error">
            <Text maxFontSizeMultiplier={2} style={styles.emptyText}>
              {copy.serverEventsLoadFailed}
            </Text>
          </View>
        ) : sections.upcoming.length === 0 && sections.past.length === 0 ? (
          <View style={styles.empty} testID="mobile-server-events-empty">
            <Text maxFontSizeMultiplier={2} style={styles.emptyText}>
              {copy.serverEventsEmpty}
            </Text>
          </View>
        ) : (
          <>
            {sections.upcoming.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text allowFontScaling={false} style={styles.sectionLabel}>
                    {copy.serverEventsUpcoming}
                  </Text>
                </View>
                {sections.upcoming.map(renderEvent)}
              </>
            ) : null}
            {sections.past.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text allowFontScaling={false} style={styles.sectionLabel}>
                    {copy.serverEventsPast}
                  </Text>
                </View>
                {sections.past.map(renderEvent)}
              </>
            ) : null}
          </>
        )}

        {canManageServer ? (
          <Pressable
            accessibilityLabel={copy.serverEventCreate}
            accessibilityRole="button"
            onPress={() => onOpenForm(serverId)}
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
            testID="mobile-server-events-create"
          >
            <Text maxFontSizeMultiplier={2} style={styles.primaryActionLabel}>
              {copy.serverEventCreate}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <DestructiveConfirmationSheet
        body={fill(copy.serverEventCancelBody, { event: pendingCancel?.name ?? "" })}
        busy={cancelling}
        confirmLabel={copy.serverEventCancelConfirm}
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          void confirmCancel();
        }}
        open={pendingCancel !== null}
        testID="mobile-server-event-cancel-confirm"
        title={copy.serverEventCancelTitle}
      />
    </View>
  );
}
