import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { setStringAsync } from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatFeedbackPublicNumber } from "@wizards/types";
import mobilePackageJson from "../../package.json";
import { MobileLineIcon, type MobileLineIconName } from "../design/mobile-line-icons";
import { getMobileTheme } from "../design/mobile-theme-runtime";
import type { MobileTheme } from "../design/themes";
import { activeMobileCopy, getActiveMobileLocale } from "../locale/mobile-locale-preferences";
import { reportMobileBoundaryError } from "../observability/mobile-sentry";
import {
  classifyMobileBoundaryFault,
  createMobileBoundaryFaultReference,
  type MobileBoundaryFaultKind,
} from "./mobile-error-boundary-model";
import { sendMobileCrashReport } from "../feedback/mobile-crash-report";
import { recordMobileFault } from "../feedback/mobile-fault-log";
import { useTheme, useThemedStyles } from "./providers/mobile-theme-provider";
import { useMobileBottomSystemSpacing } from "./use-mobile-bottom-system-spacing";

const copy = activeMobileCopy;

/**
 * One cause sentence and one fix sentence per fault kind. "Whispr is recovering"
 * on its own left the user with nothing to do; naming what broke and what to try
 * is the difference between a dead end and a step.
 */
const FAULT_COPY: Record<MobileBoundaryFaultKind, { problem: string; solution: string }> = {
  bundle: {
    problem: copy.errorBoundaryBundleProblem,
    solution: copy.errorBoundaryBundleSolution,
  },
  network: {
    problem: copy.errorBoundaryNetworkProblem,
    solution: copy.errorBoundaryNetworkSolution,
  },
  render: {
    problem: copy.errorBoundaryRenderProblem,
    solution: copy.errorBoundaryRenderSolution,
  },
  storage: {
    problem: copy.errorBoundaryStorageProblem,
    solution: copy.errorBoundaryStorageSolution,
  },
};

/** The glyph says which of the four faults this is before any text is read. */
const FAULT_ICON: Record<MobileBoundaryFaultKind, MobileLineIconName> = {
  bundle: "bolt",
  network: "globe",
  render: "bug",
  storage: "lock",
};

interface MobileBoundaryFault {
  readonly kind: MobileBoundaryFaultKind;
  readonly reference: string;
}

type MobileBoundaryFeedbackState =
  | { readonly reason: "failed" | "signed-out"; readonly status: "failed" }
  | { readonly publicNumber: number; readonly screenshot: boolean; readonly status: "sent" }
  | { readonly status: "idle" }
  | { readonly status: "sending" };

interface MobileErrorBoundaryProps {
  children: ReactNode;
}

interface MobileErrorBoundaryCoreProps extends MobileErrorBoundaryProps {
  FallbackComponent: ComponentType<{ fault: MobileBoundaryFault; onRetry(): void }>;
}

interface MobileErrorBoundaryState {
  fault: MobileBoundaryFault | null;
}

class MobileErrorBoundaryCore extends Component<
  MobileErrorBoundaryCoreProps,
  MobileErrorBoundaryState
