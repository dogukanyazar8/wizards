import { useCallback, useMemo } from "react";
import { FlashList } from "@shopify/flash-list";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import type { MobileAdminCaseSummary } from "@wizards/types";

import { MobileApiError } from "../api/mobile-api-client";
import { EmptyState, Skeleton } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useMobileNetworkStatus } from "../app/providers/mobile-network-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { mobileCopy } from "../locale/mobile-copy";
import {
  formatMobileAdminCaseAge,
  formatMobileAdminCaseNumber,
  getMobileAdminPriorityLabel,
  getMobileAdminPriorityTone,
  getMobileAdminStatusLabel,
} from "./mobile-admin-model";
import { useMobileAdminCasesQuery } from "./mobile-admin-query";
import { useMobileAdminStyles, type MobileAdminStyles } from "./mobile-admin-screen.styles";

export const MOBILE_ADMIN_CASES_SCREEN_TEST_ID = "mobile-admin-cases-screen";

type AdminCopy = (typeof mobileCopy)[keyof typeof mobileCopy];

export function getMobileAdminCopyLabels(copy: AdminCopy) {
  return {
    age: {
      days: copy.adminAgeDays,
      hours: copy.adminAgeHours,
      justNow: copy.adminAgeJustNow,
      minutes: copy.adminAgeMinutes,
    },
    priority: {
      high: copy.adminPriorityHigh,
      low: copy.adminPriorityLow,
      normal: copy.adminPriorityNormal,
      urgent: copy.adminPriorityUrgent,
    },
    reason: {
      harassment: copy.adminReasonHarassment,
      impersonation: copy.adminReasonImpersonation,
      inappropriate: copy.adminReasonInappropriate,
      other: copy.adminReasonOther,
      spam: copy.adminReasonSpam,
    },
    status: {
      actioned: copy.adminStatusActioned,
      appealed: copy.adminStatusAppealed,
      closed: copy.adminStatusClosed,
      dismissed: copy.adminStatusDismissed,
      inReview: copy.adminStatusInReview,
      open: copy.adminStatusOpen,
    },
  };
}

/**
 * A 403 is the honest answer for a deep link opened by someone whose admin
 * membership was revoked — or who never had one and simply pasted the URL. The
 * screen says so instead of pretending the queue is empty.
 */
export function isMobileAdminForbidden(error: unknown): boolean {
  return error instanceof MobileApiError && (error.status === 401 || error.status === 403);
}

export function MobileAdminPriorityChip({
  label,
  styles,
  tone,
}: {
  readonly label: string;
  readonly styles: MobileAdminStyles;
  readonly tone: ReturnType<typeof getMobileAdminPriorityTone>;
}) {
  return (
    <View
      style={[
        styles.priorityChip,
        tone === "critical"
          ? styles.priorityChipCritical
          : tone === "high"
            ? styles.priorityChipHigh
            : tone === "muted"
              ? styles.priorityChipMuted
              : styles.priorityChipNormal,
      ]}
      testID={`mobile-admin-priority-${tone}`}
    >
      <Text
        style={[
          styles.priorityChipLabel,
          tone === "critical"
            ? styles.priorityChipLabelCritical
            : tone === "high"
              ? styles.priorityChipLabelHigh
              : styles.priorityChipLabelNormal,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export interface MobileAdminCasesScreenProps {
  onBack(): void;
  onOpenCase(caseId: string): void;
}

/**
 * F7 triage queue. The server already returns the cases in priority-then-age
 * order and caps the page, so this screen sorts nothing and filters nothing —
 * a phone is for "what is loudest right now", not for queue management.
 */
export function MobileAdminCasesScreen({ onBack, onOpenCase }: MobileAdminCasesScreenProps) {
  const styles = useMobileAdminStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const labels = useMemo(() => getMobileAdminCopyLabels(copy), [copy]);
  const { apiClient } = useMobileAuth();
  const networkStatus = useMobileNetworkStatus();
  const casesQuery = useMobileAdminCasesQuery(apiClient, true);
  const cases = casesQuery.data?.cases ?? [];
  // Ages are read against the moment the page was fetched, so a list sitting on
  // screen does not tick a new Date into every recycled row.
  const now = useMemo(
    () => new Date(casesQuery.dataUpdatedAt || Date.now()),
    [casesQuery.dataUpdatedAt],
  );

  const renderCase = useCallback(
    ({ item }: { item: MobileAdminCaseSummary }) => (
      <Pressable
        accessibilityLabel={formatMobileAdminCaseNumber(item.publicNumber)}
        accessibilityRole="button"
        onPress={() => onOpenCase(item.caseId)}
        style={({ pressed }) => [styles.caseRow, pressed && styles.pressed]}
        testID={`mobile-admin-case-${item.caseId}`}
      >
        <View style={styles.caseRowTop}>
          <Text style={styles.caseNumber}>{formatMobileAdminCaseNumber(item.publicNumber)}</Text>
          <MobileAdminPriorityChip
            label={getMobileAdminPriorityLabel(item.priority, labels.priority)}
            styles={styles}
            tone={getMobileAdminPriorityTone(item.priority)}
          />
          <Text style={styles.caseAge}>
            {formatMobileAdminCaseAge(item.openedAt, now, labels.age)}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.caseSubject}>
          {`@${item.subjectHandle}`}
        </Text>
        <View style={styles.caseMetaRow}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipLabel}>
              {getMobileAdminStatusLabel(item.status, labels.status)}
            </Text>
          </View>
          <Text style={styles.caseMeta}>
            {copy.adminCaseReportCount.replace("{count}", String(item.reportCount))}
          </Text>
          <Text numberOfLines={1} style={styles.caseMeta}>
            {item.assigneeHandle
              ? copy.adminCaseAssignee.replace("{handle}", `@${item.assigneeHandle}`)
              : copy.adminCaseUnassigned}
          </Text>
        </View>
      </Pressable>
    ),
    [copy, labels, now, onOpenCase, styles],
  );

  return (
    <View style={styles.root} testID={MOBILE_ADMIN_CASES_SCREEN_TEST_ID}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.backAction}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          testID="mobile-admin-cases-back"
        >
          <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {copy.adminQueueTitle}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {copy.adminQueueSubtitle}
          </Text>
        </View>
      </View>

      {networkStatus === "offline" ? (
        <View style={styles.offlineNotice} testID="mobile-admin-offline-notice">
          <Text style={styles.offlineNoticeText}>{copy.adminOfflineNotice}</Text>
        </View>
      ) : null}

      {casesQuery.isPending ? (
        <View style={styles.content} testID="mobile-admin-cases-loading">
          <View style={styles.card}>
            <Skeleton height={52} />
          </View>
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.content}>
          <View style={styles.stateCard} testID="mobile-admin-cases-error">
            <Text style={styles.stateText}>
              {isMobileAdminForbidden(casesQuery.error)
                ? copy.adminQueueForbidden
                : copy.adminQueueLoadError}
            </Text>
          </View>
        </View>
      ) : (
        <FlashList
          contentContainerStyle={styles.content}
          data={cases}
          // One row shape, so recycling never has to switch layouts.
          getItemType={() => "admin-case"}
          keyExtractor={(item) => item.caseId}
          ListEmptyComponent={
            <EmptyState
              description={copy.adminQueueEmptyDescription}
              icon="shield-checkmark-outline"
              testID="mobile-admin-cases-empty"
              title={copy.adminQueueEmptyTitle}
            />
          }
          onRefresh={() => void casesQuery.refetch()}
          refreshing={casesQuery.isRefetching}
          renderItem={renderCase}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
