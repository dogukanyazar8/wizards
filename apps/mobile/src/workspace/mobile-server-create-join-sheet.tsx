import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { BottomSheet, useSheetPresentation } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { getMobileRuntimeConfig } from "../config/environment";
import type { MobileTheme } from "../design/themes";
import { parseMobileInviteCode } from "../invite/mobile-invite-share";
import { mobileCopy } from "../locale/mobile-copy";
import type { MobileImageUploadOutcome } from "../media/mobile-image-upload-service";
import {
  createMobileCreateSheetStyles,
  MobileCreateSheetCancelButton,
  MobileCreateSheetField,
  MobileCreateSheetFooterHint,
  MobileCreateSheetFormHeader,
  MobileCreateSheetOptionCard,
  MobileCreateSheetPrimaryCta,
  MobileCreateSheetTitleBlock,
} from "./mobile-create-sheet-kit";

export interface MobileServerCreateJoinSheetProps {
  busy: boolean;
  error: string | null;
  onClose(): void;
  onCreate(input: { name: string }): Promise<{ serverId: string }>;
  onJoin(input: { inviteCode: string }): Promise<{ serverId: string }>;
  /** S3 Section D: third menu branch, opens the public-server browse screen. */
  onOpenDiscover(): void;
  onServerReady(serverId: string): void;
  onUploadServerIcon?(
    serverId: string,
    onLocalPreview: (localUri: string) => void,
  ): Promise<MobileImageUploadOutcome>;
  open: boolean;
  serverIconTargetId?: string | null;
}

/**
 * The add-server flow mirrors 1d→1e: the sheet opens on a branch menu, and each
 * branch gets its own single-purpose form. The icon step stays a third screen
 * because the upload needs the id the create call returns.
 */
type MobileServerSheetStep = "create" | "join" | "menu";