> {
  state: MobileErrorBoundaryState = {
    fault: null,
  };

  static getDerivedStateFromError(error: unknown): MobileErrorBoundaryState {
    return {
      fault: {
        kind: classifyMobileBoundaryFault(error),
        reference: createMobileBoundaryFaultReference(error),
      },
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    reportMobileBoundaryError(error, errorInfo.componentStack);
    // Feeds the 4a diagnostics trail: kind and reference only, the same two
    // values this screen is already allowed to show. A report sent from this
    // screen carries the trail, so the fault has to be recorded before the
    // fallback can offer the button.
    recordMobileFault(error);

    if (process.env.NODE_ENV === "production") {
      return;
    }

    console.error("[mobile] render boundary caught", {
      componentStackLines: errorInfo.componentStack
        ? errorInfo.componentStack.split("\n").filter(Boolean).length
        : 0,
      errorKind: error instanceof Error ? error.name : typeof error,
    });
  }

  handleRetry = () => {
    this.setState({ fault: null });
  };

  render() {
    const { fault } = this.state;
    if (fault) {
      const { FallbackComponent } = this.props;
      return <FallbackComponent fault={fault} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

export function MobileErrorBoundary({ children }: MobileErrorBoundaryProps) {
  return (
    <MobileErrorBoundaryCore FallbackComponent={MobileThemedErrorFallback}>
      {children}
    </MobileErrorBoundaryCore>
  );
}

export function MobileBootstrapErrorBoundary({ children }: MobileErrorBoundaryProps) {
  return (
    <MobileErrorBoundaryCore FallbackComponent={MobileBootstrapErrorFallback}>
      {children}
    </MobileErrorBoundaryCore>
  );
}

function MobileThemedErrorFallback({
  fault,
  onRetry,
}: {
  fault: MobileBoundaryFault;
  onRetry(): void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createMobileErrorStyles);
  return <MobileErrorFallback fault={fault} onRetry={onRetry} styles={styles} theme={theme} />;
}

function MobileBootstrapErrorFallback({
  fault,
  onRetry,
}: {
  fault: MobileBoundaryFault;
  onRetry(): void;
}) {
  const systemScheme = useColorScheme();
  const theme = getMobileTheme("system", systemScheme);
  const styles = useMemo(() => StyleSheet.create(createMobileErrorStyles(theme)), [theme]);
  return <MobileErrorFallback fault={fault} onRetry={onRetry} styles={styles} theme={theme} />;
}

function MobileErrorFallback({
  fault,
  onRetry,
  styles,
  theme,
}: {
  fault: MobileBoundaryFault;
  onRetry(): void;
  styles: ReturnType<typeof createMobileErrorStyles>;
  theme: MobileTheme;
}) {
  const insets = useSafeAreaInsets();
  // The fallback replaces the whole app, shell included, so it clears the Android
  // navigation bar through the shared policy instead of its own inset math.
  const bottomSystemSpacing = useMobileBottomSystemSpacing(20);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MobileBoundaryFeedbackState>({ status: "idle" });
  const mountedRef = useRef(true);
  const faultCopy = FAULT_COPY[fault.kind];

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // The bootstrap boundary sits above the toast provider, so every confirmation
  // has to live on this screen instead of being announced elsewhere.
  const copyValue = useCallback((value: string) => {
    void setStringAsync(value).then(
      () => mountedRef.current && setCopiedValue(value),
      () => mountedRef.current && setCopiedValue(null),
    );
  }, []);

  const sendFeedback = useCallback(() => {
    setFeedback({ status: "sending" });

    void sendMobileCrashReport({
      appVersion: mobilePackageJson.version,
      fault,
      locale: getActiveMobileLocale(),
      theme: theme.id,
    }).then((outcome) => {
      if (!mountedRef.current) {
        return;
      }

      setFeedback(
        outcome.status === "sent"
          ? {
              publicNumber: outcome.publicNumber,
              screenshot: outcome.screenshot,
              status: "sent",
            }
          : { reason: outcome.reason, status: "failed" },
      );
    });
  }, [fault, theme.id]);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.safeArea, { paddingBottom: bottomSystemSpacing }]}
      testID="mobile-error-boundary"
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 20) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.surface}>
          <View style={styles.eyebrowPill}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>{copy.errorBoundaryEyebrow}</Text>
          </View>
          <View style={styles.icon}>
            <MobileLineIcon color={theme.status.warning} name={FAULT_ICON[fault.kind]} size={28} />
          </View>
          <Text maxFontSizeMultiplier={2} style={styles.title}>
            {copy.errorBoundaryTitle}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.description}>
            {copy.errorBoundaryDescription}
          </Text>

          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>{copy.errorBoundaryProblemLabel}</Text>
            <Text maxFontSizeMultiplier={2} style={styles.detailBody}>
              {faultCopy.problem}
            </Text>
          </View>
          <View style={[styles.detailBlock, styles.detailBlockSolution]}>
            <Text style={[styles.detailLabel, styles.detailLabelSolution]}>
              {copy.errorBoundarySolutionLabel}
            </Text>
            <Text maxFontSizeMultiplier={2} style={styles.detailBody}>
              {faultCopy.solution}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.errorBoundaryRetryAction}
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryButtonText}>{copy.errorBoundaryRetryAction}</Text>
          </Pressable>

          <MobileErrorFeedbackSection
            onCopy={copyValue}
            onSend={sendFeedback}
            state={feedback}
            styles={styles}
            theme={theme}
          />

          <View style={styles.referenceRow}>
            <Text style={styles.referenceLabel}>{copy.errorBoundaryReferenceLabel}</Text>
            <Pressable
              accessibilityHint={copy.errorBoundaryReferenceCopyAction}
              accessibilityLabel={fault.reference}
              accessibilityRole="button"
              onPress={() => copyValue(fault.reference)}
              style={({ pressed }) => [styles.referenceChip, pressed && styles.pressed]}
            >
              <MobileLineIcon color={theme.text.soft} name="copy" size={13} />
              <Text style={styles.referenceValue} testID="mobile-error-boundary-reference">
                {fault.reference}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.footnote}>
            {copiedValue ? copy.errorBoundaryReferenceCopiedNotice : copy.errorBoundaryFootnote}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * The report path, in one block that never asks a question.
 *
 * Someone looking at a crash screen has nothing useful to type, so the button
 * gathers what identifies the fault by itself — screen, device, version,
 * diagnostic code — and hands back a record number instead of a thank-you. The
 * line under it states exactly what left the device, because a button that
 * uploads a screenshot without saying so is not a button anyone should trust.
 */
