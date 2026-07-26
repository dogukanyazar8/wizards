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
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { MobileLineIcon, type MobileLineIconName } from "../../../design/mobile-line-icons";
import { activeMobileCopy as copy } from "../../../locale/mobile-locale-preferences";
import { useMobileBottomSystemSpacing } from "../../use-mobile-bottom-system-spacing";

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

const TOAST_ENTER_MS = 220;

const createStyles = (theme: MobileTheme) => ({
  viewport: {
    bottom: 24,
    left: theme.spacing.page,
    position: "absolute" as const,
    right: theme.spacing.page,
    zIndex: 100,
  },
  // No dismiss button: a close affordance turns a routine confirmation into something
  // that looks like it needs an answer. The card auto-retires, shows how long is left on
  // a hairline, and a tap anywhere sends it away early.
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
    minHeight: 56,
    overflow: "hidden" as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%" as const,
    ...theme.elevation.tabBar,
  },
  toastPressed: { opacity: 0.9 },
  pressTarget: { alignSelf: "center" as const, maxWidth: 520, width: "100%" as const },
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
  timerTrack: {
    bottom: 0,
    height: 2,
    left: 0,
    position: "absolute" as const,
    right: 0,
  },
  timerFill: {
    height: 2,
    width: "100%" as const,
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
            <Pressable
              accessibilityHint={copy.dismissNotificationAction}
              onPress={() => dismissToast(currentToast.id)}
              style={styles.pressTarget}
              testID="mobile-toast-dismiss"
            >
              {({ pressed }) => (
                <View
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  style={[styles.toast, pressed && styles.toastPressed]}
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
                  <ToastTimerBar
                    color={tone.icon}
                    duration={currentToast.duration}
                    style={styles.timerTrack}
                    fillStyle={styles.timerFill}
                  />
                </View>
              )}
            </Pressable>
          </ToastCard>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * A 2px hairline that drains over the toast's own lifetime. It replaces the close
 * button: the reason a dismiss control felt necessary was that the card gave no sign
 * it was temporary, and a countdown says that without asking for a decision.
 */
function ToastTimerBar({
  color,
  duration,
  fillStyle,
  style,
}: {
  readonly color: string;
  readonly duration: number;
  readonly fillStyle: object;
  readonly style: object;
}) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    progress.setValue(1);
    // Width interpolation cannot run on the native driver, which is fine for a
    // single 2px bar and keeps the bar honest about the real remaining time.
    const animation = Animated.timing(progress, {
      duration,
      easing: Easing.linear,
      toValue: 0,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [duration, progress]);

  return (
    <View pointerEvents="none" style={style} testID="mobile-toast-timer">
      <Animated.View
        style={[
          fillStyle,
          {
            backgroundColor: color,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          },
        ]}
      />
    </View>
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
      duration: TOAST_ENTER_MS,
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
