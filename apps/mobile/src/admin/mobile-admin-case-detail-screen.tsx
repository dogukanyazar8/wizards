import { useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Button, Skeleton, useToast } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useMobileNetworkStatus } from "../app/providers/mobile-network-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import { mobileCopy } from "../locale/mobile-copy";
import {
  MobileAdminPriorityChip,
  getMobileAdminCopyLabels,
  isMobileAdminForbidden,
} from "./mobile-admin-cases-screen";
import {
  MOBILE_ADMIN_RESOLUTION_MAX_LENGTH,
  canClaimMobileAdminCase,
  canRunMobileAdminAction,
  formatMobileAdminCaseAge,
  formatMobileAdminCaseNumber,
  getMobileAdminPriorityLabel,
  getMobileAdminPriorityTone,
  getMobileAdminReasonLabel,
  getMobileAdminStatusLabel,
  isMobileAdminResolutionValid,
} from "./mobile-admin-model";
import {
  useMobileAdminCaseQuery,
  useMobileAdminClaimMutation,
  useMobileAdminDismissMutation,
  useMobileAdminEscalateMutation,
} from "./mobile-admin-query";
import { useMobileAdminStyles } from "./mobile-admin-screen.styles";

export const MOBILE_ADMIN_CASE_DETAIL_TEST_ID = "mobile-admin-case-detail-screen";

export interface MobileAdminCaseDetailScreenProps {
  caseId: string;
  onBack(): void;
}

/**
 * F7 case file. Three decisions and nothing else: take it, close it with a
 * reason, or hand it to the desktop. Banning an account and deleting a message
 * are absent because those endpoints do not exist on this surface — a hidden
 * button is not a boundary, a missing route is.
 */