function MobileErrorFeedbackSection({
  onCopy,
  onSend,
  state,
  styles,
  theme,
}: {
  onCopy(value: string): void;
  onSend(): void;
  state: MobileBoundaryFeedbackState;
  styles: ReturnType<typeof createMobileErrorStyles>;
  theme: MobileTheme;
}) {
  if (state.status === "sent") {
    const recordNumber = formatFeedbackPublicNumber(state.publicNumber);

    return (
      <View style={styles.recordBlock} testID="mobile-error-boundary-record">
        <View style={styles.recordHeader}>
          <MobileLineIcon color={theme.status.success} name="check" size={15} />
          <Text style={styles.recordLabel}>{copy.errorBoundaryFeedbackSentLabel}</Text>
        </View>
        <Pressable
          accessibilityHint={copy.errorBoundaryReferenceCopyAction}
          accessibilityLabel={recordNumber}
          accessibilityRole="button"
          onPress={() => onCopy(recordNumber)}
          style={({ pressed }) => [styles.recordNumberChip, pressed && styles.pressed]}
        >
          <Text style={styles.recordNumber}>{recordNumber}</Text>
        </Pressable>
        <Text maxFontSizeMultiplier={2} style={styles.recordDescription}>
          {state.screenshot
            ? copy.errorBoundaryFeedbackSentDescription
            : copy.errorBoundaryFeedbackSentDescriptionWithoutScreenshot}
        </Text>
      </View>
    );
  }

  const sending = state.status === "sending";

  return (
    <View style={styles.feedbackBlock}>
      <Pressable
        accessibilityLabel={copy.errorBoundaryFeedbackAction}
        accessibilityRole="button"
        accessibilityState={{ busy: sending, disabled: sending }}
        disabled={sending}
        onPress={onSend}
        style={({ pressed }) => [
          styles.feedbackButton,
          sending && styles.feedbackButtonBusy,
          pressed && styles.pressed,
        ]}
        testID="mobile-error-boundary-feedback"
      >
        {sending ? (
          <ActivityIndicator color={theme.accent.strong} size="small" />
        ) : (
          <MobileLineIcon color={theme.accent.strong} name="send" size={15} />
        )}
        <Text style={styles.feedbackButtonText}>
          {sending ? copy.errorBoundaryFeedbackSendingAction : copy.errorBoundaryFeedbackAction}
        </Text>
      </Pressable>
      <Text maxFontSizeMultiplier={2} style={styles.feedbackDisclosure}>
        {state.status === "failed"
          ? state.reason === "signed-out"
            ? copy.errorBoundaryFeedbackSignedOut
            : copy.errorBoundaryFeedbackFailed
          : copy.errorBoundaryFeedbackDisclosure}
      </Text>
    </View>
  );
}

