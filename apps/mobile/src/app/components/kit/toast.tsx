import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Text, View } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { IconButton } from "./icon-button";

export type ToastTone = "danger" | "info" | "success" | "warning";

export interface ShowToastInput {
  readonly duration?: number;
  readonly message: string;
  readonly tone?: ToastTone;
}

interface ToastEntry {
  readonly duration: number;
  readonly id: string;
  readonly message: string;
  readonly tone: ToastTone;
}

interface ToastRuntime {
  dismissToast(id: string): void;
  showToast(input: ShowToastInput): string;
}

const MAX_TOAST_QUEUE = 3;
const ToastContext = createContext<ToastRuntime | null>(null);

const createStyles = (theme: MobileTheme) => ({
  viewport: {
    bottom: 24,
    left: theme.spacing.page,
    position: "absolute" as const,
    right: theme.spacing.page,
    zIndex: 100,
  },
  toast: {
    alignItems: "center" as const,
    alignSelf: "center" as const,
    backgroundColor: theme.surface.elevated,
    borderColor: theme.border.default,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    maxWidth: 520,
    minHeight: 56,
    paddingHorizontal: theme.spacing.section,
    paddingVertical: 8,
    width: "100%" as const,
    ...theme.elevation.floating,
  },
  danger: { borderColor: theme.status.danger },
  info: { borderColor: theme.status.info },
  success: { borderColor: theme.status.success },
  warning: { borderColor: theme.status.warning },
  message: { ...theme.typography.bodyStrong, color: theme.text.primary, flex: 1 },
});

function clampToastDuration(duration: number | undefined): number {
  if (!Number.isFinite(duration)) {
    return 4_000;
  }

  return Math.min(10_000, Math.max(1_500, Math.round(duration ?? 4_000)));
}

export function ToastProvider({ children }: PropsWithChildren) {
  const styles = useThemedStyles(createStyles);
  const [queue, setQueue] = useState<readonly ToastEntry[]>([]);
  const nextId = useRef(1);
  const currentToast = queue[0];

  const dismissToast = useCallback((id: string) => {
    setQueue((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const showToast = useCallback((input: ShowToastInput) => {
    const id = `toast-${nextId.current}`;
    nextId.current += 1;
    const entry: ToastEntry = {
      duration: clampToastDuration(input.duration),
      id,
      message: input.message,
      tone: input.tone ?? "info",
    };
    setQueue((current) =>
      current.length >= MAX_TOAST_QUEUE ? current : [...current, entry],
    );
    return id;
  }, []);

  useEffect(() => {
    if (!currentToast) {
      return;
    }

    const timer = setTimeout(() => dismissToast(currentToast.id), currentToast.duration);
    return () => clearTimeout(timer);
  }, [currentToast, dismissToast]);

  const runtime = useMemo<ToastRuntime>(
    () => ({ dismissToast, showToast }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={runtime}>
      {children}
      {currentToast ? (
        <View pointerEvents="box-none" style={styles.viewport}>
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={[styles.toast, styles[currentToast.tone]]}
            testID="mobile-toast"
          >
            <Text maxFontSizeMultiplier={1.5} numberOfLines={3} style={styles.message}>
              {currentToast.message}
            </Text>
            <IconButton
              accessibilityLabel="Dismiss notification"
              icon="close"
              onPress={() => dismissToast(currentToast.id)}
              size="sm"
              testID="mobile-toast-dismiss"
              tone="muted"
            />
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastRuntime {
  const runtime = useContext(ToastContext);

  if (!runtime) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return runtime;
}
