import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  type AccountDeletionPreflight,
} from "@wizards/types";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  consumePendingMobileAccountDeletionReauth,
  subscribeMobileAccountDeletionReauth,
} from "../../account/mobile-account-deletion-reauth-session";
import {
  deleteMobileAccountExportFile,
  downloadMobileAccountExportFile,
} from "../../account/mobile-account-export-download.native";
import {
  deleteMobileAccount,
  fetchMobileAccountDeletionPreflight,
  confirmMobileAccountDeletionEmailReauth,
  reauthenticateMobileAccountDeletion,
  requestMobileAccountDeletionEmailReauth,
} from "../../account/mobile-account-privacy-client";
import {
  clearMobileAccountExportState,
  readMobileAccountExportState,
  writeMobileAccountExportState,
  type MobileAccountExportState,
} from "../../account/mobile-account-export-state";
import { shareMobileAccountExportFile } from "../../account/mobile-account-export-share.native";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { mobileCopy } from "../../locale/mobile-copy";
import { mobileNavigationRef } from "../../navigation/mobile-navigation-ref";
import { Button, DestructiveConfirmationSheet } from "../components/kit";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileDataAccountSettingsStyles } from "./mobile-data-account-settings-screen.styles";

export function MobileDataAccountSettingsScreen({ onBack }: { readonly onBack: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMobileDataAccountSettingsStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { apiClient, session, signOut } = useMobileAuth();
  const userId = session?.user.id ?? null;
  const [exportState, setExportState] = useState<MobileAccountExportState | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteFlowOpen, setDeleteFlowOpen] = useState(false);
  const [preflight, setPreflight] = useState<AccountDeletionPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readMobileAccountExportState(AsyncStorage, userId)
      .then((state) => active && setExportState(state))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const loadPreflight = useCallback(async () => {
    setPreflightLoading(true);
    setFeedback(null);
    try {
      setPreflight(await fetchMobileAccountDeletionPreflight(apiClient));
    } catch {
      setFeedback(copy.dataAccountDeletePreflightError);
    } finally {
      setPreflightLoading(false);
    }
  }, [apiClient, copy.dataAccountDeletePreflightError]);

  const confirmEmailReauth = useCallback(
    async (token: string) => {
      setDeleteFlowOpen(true);
      setReauthBusy(true);
      setFeedback(null);
      try {
        const [verifiedToken] = await Promise.all([
          confirmMobileAccountDeletionEmailReauth(apiClient, token),
          loadPreflight(),
        ]);
        setReauthToken(verifiedToken);
        setFeedback(copy.dataAccountDeleteReauthReady);
      } catch {
        setFeedback(copy.dataAccountDeleteReauthError);
      } finally {
        setReauthBusy(false);
      }
    },
    [
      apiClient,
      copy.dataAccountDeleteReauthError,
      copy.dataAccountDeleteReauthReady,
      loadPreflight,
    ],
  );

  useEffect(() => {
    const unsubscribe = subscribeMobileAccountDeletionReauth((token) => {
      void confirmEmailReauth(token);
    });
    const pendingToken = consumePendingMobileAccountDeletionReauth();
    if (pendingToken) void confirmEmailReauth(pendingToken);
    return unsubscribe;
  }, [confirmEmailReauth]);

  const persistExportState = async (state: MobileAccountExportState) => {
    setExportState(state);
    if (userId)
      await writeMobileAccountExportState(AsyncStorage, userId, state).catch(() => undefined);
  };

  const downloadExport = async () => {
    if (!userId || exportBusy) return;
    const startedAt = new Date().toISOString();
    setExportBusy(true);
    await persistExportState({ startedAt, status: "downloading" });
    try {
      const fileUri = await downloadMobileAccountExportFile(apiClient);
      await persistExportState({ fileUri, startedAt, status: "ready" });
    } catch {
      await persistExportState({ startedAt, status: "error" });
    } finally {
      setExportBusy(false);
    }
  };

  const shareExport = async () => {
    if (exportState?.status !== "ready") return;
    await shareMobileAccountExportFile(exportState.fileUri).catch(() => undefined);
  };

  const openDeleteFlow = () => {
    setDeleteFlowOpen(true);
    setReauthToken(null);
    setPassword("");
    void loadPreflight();
  };

  const reauthenticate = async () => {
    if (!preflight || reauthBusy) return;
    setReauthBusy(true);
    setFeedback(null);
    try {
      if (preflight.reauthMethod === "PASSWORD") {
        setReauthToken(await reauthenticateMobileAccountDeletion(apiClient, password));
        setFeedback(copy.dataAccountDeleteReauthReady);
      } else {
        await requestMobileAccountDeletionEmailReauth(apiClient);
        setFeedback(copy.dataAccountDeleteEmailSent);
      }
    } catch {
      setFeedback(copy.dataAccountDeleteReauthError);
    } finally {
      setReauthBusy(false);
    }
  };

  const executeDelete = async () => {
    if (!reauthToken || deleteBusy) return;
    setDeleteBusy(true);
    setFeedback(null);
    try {
      await deleteMobileAccount(apiClient, reauthToken);
      try {
        if (exportState?.status === "ready") {
          deleteMobileAccountExportFile(exportState.fileUri);
        }
        if (userId) await clearMobileAccountExportState(AsyncStorage, userId);
      } catch {
        // Server deletion already succeeded; local session wipe remains mandatory.
      }
      setFinalConfirmOpen(false);
      await signOut();
    } catch {
      setDeleteBusy(false);
      setFinalConfirmOpen(false);
      setFeedback(copy.dataAccountDeleteError);
    }
  };

  const exportFeedback =
    exportState?.status === "ready"
      ? copy.dataAccountExportReady
      : exportState?.status === "interrupted"
        ? copy.dataAccountExportInterrupted
        : exportState?.status === "error"
          ? copy.dataAccountExportError
          : exportState?.status === "downloading"
            ? copy.dataAccountExportDownloading
            : null;

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top}
        style={styles.root}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.root}
          testID="mobile-data-account-settings-screen"
        >
          <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
            <Pressable
              accessibilityLabel={copy.authBackAction}
              accessibilityRole="button"
              onPress={deleteFlowOpen ? () => setDeleteFlowOpen(false) : onBack}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              testID="mobile-data-account-settings-back"
            >
              <View style={styles.backVisual}>
                <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
              </View>
            </Pressable>
            <View style={styles.headerText}>
              <Text numberOfLines={1} style={styles.title}>
                {deleteFlowOpen ? copy.dataAccountDeleteFlowTitle : copy.dataAccountTitle}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {deleteFlowOpen ? copy.dataAccountDeleteFlowSubtitle : copy.dataAccountSubtitle}
              </Text>
            </View>
          </View>

          {deleteFlowOpen ? (
            <View style={styles.flowBody}>
              <View style={styles.warning}>
                <Text style={styles.warningTitle}>{copy.dataAccountDeleteTitle}</Text>
                <Text style={styles.warningText}>{copy.dataAccountDeleteConsequences}</Text>
              </View>
              {preflightLoading ? (
                <Text style={styles.feedback}>{copy.dataAccountDeleteLoading}</Text>
              ) : null}
              {preflight?.ownedServers.length ? (
                <View style={styles.warning} testID="mobile-account-delete-blockers">
                  <Text style={styles.warningTitle}>{copy.dataAccountDeleteBlocked}</Text>
                  <View style={styles.serverList}>
                    {preflight.ownedServers.map((server) => (
                      <View key={server.id} style={styles.serverRow}>
                        <Ionicons color={theme.status.warning} name="alert-circle" size={15} />
                        <Text style={styles.serverName}>{server.name}</Text>
                      </View>
                    ))}
                  </View>
                  <Button
                    fullWidth
                    label={copy.dataAccountDeleteManageServers}
                    onPress={() =>
                      mobileNavigationRef.isReady() &&
                      mobileNavigationRef.navigate("MainTabs", { screen: "overview" })
                    }
                    testID="mobile-account-delete-manage-servers"
                    variant="secondary"
                  />
                </View>
              ) : null}
              {preflight?.canDelete ? (
                <View style={styles.card}>
                  {preflight.reauthMethod === "PASSWORD" ? (
                    <>
                      <Text style={styles.label}>{copy.dataAccountDeletePassword}</Text>
                      <TextInput
                        autoCapitalize="none"
                        autoComplete="current-password"
                        autoCorrect={false}
                        onChangeText={setPassword}
                        placeholder={copy.dataAccountDeletePasswordPlaceholder}
                        placeholderTextColor={theme.text.soft}
                        secureTextEntry
                        style={styles.input}
                        testID="mobile-account-delete-password"
                        value={password}
                      />
                    </>
                  ) : (
                    <Text style={styles.cardDescription}>{copy.dataAccountDeleteEmailReauth}</Text>
                  )}
                  <Button
                    busy={reauthBusy}
                    disabled={
                      reauthBusy ||
                      reauthToken !== null ||
                      (preflight.reauthMethod === "PASSWORD" && password.length === 0)
                    }
                    fullWidth
                    label={
                      reauthBusy
                        ? copy.dataAccountDeleteReauthWorking
                        : copy.dataAccountDeleteReauth
                    }
                    onPress={() => void reauthenticate()}
                    testID="mobile-account-delete-reauth"
                    variant="secondary"
                  />
                  <Button
                    disabled={!reauthToken || deleteBusy}
                    fullWidth
                    label={copy.dataAccountDeleteAction}
                    onPress={() => setFinalConfirmOpen(true)}
                    testID="mobile-account-delete-continue"
                    variant="danger"
                  />
                </View>
              ) : null}
              {feedback ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={styles.feedback}
                  testID="mobile-account-delete-feedback"
                >
                  {feedback}
                </Text>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={styles.sectionHeading}>{copy.dataAccountExportHeading}</Text>
              <View style={styles.card}>
                <View style={styles.cardLead}>
                  <View style={styles.icon}>
                    <Ionicons color={theme.accent.strong} name="download-outline" size={21} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{copy.dataAccountExportTitle}</Text>
                    <Text style={styles.cardDescription}>{copy.dataAccountExportDescription}</Text>
                  </View>
                </View>
                <Button
                  busy={exportBusy}
                  disabled={!userId || exportBusy}
                  fullWidth
                  label={
                    exportBusy ? copy.dataAccountExportDownloading : copy.dataAccountExportAction
                  }
                  onPress={() => void downloadExport()}
                  testID="mobile-account-export-download"
                />
                {exportFeedback ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={styles.feedback}
                    testID="mobile-account-export-feedback"
                  >
                    {exportFeedback}
                  </Text>
                ) : null}
                {exportState?.status === "ready" ? (
                  <Button
                    fullWidth
                    label={copy.dataAccountExportShare}
                    onPress={() => void shareExport()}
                    testID="mobile-account-export-share"
                    variant="secondary"
                  />
                ) : null}
              </View>

              <Text style={styles.sectionHeading}>{copy.dataAccountDeleteHeading}</Text>
              <View style={[styles.card, styles.dangerCard]}>
                <View style={styles.cardLead}>
                  <View style={[styles.icon, styles.dangerIcon]}>
                    <Ionicons color={theme.status.danger} name="trash-outline" size={21} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{copy.dataAccountDeleteTitle}</Text>
                    <Text style={styles.cardDescription}>{copy.dataAccountDeleteDescription}</Text>
                  </View>
                </View>
                <Button
                  fullWidth
                  label={copy.dataAccountDeleteOpen}
                  onPress={openDeleteFlow}
                  testID="mobile-account-delete-open"
                  variant="danger"
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <DestructiveConfirmationSheet
        body={copy.dataAccountDeleteFinalDescription}
        busy={deleteBusy}
        confirmLabel={
          deleteBusy ? copy.dataAccountDeleteDeleting : copy.dataAccountDeleteFinalAction
        }
        onCancel={() => setFinalConfirmOpen(false)}
        onConfirm={executeDelete}
        open={finalConfirmOpen}
        requiredText={ACCOUNT_DELETION_CONFIRMATION_PHRASE}
        testID="mobile-account-delete-final"
        title={copy.dataAccountDeleteFinalTitle}
      />
    </>
  );
}
