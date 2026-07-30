import type { MobileBugReportCategory, MobileReleaseChannel } from "@wizards/types";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { submitMobileBugReport } from "../../../about/mobile-about-client";
import {
  collectDeviceInfo,
  collectRecentLogLines,
  type MobileBugReportRuntimeDiagnostics,
} from "../../../about/mobile-bug-report-diagnostics";
import {
  buildMobileBugReportRequest,
  createMobileBugReportQueuedDraft,
  queueMobileBugReport,
  validateMobileBugReportDraft,
} from "../../../about/mobile-bug-report-model";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { mobileAboutMetrics } from "../../../design/tokens";
import { captureMobileCrashScreenshot } from "../../../feedback/mobile-crash-screenshot";
import { useMobileFeedbackAttachmentUpload } from "../../../feedback/use-mobile-feedback-attachment-upload";
import { mobileCopy } from "../../../locale/mobile-copy";
import type { MobilePickedImage } from "../../../media/mobile-image-upload-contract";
import { MobileCachedImage } from "../../components/mobile-cached-image";
import { MessageImageLightbox } from "../../components/message-image-lightbox";
import { DestructiveConfirmationSheet } from "../../components/kit/destructive-confirmation-sheet";
import { useToast } from "../../components/kit/toast";
import { useMobileBottomSystemSpacing } from "../../use-mobile-bottom-system-spacing";
import { useMobileHaptics } from "../../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useMobileNetworkStatus } from "../../providers/mobile-network-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { AboutShieldIcon } from "./about-icons";
import {
  AboutGroupLabel,
  AboutScreenHeader,
  AboutStickyFooterButton,
  AboutToggle,
} from "./about-primitives";
import { useMobileBugReportStyles } from "./about-bug-report-screen.styles";

const REPORT_CATEGORIES: readonly MobileBugReportCategory[] = [
  "voice",
  "chat",
  "notification",
  "performance",
  "other",
];
const INITIAL_FOOTER_HEIGHT = 48;
const REPORT_BODY_MAX_LENGTH = 1_000;

function normalizeCategory(value: string | undefined): MobileBugReportCategory | null {
  return REPORT_CATEGORIES.includes(value as MobileBugReportCategory)
    ? (value as MobileBugReportCategory)
    : null;
}

function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function categoryLabel(
  copy: (typeof mobileCopy)[keyof typeof mobileCopy],
  category: MobileBugReportCategory,
): string {
  switch (category) {
    case "voice":
      return copy.reportCategoryVoice;
    case "chat":
      return copy.reportCategoryChat;
    case "notification":
      return copy.reportCategoryNotification;
    case "performance":
      return copy.reportCategoryPerformance;
    case "other":
      return copy.reportCategoryOther;
  }
}

function formatDeviceSubtitle(
  copy: (typeof mobileCopy)[keyof typeof mobileCopy],
  diagnostics: MobileBugReportRuntimeDiagnostics,
): string {
  const device = diagnostics.deviceInfo.deviceModel ?? copy.reportUnknownDevice;
  const os = [diagnostics.deviceInfo.osName, diagnostics.deviceInfo.osVersion]
    .filter(Boolean)
    .join(" ");

  return interpolate(copy.reportDeviceSub, {
    build: diagnostics.appBuild ?? copy.reportUnknownValue,
    channel: diagnostics.releaseChannel ?? copy.reportUnknownValue,
    device,
    os: os || copy.reportUnknownValue,
    version: diagnostics.appVersion ?? copy.reportUnknownValue,
  });
}