export const createMobileErrorStyles = (theme: MobileTheme) =>
  ({
    safeArea: {
      flex: 1,
      backgroundColor: theme.surface.base,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.page,
      paddingBottom: theme.spacing.page,
    },
    surface: {
      alignItems: "center",
      borderWidth: theme.layout.border.hairline,
      borderColor: theme.border.subtle,
      borderRadius: theme.radii.cardLarge,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 22,
      paddingVertical: 24,
      ...theme.elevation.headerCard,
    },
    eyebrowPill: {
      alignItems: "center",
      backgroundColor: theme.status.warningSoft,
      borderRadius: theme.radii.pill,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    eyebrowDot: {
      backgroundColor: theme.status.warning,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    eyebrowText: {
      color: theme.status.onStatus,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 10.5,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    icon: {
      width: theme.sizing.squircle60,
      height: theme.sizing.squircle60,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: theme.layout.border.hairline,
      borderColor: theme.border.subtle,
      borderRadius: theme.sizing.squircle60Radius,
      backgroundColor: theme.surface.soft,
      marginTop: 16,
    },
    title: {
      marginTop: 14,
      color: theme.text.primary,
      fontSize: 22,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: -0.3,
      textAlign: "center",
    },
    description: {
      marginTop: 7,
      color: theme.text.muted,
      fontSize: 13.5,
      fontFamily: theme.typography.fontFamilySemiBold,
      lineHeight: 19,
      textAlign: "center",
    },
    detailBlock: {
      alignSelf: "stretch",
      borderRadius: theme.radii.control,
      borderLeftWidth: 3,
      borderLeftColor: theme.status.warning,
      backgroundColor: theme.surface.soft,
      gap: 3,
      marginTop: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    detailBlockSolution: {
      borderLeftColor: theme.accent.action,
      marginTop: 8,
    },
    detailLabel: {
      color: theme.status.warning,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    detailLabelSolution: {
      color: theme.accent.strong,
    },
    detailBody: {
      color: theme.text.primary,
      fontSize: 13,
      fontFamily: theme.typography.fontFamilySemiBold,
      lineHeight: 19,
    },
    feedbackBlock: {
      alignSelf: "stretch",
      gap: 8,
      marginTop: 10,
    },
    feedbackButton: {
      alignItems: "center",
      backgroundColor: theme.accent.soft,
      borderColor: theme.accent.softBorder,
      borderRadius: theme.radii.control,
      borderWidth: theme.layout.border.hairline,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: 16,
    },
    feedbackButtonBusy: {
      opacity: theme.layout.opacity.disabled,
    },
    feedbackButtonText: {
      color: theme.accent.strong,
      fontSize: 14,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    feedbackDisclosure: {
      color: theme.text.soft,
      fontSize: 11.5,
      fontFamily: theme.typography.fontFamilySemiBold,
      lineHeight: 16,
      textAlign: "center",
    },
    recordBlock: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: theme.status.successSoft,
      borderRadius: theme.radii.control,
      gap: 7,
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    recordHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    recordLabel: {
      color: theme.status.successText,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    recordNumberChip: {
      backgroundColor: theme.surface.card,
      borderRadius: theme.radii.control,
      borderWidth: theme.layout.border.hairline,
      borderColor: theme.border.subtle,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    recordNumber: {
      color: theme.text.primary,
      fontSize: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 1,
    },
    recordDescription: {
      color: theme.status.successText,
      fontSize: 11.5,
      fontFamily: theme.typography.fontFamilySemiBold,
      lineHeight: 16,
      textAlign: "center",
    },
    referenceRow: {
      alignItems: "center",
      alignSelf: "stretch",
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 14,
    },
    referenceLabel: {
      color: theme.text.soft,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyBold,
    },
    referenceChip: {
      alignItems: "center",
      borderRadius: theme.radii.control,
      borderWidth: theme.layout.border.hairline,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.soft,
      flexDirection: "row",
      gap: 6,
      minHeight: 32,
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    referenceValue: {
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 0.6,
    },
    retryButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
      marginTop: 18,
      borderRadius: theme.radii.control,
      backgroundColor: theme.accent.action,
      paddingHorizontal: 18,
      ...theme.elevation.primaryAction,
    },
    pressed: {
      opacity: theme.layout.opacity.pressed,
    },
    retryButtonText: {
      color: theme.text.onPrimary,
      fontSize: 14,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    footnote: {
      marginTop: 12,
      color: theme.text.soft,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyBold,
      lineHeight: 17,
      textAlign: "center",
    },
  }) satisfies Record<string, TextStyle | ViewStyle>;
