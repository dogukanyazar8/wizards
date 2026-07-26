import {
  Component,
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { setStringAsync } from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMobileTheme } from "../design/mobile-theme-runtime";
import type { MobileTheme } from "../design/themes";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { reportMobileBoundaryError } from "../observability/mobile-sentry";
import {
  classifyMobileBoundaryFault,
  createMobileBoundaryFaultReference,
  type MobileBoundaryFaultKind,
} from "./mobile-error-boundary-model";
import { useThemedStyles } from "./providers/mobile-theme-provider";
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

interface MobileBoundaryFault {
  readonly kind: MobileBoundaryFaultKind;
  readonly reference: string;
}

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
  const styles = useThemedStyles(createMobileErrorStyles);
  return <MobileErrorFallback fault={fault} onRetry={onRetry} styles={styles} />;
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
  return <MobileErrorFallback fault={fault} onRetry={onRetry} styles={styles} />;
}

function MobileErrorFallback({
  fault,
  onRetry,
  styles,
}: {
  fault: MobileBoundaryFault;
  onRetry(): void;
  styles: ReturnType<typeof createMobileErrorStyles>;
}) {
  const insets = useSafeAreaInsets();
  // The fallback replaces the whole app, shell included, so it clears the Android
  // navigation bar through the shared policy instead of its own inset math.
  const bottomSystemSpacing = useMobileBottomSystemSpacing(20);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const faultCopy = FAULT_COPY[fault.kind];

  // The bootstrap boundary sits above the toast provider, so the confirmation
  // has to live on this screen instead of being announced elsewhere.
  const copyReference = useCallback(() => {
    void setStringAsync(fault.reference).then(
      () => setReferenceCopied(true),
      () => setReferenceCopied(false),
    );
  }, [fault.reference]);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.safeArea,
        {
          paddingBottom: bottomSystemSpacing,
          paddingTop: Math.max(insets.top, 20),
        },
      ]}
    >
      <View style={styles.surface}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>!</Text>
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
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
        >
          <Text style={styles.retryButtonText}>{copy.errorBoundaryRetryAction}</Text>
        </Pressable>
        <View style={styles.referenceRow}>
          <Text style={styles.referenceLabel}>{copy.errorBoundaryReferenceLabel}</Text>
          <Pressable
            accessibilityHint={copy.errorBoundaryReferenceCopyAction}
            accessibilityLabel={fault.reference}
            accessibilityRole="button"
            onPress={copyReference}
            style={({ pressed }) => [styles.referenceChip, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.referenceValue} testID="mobile-error-boundary-reference">
              {fault.reference}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.footnote}>
          {referenceCopied ? copy.errorBoundaryReferenceCopiedNotice : copy.errorBoundaryFootnote}
        </Text>
      </View>
    </View>
  );
}

export const createMobileErrorStyles = (theme: MobileTheme) =>
  ({
    safeArea: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: theme.surface.base,
      paddingHorizontal: theme.spacing.page,
    },
    surface: {
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: theme.radii.card,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 22,
      paddingVertical: 24,
      ...theme.elevation.headerCard,
    },
    icon: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.control,
      backgroundColor: theme.surface.soft,
    },
    iconText: {
      color: theme.status.warning,
      fontSize: 20,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    title: {
      marginTop: 16,
      color: theme.text.primary,
      fontSize: 22,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textAlign: "center",
    },
    description: {
      marginTop: 8,
      color: theme.text.muted,
      fontSize: 14,
      fontFamily: theme.typography.fontFamilySemiBold,
      lineHeight: 20,
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
      borderRadius: theme.radii.control,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.soft,
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
    },
    retryButtonPressed: {
      opacity: 0.88,
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