function ScreenshotPreview({
  disabled,
  onPress,
  screenshot,
}: {
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly screenshot: MobilePickedImage | null;
}) {
  const styles = useMobileBugReportStyles();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || screenshot === null}
      hitSlop={5}
      onPress={onPress}
      style={({ pressed }) => [styles.screenshotPreview, pressed && styles.pressed]}
      testID="mobile-bug-report-screenshot-preview"
    >
      {screenshot === null ? (
        <View style={styles.previewBars}>
          {[9, 15, 11].map((height) => (
            <View key={height} style={[styles.previewBar, { height }]} />
          ))}
        </View>
      ) : (
        <MobileCachedImage
          source={{ uri: screenshot.localUri }}
          style={styles.screenshotImage}
          testID="mobile-bug-report-screenshot-image"
          transition={0}
        />
      )}
    </Pressable>
  );
}

export interface MobileBugReportScreenProps {
  readonly appBuild?: string | undefined;
  readonly appVersion?: string | undefined;
  readonly category?: string | undefined;
  readonly onBack: () => void;
  readonly releaseChannel?: MobileReleaseChannel | undefined;
}

export function MobileBugReportScreen({
  appBuild,
  appVersion,
  category,
  onBack,
  releaseChannel,
}: MobileBugReportScreenProps) {
  const auth = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileBugReportStyles();
  const theme = useTheme();
  const networkStatus = useMobileNetworkStatus();
  const { showToast } = useToast();
  const haptics = useMobileHaptics();
  const { uploadImage } = useMobileFeedbackAttachmentUpload();
  const bottomSystemSpacing = useMobileBottomSystemSpacing(0);
  const initialCategory = useMemo(() => normalizeCategory(category), [category]);
  const diagnostics = useMemo(
    () => collectDeviceInfo({ appBuild, appVersion, locale, releaseChannel }),
    [appBuild, appVersion, locale, releaseChannel],
  );
  const [selectedCategory, setSelectedCategory] = useState<MobileBugReportCategory | null>(
    initialCategory,
  );
  const [body, setBody] = useState("");
  const [inputHeight, setInputHeight] = useState(82);
  const [includesLogs, setIncludesLogs] = useState(true);
  const [includesScreenshot, setIncludesScreenshot] = useState(true);
  const [includesDeviceInfo, setIncludesDeviceInfo] = useState(false);
  const [screenshot, setScreenshot] = useState<MobilePickedImage | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [footerHeight, setFooterHeight] = useState(INITIAL_FOOTER_HEIGHT);

  useEffect(() => {
    let active = true;
    void captureMobileCrashScreenshot().then((capture) => {
      if (active) {
        setScreenshot(capture);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const validation = validateMobileBugReportDraft({ body, category: selectedCategory });
  const disabled = busy || !validation.valid;
  const isDirty =
    body.length > 0 ||
    selectedCategory !== initialCategory ||
    !includesLogs ||
    !includesScreenshot ||
    includesDeviceInfo;
  const screenshotSubtitle = interpolate(copy.reportScreenshotSub, { screen: copy.reportTitle });
  const deviceSubtitle = formatDeviceSubtitle(copy, diagnostics);
  const scrollPaddingBottom = keyboardOpen
    ? bottomSystemSpacing
    : mobileAboutMetrics.footerButtonBottom + footerHeight + bottomSystemSpacing;

  const handleFooterLayout = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (nextHeight > 0 && nextHeight !== footerHeight) {
      setFooterHeight(nextHeight);
    }
  };

  const handleClose = () => {
    if (busy) {
      return;
    }
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onBack();
  };

  const handleRemoveScreenshot = () => {
    setLightboxOpen(false);
    setScreenshot(null);
    setIncludesScreenshot(false);
  };

  const handleSubmit = async () => {
    if (!validation.valid || selectedCategory === null || busy) {
      showToast({ title: copy.reportValidation, variant: "warning" });
      return;
    }

    setBusy(true);
    try {
      const logLines = includesLogs ? collectRecentLogLines() : [];
      if (networkStatus === "offline") {
        const request = buildMobileBugReportRequest({
          ...diagnostics,
          body,
          category: selectedCategory,
          deviceInfo: diagnostics.deviceInfo,
          includesDeviceInfo,
          includesLogs,
          includesScreenshot: includesScreenshot && screenshot !== null,
          logLines,
        });
        await queueMobileBugReport(
          createMobileBugReportQueuedDraft(request, {
            ...(includesScreenshot && screenshot !== null
              ? { screenshotLocalUri: screenshot.localUri }
              : {}),
          }),
        );
        showToast({ title: copy.reportQueued, variant: "info" });
        onBack();
        return;
      }

      let screenshotUploadKey: string | undefined;
      if (includesScreenshot && screenshot !== null) {
        const upload = await uploadImage(screenshot.file);
        if (upload.status === "failed") {
          showToast({ title: copy.reportScreenshotUploadFailed, variant: "error" });
          return;
        }
        screenshotUploadKey = upload.claimId;
      }

      const request = buildMobileBugReportRequest({
        ...diagnostics,
        body,
        category: selectedCategory,
        deviceInfo: diagnostics.deviceInfo,
        includesDeviceInfo,
        includesLogs,
        includesScreenshot: screenshotUploadKey !== undefined,
        logLines,
        ...(screenshotUploadKey === undefined ? {} : { screenshotUploadKey }),
      });
      const response = await submitMobileBugReport(auth.apiClient, request);
      await Clipboard.setStringAsync(response.ticket).catch(() => false);
      haptics.notification("success");
      showToast({
        title: interpolate(copy.reportReceived, { ticket: response.ticket }),
        variant: "success",
      });
      onBack();
    } catch {
      showToast({ title: copy.reportSubmitFailed, variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <AboutStickyFooterButton
      busy={busy}
      disabled={disabled}
      label={copy.reportSubmit}
      mode={keyboardOpen ? "flow" : "fixed"}
      onLayout={handleFooterLayout}
      onPress={() => void handleSubmit()}
      testID="mobile-bug-report-submit"
    />
  );

  return (
    <View style={styles.root} testID="mobile-bug-report-screen">
      <AboutScreenHeader
        backAccessibilityLabel={copy.sheetCloseAction}
        onBack={handleClose}
        testID="mobile-bug-report-header"
        title={copy.reportTitle}
        variant="close"
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollPaddingBottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-bug-report-scroll"
      >
        <AboutGroupLabel
          label={copy.reportWhere}
          padding={{ bottom: 8, horizontal: 20, top: 14 }}
        />
        <View style={styles.chipRow}>
          {REPORT_CATEGORIES.map((value) => {
            const selected = selectedCategory === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, selected }}
                disabled={busy}
                key={value}
                onPress={() => setSelectedCategory(value)}
                style={({ pressed }) => [
                  styles.chip,
                  selected ? styles.chipSelected : styles.chipIdle,
                  pressed && styles.pressed,
                ]}
                testID={`mobile-bug-report-category-${value}`}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.chipLabel,
                    selected ? styles.chipLabelSelected : styles.chipLabelIdle,
                  ]}
                >
                  {categoryLabel(copy, value)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <AboutGroupLabel label={copy.reportWhat} />
        <View style={styles.descriptionCard}>
          <TextInput
            editable={!busy}
            maxFontSizeMultiplier={2}
            maxLength={REPORT_BODY_MAX_LENGTH}
            multiline
            onChangeText={setBody}
            onContentSizeChange={(event) =>
              setInputHeight(Math.max(82, event.nativeEvent.contentSize.height))
            }
            placeholder={copy.reportPlaceholder}
            placeholderTextColor={theme.about.textMuted}
            scrollEnabled={false}
            style={[styles.input, { height: inputHeight }]}
            testID="mobile-bug-report-body"
            value={body}
          />
          <View style={styles.counterRow}>
            <Text maxFontSizeMultiplier={2} style={styles.hint}>
              {copy.reportHint}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.counter, body.length > 900 && styles.counterWarning]}
              testID="mobile-bug-report-counter"
            >
              {interpolate(copy.reportCounter, {
                count: body.length,
                max: REPORT_BODY_MAX_LENGTH,
              })}
            </Text>
          </View>
        </View>

        <AboutGroupLabel label={copy.reportAttachments} />
        <View style={styles.attachmentsCard}>
          <View style={styles.attachmentRow} testID="mobile-bug-report-logs-row">
            <View style={styles.attachmentText}>
              <Text maxFontSizeMultiplier={2} style={styles.attachmentTitle}>
                {copy.reportLogs}
              </Text>
              <Text maxFontSizeMultiplier={2} style={styles.attachmentSubtitle}>
                {interpolate(copy.reportLogsSub, { count: 500 })}
              </Text>
            </View>
            <AboutToggle
              accessibilityLabel={copy.reportLogs}
              disabled={busy}
              onValueChange={setIncludesLogs}
              testID="mobile-bug-report-logs-toggle"
              value={includesLogs}
            />
          </View>
          <View
            style={[styles.attachmentRow, styles.attachmentDivider]}
            testID="mobile-bug-report-screenshot-row"
          >
            <ScreenshotPreview
              disabled={busy}
              onPress={() => setLightboxOpen(true)}
              screenshot={screenshot}
            />
            <View style={styles.attachmentText}>
              <Text maxFontSizeMultiplier={2} style={styles.attachmentTitle}>
                {copy.reportScreenshot}
              </Text>
              <Text maxFontSizeMultiplier={2} style={styles.attachmentSubtitle}>
                {screenshotSubtitle}
              </Text>
            </View>
            <AboutToggle
              accessibilityLabel={copy.reportScreenshot}
              disabled={busy}
              onValueChange={setIncludesScreenshot}
              testID="mobile-bug-report-screenshot-toggle"
              value={includesScreenshot}
            />
          </View>
          <View
            style={[styles.attachmentRow, styles.attachmentDivider]}
            testID="mobile-bug-report-device-row"
          >
            <View style={styles.attachmentText}>
              <Text maxFontSizeMultiplier={2} style={styles.attachmentTitle}>
                {copy.reportDevice}
              </Text>
              <Text maxFontSizeMultiplier={2} style={styles.attachmentSubtitle}>
                {deviceSubtitle}
              </Text>
            </View>
            <AboutToggle
              accessibilityLabel={copy.reportDevice}
              disabled={busy}
              onValueChange={setIncludesDeviceInfo}
              testID="mobile-bug-report-device-toggle"
              value={includesDeviceInfo}
            />
          </View>
        </View>

        <View style={styles.privacy}>
          <AboutShieldIcon color={theme.about.textSecondary} size={16} />
          <Text maxFontSizeMultiplier={2} style={styles.privacyText}>
            {copy.reportPrivacy}
          </Text>
        </View>

        {keyboardOpen ? (
          <View style={styles.flowFooter} testID="mobile-bug-report-submit-flow">
            {/* A pinned footer would rise over the form with the keyboard. In
                this state it becomes the final list item instead. */}
            {footer}
          </View>
        ) : null}
      </ScrollView>
      {keyboardOpen ? null : footer}

      {/* The handoff's crop/draw editor is intentionally out of scope. The
          shared full-screen viewer supplies the approved remove action. */}
      <MessageImageLightbox
        onClose={() => setLightboxOpen(false)}
        onRemove={handleRemoveScreenshot}
        open={lightboxOpen}
        removeLabel={copy.reportRemoveScreenshot}
        uri={screenshot?.localUri ?? null}
      />
      <DestructiveConfirmationSheet
        body={copy.reportDiscardBody}
        busy={false}
        confirmLabel={copy.reportDiscardAction}
        onCancel={() => setDiscardOpen(false)}
        onConfirm={onBack}
        open={discardOpen}
        testID="mobile-bug-report-discard-sheet"
        title={copy.reportDiscardTitle}
      />
    </View>
  );
}