export function MobileAdminCaseDetailScreen({ caseId, onBack }: MobileAdminCaseDetailScreenProps) {
  const styles = useMobileAdminStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const labels = useMemo(() => getMobileAdminCopyLabels(copy), [copy]);
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();
  const networkStatus = useMobileNetworkStatus();

  const caseQuery = useMobileAdminCaseQuery(apiClient, caseId, true);
  const claimMutation = useMobileAdminClaimMutation(apiClient, caseId);
  const dismissMutation = useMobileAdminDismissMutation(apiClient, caseId);
  const escalateMutation = useMobileAdminEscalateMutation(apiClient, caseId);

  const [composer, setComposer] = useState<"dismiss" | "escalate" | null>(null);
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");

  const moderationCase = caseQuery.data?.case ?? null;
  const pending =
    claimMutation.isPending || dismissMutation.isPending || escalateMutation.isPending;
  // F test 6: offline is a hard stop on this surface. The cached case file stays
  // readable, the buttons go dead, and nothing is queued for later.
  const actionsEnabled = canRunMobileAdminAction({ networkStatus, pending });
  const now = useMemo(
    () => new Date(caseQuery.dataUpdatedAt || Date.now()),
    [caseQuery.dataUpdatedAt],
  );

  const failAction = (error: unknown) => {
    showToast({
      title: isMobileAdminForbidden(error) ? copy.adminQueueForbidden : copy.adminActionFailed,
      variant: "error",
    });
  };

  const runClaim = () => {
    claimMutation.mutate(undefined, {
      onError: failAction,
      onSuccess: () => showToast({ title: copy.adminClaimedToast, variant: "success" }),
    });
  };

  const runDismiss = () => {
    if (!isMobileAdminResolutionValid(resolution)) {
      return;
    }

    dismissMutation.mutate(resolution.trim(), {
      onError: failAction,
      onSuccess: () => {
        setComposer(null);
        setResolution("");
        showToast({ title: copy.adminDismissedToast, variant: "success" });
      },
    });
  };

  const runEscalate = () => {
    escalateMutation.mutate(note.trim() || undefined, {
      onError: failAction,
      onSuccess: () => {
        setComposer(null);
        setNote("");
        showToast({ title: copy.adminEscalatedToast, variant: "success" });
      },
    });
  };

  return (
    <View style={styles.root} testID={MOBILE_ADMIN_CASE_DETAIL_TEST_ID}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.backAction}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          testID="mobile-admin-case-back"
        >
          <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {moderationCase
              ? formatMobileAdminCaseNumber(moderationCase.publicNumber)
              : copy.adminQueueTitle}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {moderationCase ? `@${moderationCase.subjectHandle}` : copy.adminQueueSubtitle}
          </Text>
        </View>
      </View>

      {networkStatus === "offline" ? (
        <View style={styles.offlineNotice} testID="mobile-admin-case-offline-notice">
          <Text style={styles.offlineNoticeText}>{copy.adminOfflineNotice}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {caseQuery.isPending ? (
          <View style={styles.card} testID="mobile-admin-case-loading">
            <Skeleton height={64} />
          </View>
        ) : caseQuery.isError || !moderationCase ? (
          <View style={styles.stateCard} testID="mobile-admin-case-error">
            <Text style={styles.stateText}>
              {isMobileAdminForbidden(caseQuery.error)
                ? copy.adminQueueForbidden
                : copy.adminCaseLoadError}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card} testID="mobile-admin-case-summary">
              <View style={styles.caseRowTop}>
                <MobileAdminPriorityChip
                  label={getMobileAdminPriorityLabel(moderationCase.priority, labels.priority)}
                  styles={styles}
                  tone={getMobileAdminPriorityTone(moderationCase.priority)}
                />
                <View style={styles.statusChip}>
                  <Text style={styles.statusChipLabel}>
                    {getMobileAdminStatusLabel(moderationCase.status, labels.status)}
                  </Text>
                </View>
                <Text style={styles.caseAge}>
                  {formatMobileAdminCaseAge(moderationCase.openedAt, now, labels.age)}
                </Text>
              </View>
              <Text style={styles.caseMeta}>
                {copy.adminCaseReportCount.replace("{count}", String(moderationCase.reportCount))}
              </Text>
              <Text style={styles.caseMeta} testID="mobile-admin-case-assignee">
                {moderationCase.assigneeHandle
                  ? copy.adminCaseAssignee.replace("{handle}", `@${moderationCase.assigneeHandle}`)
                  : copy.adminCaseUnassigned}
              </Text>
            </View>

            <View style={styles.card} testID="mobile-admin-case-reports">
              <Text style={styles.sectionTitle}>{copy.adminCaseReportsTitle}</Text>
              {moderationCase.reports.map((report, index) => (
                <View
                  key={report.reportId}
                  style={[styles.reportRow, index === 0 && styles.reportRowFirst]}
                >
                  <Text style={styles.reportReason}>
                    {getMobileAdminReasonLabel(report.reason, labels.reason)}
                  </Text>
                  {report.details ? (
                    <Text style={styles.reportDetails}>{report.details}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.card} testID="mobile-admin-case-evidence">
              <Text style={styles.sectionTitle}>{copy.adminCaseEvidenceTitle}</Text>
              {moderationCase.evidence.length === 0 ? (
                <Text style={styles.stateText}>{copy.adminCaseEvidenceEmpty}</Text>
              ) : (
                moderationCase.evidence.map((entry) => (
                  <View key={entry.evidenceId} style={{ gap: 4 }}>
                    <Text style={styles.evidenceScope}>
                      {entry.scope ?? copy.adminEvidenceScopeUnknown}
                    </Text>
                    <Text style={styles.evidencePreview}>{entry.preview}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.actionStack}>
              {canClaimMobileAdminCase(moderationCase) ? (
                <Button
                  busy={claimMutation.isPending}
                  disabled={!actionsEnabled}
                  fullWidth
                  icon="hand-left-outline"
                  label={copy.adminActionClaim}
                  onPress={runClaim}
                  testID="mobile-admin-action-claim"
                />
              ) : null}

              {composer === "dismiss" ? (
                <>
                  <TextInput
                    accessibilityLabel={copy.adminDismissPlaceholder}
                    editable={actionsEnabled}
                    maxLength={MOBILE_ADMIN_RESOLUTION_MAX_LENGTH}
                    multiline
                    onChangeText={setResolution}
                    placeholder={copy.adminDismissPlaceholder}
                    placeholderTextColor={theme.text.placeholder}
                    style={styles.reasonInput}
                    testID="mobile-admin-dismiss-reason"
                    value={resolution}
                  />
                  <Button
                    busy={dismissMutation.isPending}
                    // A dismissal without a reason is not a decision anyone can
                    // audit later, so the button stays closed until there is one.
                    disabled={!actionsEnabled || !isMobileAdminResolutionValid(resolution)}
                    fullWidth
                    label={copy.adminDismissTitle}
                    onPress={runDismiss}
                    testID="mobile-admin-dismiss-confirm"
                    variant="danger"
                  />
                </>
              ) : (
                <Button
                  disabled={!actionsEnabled}
                  fullWidth
                  icon="close-circle-outline"
                  label={copy.adminActionDismiss}
                  onPress={() => setComposer("dismiss")}
                  testID="mobile-admin-action-dismiss"
                  variant="secondary"
                />
              )}

              {composer === "escalate" ? (
                <>
                  <TextInput
                    accessibilityLabel={copy.adminEscalatePlaceholder}
                    editable={actionsEnabled}
                    maxLength={MOBILE_ADMIN_RESOLUTION_MAX_LENGTH}
                    multiline
                    onChangeText={setNote}
                    placeholder={copy.adminEscalatePlaceholder}
                    placeholderTextColor={theme.text.placeholder}
                    style={styles.reasonInput}
                    testID="mobile-admin-escalate-note"
                    value={note}
                  />
                  <Button
                    busy={escalateMutation.isPending}
                    disabled={!actionsEnabled}
                    fullWidth
                    label={copy.adminEscalateTitle}
                    onPress={runEscalate}
                    testID="mobile-admin-escalate-confirm"
                  />
                </>
              ) : (
                <Button
                  disabled={!actionsEnabled}
                  fullWidth
                  icon="desktop-outline"
                  label={copy.adminActionEscalate}
                  onPress={() => setComposer("escalate")}
                  testID="mobile-admin-action-escalate"
                  variant="secondary"
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
