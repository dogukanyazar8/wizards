import { useEffect, useRef, useState } from "react";
import { Image, Text, TextInput, View } from "react-native";

import { BottomSheet, Button, SheetHeader, useSheetPresentation } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { getMobileRuntimeConfig } from "../config/environment";
import type { MobileTheme } from "../design/themes";
import { parseMobileInviteCode } from "../invite/mobile-invite-share";
import { mobileCopy } from "../locale/mobile-copy";
import type { MobileImageUploadOutcome } from "../media/mobile-image-upload-service";

export interface MobileServerCreateJoinSheetProps {
  busy: boolean;
  error: string | null;
  onClose(): void;
  onCreate(input: { name: string }): Promise<{ serverId: string }>;
  onJoin(input: { inviteCode: string }): Promise<{ serverId: string }>;
  onServerReady(serverId: string): void;
  onUploadServerIcon?(
    serverId: string,
    onLocalPreview: (localUri: string) => void,
  ): Promise<MobileImageUploadOutcome>;
  open: boolean;
  serverIconTargetId?: string | null;
}

type MobileServerSheetMode = "create" | "join";

const createStyles = (theme: MobileTheme) => ({
  actions: { flexDirection: "row" as const, gap: 8 },
  body: { gap: 12 },
  error: { ...theme.typography.caption, color: theme.status.danger },
  input: {
    ...theme.typography.body,
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.default,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: theme.text.primary,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 12,
  },
  iconPreview: {
    borderRadius: theme.radii.card,
    height: 88,
    width: 88,
  },
});

function isValidServerName(value: string): boolean {
  return value.length >= 1 && value.length <= 64;
}

