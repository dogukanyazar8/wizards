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
import { Animated, Easing, Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { MobileLineIcon, type MobileLineIconName } from "../../../design/mobile-line-icons";
import { activeMobileCopy as copy } from "../../../locale/mobile-locale-preferences";
import { useMobileBottomSystemSpacing } from "../../use-mobile-bottom-system-spacing";
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

const TOAST_TONE_ICONS: Record<ToastTone, MobileLineIconName> = {
  danger: "alert-circle",
  info: "info",
  success: "check",
  warning: "alert-circle",
};

/**
 * Tone reads from a filled glyph tile, not from the card border. A 1px coloured
 * outline was the whole visual language of the old toast and it disappeared
 * against the elevated surface; a tinted tile carries the same meaning at a
 * glance and leaves the card itself neutral.
 */
function getToastToneColors(theme: MobileTheme, tone: ToastTone) {
  switch (tone) {
    case "success":
      return { icon: theme.status.successText, tile: theme.status.successSoft };
    case "danger":
      return { icon: theme.status.dangerOnBase, tile: theme.status.dangerSoft };
    case "warning":
      return { icon: theme.status.warning, tile: theme.status.warningSoft };
    default:
      return { icon: theme.status.info, tile: theme.status.infoSoft };
  }
}

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
    borderColor: theme.border.subtle,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    maxWidth: 520,
    minHeight: 60,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
    width: "100%" as const,
    ...theme.elevation.tabBar,
  },
  toneTile: {
    alignItems: "center" as const,
    borderRadius: 13,
    height: 36,
    justifyContent: "center" as const,
    width: 36,
  },
  message: {
    color: theme.text.primary,
    flex: 1,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13.5,
    includeFontPadding: false,
    lineHeight: 18,
    minWidth: 0,
  },
});

function clampToastDuration(duration: number | undefined): number {
  if (!Number.isFinite(duration)) {
    return 4_000;
  }

  return Math.min(10_000, Math.max(1_500, Math.round(duration ?? 4_000)));
}

export function ToastProvider({ children }: PropsWithChildren) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const toastBottom = useMobileBottomSystemSpacing(24);
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
    setQueue((current) => (current.length >= MAX_TOAST_QUEUE ? current : [...current, entry]));
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

  const tone = getToastToneColors(theme, currentToast?.tone ?? "info");

  return (
    <ToastContext.Provider value={runtime}>
      {children}
      {currentToast ? (
        <View
          pointerEvents="box-none"
          style={[styles.viewport, { bottom: toastBottom }]}
          testID="mobile-toast-viewport"
        >
          <ToastCard key={currentToast.id}>
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.toast}
              testID="mobile-toast"
            >
              <View
                style={[styles.toneTile, { backgroundColor: tone.tile }]}
                testID={`mobile-toast-tone-${currentToast.tone}`}
              >
                <MobileLineIcon
                  color={tone.icon}
                  name={TOAST_TONE_ICONS[currentToast.tone]}
                  size={18}
                  strokeWidth={2.4}
                />
              </View>
              <Text maxFontSizeMultiplier={2} numberOfLines={3} style={styles.message}>
                {currentToast.message}
              </Text>
              <IconButton
                accessibilityLabel={copy.dismissNotificationAction}
                icon="close"
                onPress={() => dismissToast(currentToast.id)}
                size="sm"
                testID="mobile-toast-dismiss"
                tone="muted"
              />
            </View>
          </ToastCard>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * The toast used to pop in with no transition at all, which is what made a
 * routine "Profil güncellendi" read as an error dialog. Keyed per entry so a
 * second toast replays the rise instead of swapping text in place.
 */
function ToastCard({ children }: PropsWithChildren) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function useToast(): ToastRuntime {
  const runtime = useContext(ToastContext);

  if (!runtime) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return runtime;
}
