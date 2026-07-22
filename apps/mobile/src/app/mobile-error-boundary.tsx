import { Component, useMemo, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMobileTheme } from "../design/mobile-theme-runtime";
import type { MobileTheme } from "../design/themes";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { reportMobileBoundaryError } from "../observability/mobile-sentry";
import { useThemedStyles } from "./providers/mobile-theme-provider";
import { useMobileBottomSystemSpacing } from "./use-mobile-bottom-system-spacing";

const copy = activeMobileCopy;

interface MobileErrorBoundaryProps {
  children: ReactNode;
}

interface MobileErrorBoundaryCoreProps extends MobileErrorBoundaryProps {
  FallbackComponent: ComponentType<{ onRetry(): void }>;
}

interface MobileErrorBoundaryState {
  hasError: boolean;
}

class MobileErrorBoundaryCore extends Component<
  MobileErrorBoundaryCoreProps,
  MobileErrorBoundaryState
> {
  state: MobileErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): MobileErrorBoundaryState {
    return {
      hasError: true,
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
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const { FallbackComponent } = this.props;
      return <FallbackComponent onRetry={this.handleRetry} />;
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

function MobileThemedErrorFallback({ onRetry }: { onRetry(): void }) {
  const styles = useThemedStyles(createMobileErrorStyles);
  return <MobileErrorFallback onRetry={onRetry} styles={styles} />;
}

function MobileBootstrapErrorFallback({ onRetry }: { onRetry(): void }) {
  const systemScheme = useColorScheme();
  const theme = getMobileTheme("system", systemScheme);
  const styles = useMemo(() => StyleSheet.create(createMobileErrorStyles(theme)), [theme]);
  return <MobileErrorFallback onRetry={onRetry} styles={styles} />;
}

function MobileErrorFallback({
  onRetry,
  styles,
}: {
  onRetry(): void;
  styles: ReturnType<typeof createMobileErrorStyles>;
}) {
  const insets = useSafeAreaInsets();
  // The fallback replaces the whole app, shell included, so it clears the Android
  // navigation bar through the shared policy instead of its own inset math.
  const bottomSystemSpacing = useMobileBottomSystemSpacing(20);

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.errorBoundaryRetryAction}
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
        >
          <Text style={styles.retryButtonText}>{copy.errorBoundaryRetryAction}</Text>
        </Pressable>
        <Text style={styles.footnote}>{copy.errorBoundaryFootnote}</Text>
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