export function MobileServerCreateJoinSheet({
  busy,
  error,
  onClose,
  onCreate,
  onJoin,
  onServerReady,
  onUploadServerIcon,
  open,
  serverIconTargetId = null,
}: MobileServerCreateJoinSheetProps) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useThemedStyles(createStyles);
  const sheetPresentation = useSheetPresentation();
  const theme = useTheme();
  const [mode, setMode] = useState<MobileServerSheetMode>("create");
  const [name, setName] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [readyServerId, setReadyServerId] = useState<string | null>(null);
  const [iconPreviewUri, setIconPreviewUri] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const visibleError = error ?? localError;

  useEffect(() => {
    if (open) {
      return;
    }

    submittingRef.current = false;
    setInviteInput("");
    setLocalError(null);
    setMode("create");
    setName("");
    setReadyServerId(null);
    setIconPreviewUri(null);
    setIconError(null);
    setSubmitting(false);
  }, [open]);

  const setSheetMode = (nextMode: MobileServerSheetMode) => {
    setLocalError(null);
    setMode(nextMode);
  };

  const markServerReady = (serverId: string) => {
    onServerReady(serverId);
    setReadyServerId(serverId);
  };

  const activeIconServerId = readyServerId ?? serverIconTargetId;

  const uploadServerIcon = async () => {
    if (!activeIconServerId || !onUploadServerIcon || busy || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setIconError(null);
    try {
      const outcome = await onUploadServerIcon(activeIconServerId, setIconPreviewUri);
      if (outcome.status === "cancelled") {
        setIconPreviewUri(null);
        return;
      }
      if (outcome.status === "error") {
        setIconPreviewUri(null);
        setIconError(outcome.message);
        return;
      }
      setIconPreviewUri(null);
    } catch {
      setIconPreviewUri(null);
      setIconError(copy.workspaceServerIconFailed);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const submitCreate = async () => {
    const normalizedName = name.trim();
    if (!isValidServerName(normalizedName)) {
      setLocalError(copy.workspaceServerCreateInvalid);
      return;
    }
    if (busy || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setLocalError(null);
    try {
      const response = await onCreate({ name: normalizedName });
      markServerReady(response.serverId);
    } catch {
      setLocalError(copy.workspaceServerCreateFailed);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const submitJoin = async () => {
    const inviteCode = parseMobileInviteCode(inviteInput, getMobileRuntimeConfig().webUrl);
    if (!inviteCode) {
      setLocalError(copy.workspaceServerJoinInvalid);
      return;
    }
    if (busy || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setLocalError(null);
    try {
      const response = await onJoin({ inviteCode });
      onServerReady(response.serverId);
      onClose();
    } catch {
      setLocalError(copy.workspaceServerJoinFailed);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const isBusy = busy || submitting;

  if (activeIconServerId) {
    return (
      <BottomSheet
        accessibilityLabel={copy.workspaceServerIconAction}
        onClose={onClose}
        open={open}
        presentation={sheetPresentation}
        sizing="content"
        testID="mobile-server-create-join-sheet"
      >
        <View style={styles.body}>
          <SheetHeader
            closeAccessibilityLabel={copy.sheetCloseAction}
            icon="image-outline"
            onClose={onClose}
            subtitle={copy.workspaceServerIconDescription}
            testID="mobile-server-create-icon-header"
            title={copy.workspaceServerIconAction}
          />
          {iconPreviewUri ? (
            <Image
              accessibilityLabel={copy.workspaceServerIconAction}
              source={{ uri: iconPreviewUri }}
              style={styles.iconPreview}
              testID="mobile-server-create-icon-preview"
            />
          ) : null}
          {iconError ? (
            <Text accessibilityRole="alert" style={styles.error} testID="mobile-server-create-icon-error">
              {iconError}
            </Text>
          ) : null}
          <Button
            busy={isBusy}
            fullWidth
            label={copy.workspaceServerIconAction}
            onPress={() => void uploadServerIcon()}
            testID="mobile-server-create-icon"
          />
          {iconError ? (
            <Button
              disabled={isBusy}
              fullWidth
              label={copy.retryAction}
              onPress={() => void uploadServerIcon()}
              testID="mobile-server-create-icon-retry"
              variant="secondary"
            />
          ) : null}
          <Button
            disabled={isBusy}
            fullWidth
            label={copy.workspaceServerIconFinishAction}
            onPress={onClose}
            testID="mobile-server-create-finish"
            variant="ghost"
          />
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      accessibilityLabel={copy.workspaceAddServerAction}
      onClose={onClose}
      open={open}
      presentation={sheetPresentation}
      sizing="content"
      testID="mobile-server-create-join-sheet"
    >
      <View style={styles.body}>
        <SheetHeader
          closeAccessibilityLabel={copy.sheetCloseAction}
          icon="add-circle-outline"
          onClose={onClose}
          subtitle={copy.workspaceServerCreateJoinDescription}
          testID="mobile-server-create-join-header"
          title={copy.workspaceAddServerAction}
        />
        <View style={styles.actions}>
          <Button
            accessibilityState={{ selected: mode === "create" }}
            fullWidth
            label={copy.workspaceServerCreateAction}
            onPress={() => setSheetMode("create")}
            testID="mobile-server-mode-create"
            variant={mode === "create" ? "primary" : "secondary"}
          />
          <Button
            accessibilityState={{ selected: mode === "join" }}
            fullWidth
            label={copy.workspaceServerJoinAction}
            onPress={() => setSheetMode("join")}
            testID="mobile-server-mode-join"
            variant={mode === "join" ? "primary" : "secondary"}
          />
        </View>
        {mode === "create" ? (
          <>
            <TextInput
              accessibilityLabel={copy.workspaceServerNameLabel}
              autoCapitalize="words"
              autoCorrect
              maxLength={64}
              onChangeText={setName}
              placeholder={copy.workspaceServerNamePlaceholder}
              placeholderTextColor={theme.text.soft}
              style={styles.input}
              testID="mobile-server-create-name"
              value={name}
            />
            {visibleError ? (
              <Text
                accessibilityRole="alert"
                style={styles.error}
                testID="mobile-server-create-error"
              >
                {visibleError}
              </Text>
            ) : null}
            <Button
              busy={isBusy}
              fullWidth
              label={copy.workspaceServerCreateAction}
              onPress={() => void submitCreate()}
              testID="mobile-server-create-submit"
            />
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel={copy.workspaceServerInviteLabel}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={2048}
              onChangeText={setInviteInput}
              placeholder={copy.workspaceServerInvitePlaceholder}
              placeholderTextColor={theme.text.soft}
              style={styles.input}
              testID="mobile-server-join-input"
              value={inviteInput}
            />
            {visibleError ? (
              <Text
                accessibilityRole="alert"
                style={styles.error}
                testID="mobile-server-join-error"
              >
                {visibleError}
              </Text>
            ) : null}
            <Button
              busy={isBusy}
              fullWidth
              label={copy.workspaceServerJoinAction}
              onPress={() => void submitJoin()}
              testID="mobile-server-join-submit"
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}
