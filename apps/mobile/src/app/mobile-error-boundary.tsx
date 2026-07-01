import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileColors, mobileRadii, mobileSpacing } from "../design/tokens";
import { mobileCopy } from "../locale/mobile-copy";

const copy = mobileCopy.tr;

interface MobileErrorBoundaryProps {
  children: ReactNode;
}

interface MobileErrorBoundaryState {
  hasError: boolean;
}

export class MobileErrorBoundary extends Component<
  MobileErrorBoundaryProps,
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
      return <MobileErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

function MobileErrorFallback({ onRetry }: { onRetry(): void }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.safeArea,
        {
          paddingBottom: Math.max(insets.bottom, 20),
          paddingTop: Math.max(insets.top, 20),
        },
      ]}
    >
      <View style={styles.surface}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>!</Text>
        </View>
        <Text style={styles.title}>{copy.errorBoundaryTitle}</Text>
        <Text style={styles.description}>{copy.errorBoundaryDescription}</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: mobileColors.background,
    paddingHorizontal: mobileSpacing.page,
  },
  surface: {
    alignItems: "center",
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.card,
    backgroundColor: mobileColors.card,
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 2,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FEF3C7",
  },
  iconText: {
    color: mobileColors.warning,
    fontSize: 20,
    fontWeight: "900",
  },
  title: {
    marginTop: 16,
    color: mobileColors.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  description: {
    marginTop: 8,
    color: mobileColors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    marginTop: 18,
    borderRadius: mobileRadii.control,
    backgroundColor: mobileColors.accentStrong,
    paddingHorizontal: 18,
  },
  retryButtonPressed: {
    opacity: 0.88,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  footnote: {
    marginTop: 12,
    color: mobileColors.mutedSoft,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
  },
});