const createStyles = (theme: MobileTheme) => ({
  sheet: { gap: 0 },
  iconTarget: {
    alignItems: "center" as const,
    alignSelf: "center" as const,
    backgroundColor: theme.surface.base,
    borderColor: theme.control.separatorDot,
    borderRadius: 30,
    borderStyle: "dashed" as const,
    borderWidth: 1.5,
    height: 96,
    justifyContent: "center" as const,
    marginTop: 6,
    overflow: "hidden" as const,
    width: 96,
  },
  iconTargetFilled: { borderStyle: "solid" as const, borderColor: theme.accent.default },
  iconPreview: { height: "100%" as const, width: "100%" as const },
  iconHint: {
    color: theme.text.visualPlaceholder,
    fontSize: 11.5,
    marginTop: 8,
    textAlign: "center" as const,
  },
  iconError: {
    color: theme.status.dangerOnBase,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11.5,
    marginTop: 8,
    textAlign: "center" as const,
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
  onOpenDiscover,
  onServerReady,
  onUploadServerIcon,
  open,
  serverIconTargetId = null,
}: MobileServerCreateJoinSheetProps) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useThemedStyles(createStyles);
  const kitStyles = useThemedStyles(createMobileCreateSheetStyles);
  const sheetPresentation = useSheetPresentation();
  const theme = useTheme();
  const [step, setStep] = useState<MobileServerSheetStep>("menu");
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
    setStep("menu");
    setName("");
    setReadyServerId(null);
    setIconPreviewUri(null);
    setIconError(null);
    setSubmitting(false);
  }, [open]);

  const goToStep = (nextStep: MobileServerSheetStep) => {
    setLocalError(null);
    setStep(nextStep);
  };

  // Discover is a full-screen destination, not a third sheet step: it opens
  // and this sheet gets out of the way, the same way a completed join does.
  const openDiscover = () => {
    onOpenDiscover();
    onClose();
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

  // Icon step: the create call already returned an id, so this screen replaces
  // the form instead of stacking a second sheet over it.
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
        <View style={styles.sheet}>
          <MobileCreateSheetFormHeader
            closeAccessibilityLabel={copy.sheetCloseAction}
            icon="image-outline"
            onClose={onClose}
            subtitle={copy.workspaceServerIconDescription}
            testID="mobile-server-create-icon-header"
            title={copy.workspaceServerIconAction}
          />
          <Pressable
            accessibilityLabel={copy.workspaceServerIconAction}
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => void uploadServerIcon()}
            style={({ pressed }) => [
              styles.iconTarget,
              iconPreviewUri && styles.iconTargetFilled,
              pressed && !isBusy && kitStyles.pressed,
            ]}
            testID="mobile-server-create-icon-target"
          >
            {iconPreviewUri ? (
              <Image
                accessibilityLabel={copy.workspaceServerIconAction}
                source={{ uri: iconPreviewUri }}
                style={styles.iconPreview}
                testID="mobile-server-create-icon-preview"
              />
            ) : (
              <Ionicons color={theme.text.visualPlaceholder} name="camera-outline" size={26} />
            )}
          </Pressable>
          {iconError ? (
            <Text
              accessibilityRole="alert"
              style={styles.iconError}
              testID="mobile-server-create-icon-error"
            >
              {iconError}
            </Text>
          ) : (
            <Text style={styles.iconHint}>{copy.workspaceServerIconHint}</Text>
          )}
          <MobileCreateSheetPrimaryCta
            busy={isBusy}
            icon="image-outline"
            label={copy.workspaceServerIconAction}
            onPress={() => void uploadServerIcon()}
            testID="mobile-server-create-icon"
          />
          {iconError ? (
            <MobileCreateSheetCancelButton
              disabled={isBusy}
              label={copy.retryAction}
              onPress={() => void uploadServerIcon()}
              testID="mobile-server-create-icon-retry"
            />
          ) : null}
          <MobileCreateSheetCancelButton
            disabled={isBusy}
            label={copy.workspaceServerIconFinishAction}
            onPress={onClose}
            testID="mobile-server-create-finish"
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
      <View style={styles.sheet}>
        {step === "menu" ? (
          <>
            <MobileCreateSheetTitleBlock
              subtitle={copy.workspaceServerCreateJoinDescription}
              testID="mobile-server-add-menu-title"
              title={copy.workspaceAddServerAction}
            />
            <View style={kitStyles.optionColumn}>
              <MobileCreateSheetOptionCard
                description={copy.workspaceServerCreateOptionDescription}
                icon={<Ionicons color={theme.accent.default} name="add" size={20} />}
                iconSurface={theme.accent.soft}
                onPress={() => goToStep("create")}
                testID="mobile-server-mode-create"
                title={copy.workspaceServerCreateAction}
              />
              <MobileCreateSheetOptionCard
                description={copy.workspaceServerJoinOptionDescription}
                icon={<Ionicons color={theme.status.visualText} name="link-outline" size={19} />}
                iconSurface={theme.status.successSoft}
                onPress={() => goToStep("join")}
                testID="mobile-server-mode-join"
                title={copy.workspaceServerJoinAction}
              />
              <MobileCreateSheetOptionCard
                description={copy.workspaceServerDiscoverOptionDescription}
                icon={<Ionicons color={theme.accent.default} name="compass-outline" size={19} />}
                iconSurface={theme.accent.soft}
                onPress={openDiscover}
                testID="mobile-server-mode-discover"
                title={copy.workspaceServerDiscoverAction}
              />
            </View>
            <MobileCreateSheetCancelButton
              label={copy.workspaceCreateMenuCancel}
              onPress={onClose}
              testID="mobile-server-add-menu-cancel"
            />
          </>
        ) : step === "create" ? (
          <>
            <MobileCreateSheetFormHeader
              closeAccessibilityLabel={copy.sheetCloseAction}
              icon="add"
              onClose={() => goToStep("menu")}
              subtitle={copy.workspaceServerCreateOptionDescription}
              testID="mobile-server-create-form"
              title={copy.workspaceServerCreateAction}
            />
            <MobileCreateSheetField
              accessibilityLabel={copy.workspaceServerNameLabel}
              autoCapitalize="words"
              autoCorrect
              error={visibleError}
              errorTestID="mobile-server-create-error"
              hint={copy.workspaceServerNameHint}
              icon="people-outline"
              label={copy.workspaceServerNameLabel}
              maxLength={64}
              onChangeText={setName}
              placeholder={copy.workspaceServerNamePlaceholder}
              testID="mobile-server-create-name"
              value={name}
            />
            <MobileCreateSheetPrimaryCta
              busy={isBusy}
              icon="add"
              label={copy.workspaceServerCreateAction}
              onPress={() => void submitCreate()}
              testID="mobile-server-create-submit"
            />
            <MobileCreateSheetFooterHint text={copy.workspaceServerCreateFooter} />
          </>
        ) : (
          <>
            <MobileCreateSheetFormHeader
              closeAccessibilityLabel={copy.sheetCloseAction}
              icon="link-outline"
              iconColor={theme.status.visualText}
              iconSurface={theme.status.successSoft}
              onClose={() => goToStep("menu")}
              subtitle={copy.workspaceServerJoinOptionDescription}
              testID="mobile-server-join-form"
              title={copy.workspaceServerJoinAction}
            />
            <MobileCreateSheetField
              accessibilityLabel={copy.workspaceServerInviteLabel}
              error={visibleError}
              errorTestID="mobile-server-join-error"
              hint={copy.workspaceServerInviteHint}
              icon="link-outline"
              label={copy.workspaceServerInviteLabel}
              maxLength={2048}
              onChangeText={setInviteInput}
              placeholder={copy.workspaceServerInvitePlaceholder}
              testID="mobile-server-join-input"
              value={inviteInput}
            />
            <MobileCreateSheetPrimaryCta
              busy={isBusy}
              icon="enter-outline"
              label={copy.workspaceServerJoinAction}
              onPress={() => void submitJoin()}
              testID="mobile-server-join-submit"
            />
            <MobileCreateSheetFooterHint text={copy.workspaceServerJoinFooter} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}
