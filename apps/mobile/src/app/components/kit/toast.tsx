import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Animated, Easing, PanResponder, Pressable, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { activeMobileCopy as copy } from "../../../locale/mobile-locale-preferences";
import {
  MOBILE_TOAST_VARIANT_ICONS,
  MOBILE_TOAST_VARIANT_STROKE_WIDTHS,
  createMobileToastState,
  getMobileToastVariantPalette,
  mobileToastReducer,
  type MobileToastEntry,
  type MobileToastInput,
} from "./toast-model";

export type {
  MobileToastActionInput,
  MobileToastInput,
  MobileToastVariant,
  ToastTone,
} from "./toast-model";
export { MOBILE_TOAST_TONE_VARIANTS } from "./toast-model";

/**
 * The receipt a caller keeps for a toast it may still need to change — in
 * practice a loading card whose upload has to turn into success or error.
 */
export interface MobileToastHandle {
  readonly dismiss: () => void;
  readonly id: string;
  /** Swaps this card's content in place: no second toast, no re-entry slide. */
  readonly resolve: (input: MobileToastInput) => void;
}

interface ToastRuntime {
  dismissToast(id: string): void;
  showToast(input: MobileToastInput): MobileToastHandle;
}

const ToastContext = createContext<ToastRuntime | null>(null);

/** Handoff 3b: the card floats a hair below the status bar, never against it. */
const TOAST_TOP_GAP = 12;
const TOAST_ENTER_MS = 250;
const TOAST_EXIT_MS = 160;
const TOAST_ENTER_OFFSET = -18;
/** Past this much upward travel the gesture reads as "get rid of it". */
const TOAST_SWIPE_DISMISS_DISTANCE = 34;
const TOAST_SWIPE_DISMISS_VELOCITY = -0.5;
const TOAST_LOADING_SPIN_MS = 900;

const createStyles = (theme: MobileTheme) => ({
  viewport: {
    left: theme.spacing.section,
    position: "absolute" as const,
    right: theme.spacing.section,
    top: 0,
    zIndex: 100,
  },
  card: {
    alignItems: "center" as const,
    alignSelf: "center" as const,
    backgroundColor: theme.toast.card,
    borderColor: theme.toast.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    maxWidth: theme.sizing.maxInlineContentWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: "100%" as const,
    ...theme.elevation.toast,
  },
  iconTile: {
    alignItems: "center" as const,
    borderRadius: 14,
    flexGrow: 0,
    flexShrink: 0,
    height: 38,
    justifyContent: "center" as const,
    width: 38,
  },
  text: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  title: {
    color: theme.toast.title,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 19,
  },
  subtitle: {
    color: theme.toast.subtitle,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11.5,
    includeFontPadding: false,
    lineHeight: 16,
  },
  action: {
    borderRadius: 12,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionLabel: {
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 12.5,
    includeFontPadding: false,
    lineHeight: 16,
  },
  close: {
    alignItems: "center" as const,
    flexGrow: 0,
    flexShrink: 0,
    height: 20,
    justifyContent: "center" as const,
    width: 20,
  },
  pressed: { opacity: 0.75 },
  timerTrack: {
    backgroundColor: theme.toast.timerTrack,
    borderRadius: 2,
    bottom: 0,
    height: 3,
    left: 14,
    overflow: "hidden" as const,
    position: "absolute" as const,
    right: 14,
  },
  timerFill: {
    borderRadius: 2,
    height: 3,
  },
});

/**
 * Handoff 3a-3c: one card, at the top, for every temporary message the app has
 * to make. It replaced a bottom-anchored three-deep queue whose only tone
 * signal was a border that disappeared on an elevated surface — and, more to
 * the point, whose messages could not carry an action, a second line, or an
 * in-flight state, so screens kept growing their own inline banners instead.
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const styles = useThemedStyles(createStyles);
  const safeAreaTop = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const [state, dispatch] = useReducer(mobileToastReducer, undefined, createMobileToastState);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(1);
  const entry = state.entry;
  const entryId = entry === null ? null : entry.id;
  const entryRevision = entry === null ? 0 : entry.revision;
  const entryDuration = entry === null ? null : entry.duration;

  const enter = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const remaining = useRef<number | null>(null);
  const armedClock = useRef<string | null>(null);
  const openToastId = useRef<string | null>(null);

  const dismissToast = useCallback((id: string) => {
    dispatch({ id, type: "dismiss" });
  }, []);

  const showToast = useCallback((input: MobileToastInput): MobileToastHandle => {
    const id = `toast-${nextId.current}`;
    nextId.current += 1;
    dispatch({ id, input, type: "show" });

    return {
      dismiss: () => dispatch({ id, type: "dismiss" }),
      id,
      resolve: (resolution: MobileToastInput) =>
        dispatch({ id, input: resolution, type: "resolve" }),
    };
  }, []);

  const closeWithExit = useCallback(
    (id: string) => {
      Animated.timing(enter, {
        duration: TOAST_EXIT_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          dispatch({ id, type: "dismiss" });
        }
      });
    },
    [enter],
  );

  // Entry slide. Keyed on the card id, not its contents, so a loading card that
  // morphs into success stays put instead of replaying the slide.
  useEffect(() => {
    setPaused(false);

    if (entryId === null) {
      enter.setValue(0);
      return;
    }

    drag.setValue(0);
    enter.setValue(0);
    const animation = Animated.timing(enter, {
      duration: TOAST_ENTER_MS,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [drag, enter, entryId]);

  useEffect(() => {
    openToastId.current = entryId;
  }, [entryId]);

  // Auto-retire. This countdown is the authority; the hairline below only draws
  // it. A held finger stops both, so a message carrying an action is still
  // there when the thumb lifts.
  useEffect(() => {
    if (entryId === null || entryDuration === null) {
      armedClock.current = null;
      remaining.current = null;
      return;
    }

    // A fresh card — or the same card morphing out of loading — gets the whole
    // duration; a pause toggle resumes whatever was left of it.
    const clock = `${entryId}:${entryRevision}`;
    if (armedClock.current !== clock) {
      armedClock.current = clock;
      remaining.current = entryDuration;
    }

    if (paused) {
      return;
    }

    const pending = remaining.current ?? entryDuration;
    const startedAt = Date.now();
    const timer = setTimeout(() => closeWithExit(entryId), pending);

    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, pending - (Date.now() - startedAt));
    };
  }, [closeWithExit, entryDuration, entryId, entryRevision, paused]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Taps belong to the action button and the ✕; only a real upward drag is
        // ours, so the gesture never swallows a press.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy < -6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          drag.setValue(Math.min(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          const openId = openToastId.current;
          if (
            openId !== null &&
            (gesture.dy < -TOAST_SWIPE_DISMISS_DISTANCE ||
              gesture.vy < TOAST_SWIPE_DISMISS_VELOCITY)
          ) {
            closeWithExit(openId);
            return;
          }

          Animated.spring(drag, {
            bounciness: 0,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeWithExit, drag],
  );

  const runtime = useMemo<ToastRuntime>(
    () => ({ dismissToast, showToast }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={runtime}>
      {children}
      {entry ? (
        <View
          pointerEvents="box-none"
          style={[styles.viewport, { top: safeAreaTop + TOAST_TOP_GAP }]}
          testID="mobile-toast-viewport"
        >
          <Animated.View
            style={{
              opacity: enter,
              transform: [
                {
                  translateY: Animated.add(
                    enter.interpolate({
                      inputRange: [0, 1],
                      outputRange: [TOAST_ENTER_OFFSET, 0],
                    }),
                    drag,
                  ),
                },
              ],
            }}
            {...panResponder.panHandlers}
          >
            <ToastCard
              entry={entry}
              onDismiss={() => dismissToast(entry.id)}
              onPauseChange={setPaused}
              paused={paused}
            />
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastCard({
  entry,
  onDismiss,
  onPauseChange,
  paused,
}: {
  readonly entry: MobileToastEntry;
  readonly onDismiss: () => void;
  readonly onPauseChange: (paused: boolean) => void;
  readonly paused: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const palette = getMobileToastVariantPalette(theme, entry.variant);

  return (
    <View
      // An error is the one message that interrupts: it is the difference
      // between "saved" and "not saved", and a queued announcement arrives
      // after the user has already moved on.
      accessibilityLiveRegion={entry.variant === "error" ? "assertive" : "polite"}
      accessibilityRole="alert"
      onTouchCancel={() => onPauseChange(false)}
      onTouchEnd={() => onPauseChange(false)}
      onTouchStart={() => onPauseChange(true)}
      style={styles.card}
      testID="mobile-toast"
    >
      <View
        style={[
          styles.iconTile,
          {
            backgroundColor: palette.iconSurface,
            ...(palette.iconBorder === null
              ? {}
              : { borderColor: palette.iconBorder, borderWidth: 1 }),
          },
        ]}
        testID={`mobile-toast-variant-${entry.variant}`}
      >
        <ToastGlyph color={palette.iconColor} variant={entry.variant} />
      </View>

      <View style={styles.text}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
          {entry.title}
        </Text>
        {entry.subtitle === null ? null : (
          <Text
            maxFontSizeMultiplier={2}
            numberOfLines={1}
            style={styles.subtitle}
            testID="mobile-toast-subtitle"
          >
            {entry.subtitle}
          </Text>
        )}
      </View>

      {/* Never both: an offered action and an escape hatch in the same row turn
          a confirmation into a decision. */}
      {entry.action ? (
        <Pressable
          accessibilityRole="button"
          // 8px of padding makes a 32px button; the slop is what carries it to
          // the 44px the action actually has to be.
          hitSlop={{ bottom: 6, left: 8, right: 8, top: 6 }}
          onPress={() => {
            entry.action?.onPress();
            onDismiss();
          }}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: palette.actionSurface },
            pressed && styles.pressed,
          ]}
          testID="mobile-toast-action"
        >
          <Text style={[styles.actionLabel, { color: palette.actionText }]}>
            {entry.action.label}
          </Text>
        </Pressable>
      ) : entry.variant === "loading" ? null : (
        <Pressable
          accessibilityLabel={copy.dismissNotificationAction}
          accessibilityRole="button"
          hitSlop={12}
          onPress={onDismiss}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          testID="mobile-toast-dismiss"
        >
          <MobileLineIcon color={theme.toast.closeIcon} name="close" size={14} strokeWidth={2.2} />
        </Pressable>
      )}

      {entry.duration === null ? null : (
        <ToastTimerBar
          color={palette.timer}
          duration={entry.duration}
          fillStyle={styles.timerFill}
          key={`${entry.id}-${entry.revision}`}
          paused={paused}
          style={styles.timerTrack}
        />
      )}
    </View>
  );
}

/** The loading arc is the only glyph that moves; the rest are static line icons. */
function ToastGlyph({
  color,
  variant,
}: {
  readonly color: string;
  readonly variant: MobileToastEntry["variant"];
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (variant !== "loading") {
      return;
    }

    spin.setValue(0);
    const animation = Animated.loop(
      Animated.timing(spin, {
        duration: TOAST_LOADING_SPIN_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin, variant]);

  const glyph = (
    <MobileLineIcon
      color={color}
      name={MOBILE_TOAST_VARIANT_ICONS[variant]}
      size={17}
      strokeWidth={MOBILE_TOAST_VARIANT_STROKE_WIDTHS[variant]}
    />
  );

  if (variant !== "loading") {
    return glyph;
  }

  return (
    <Animated.View
      style={{
        transform: [
          { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
        ],
      }}
      testID="mobile-toast-spinner"
    >
      {glyph}
    </Animated.View>
  );
}

/**
 * The 3px hairline that drains over the card's own lifetime. It is what lets a
 * toast be dismissible without a close button screaming for an answer, and it
 * freezes under a held finger so a countdown never runs out while it is being
 * read.
 */
function ToastTimerBar({
  color,
  duration,
  fillStyle,
  paused,
  style,
}: {
  readonly color: string;
  readonly duration: number;
  readonly fillStyle: object;
  readonly paused: boolean;
  readonly style: object;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const latest = useRef(1);

  useEffect(() => {
    const subscription = progress.addListener(({ value }) => {
      latest.current = value;
    });

    return () => progress.removeListener(subscription);
  }, [progress]);

  useEffect(() => {
    if (paused) {
      return;
    }

    // Width interpolation cannot ride the native driver, which is fine for a
    // 3px bar and keeps it honest about the time that is actually left.
    const animation = Animated.timing(progress, {
      duration: Math.max(0, duration * latest.current),
      easing: Easing.linear,
      toValue: 0,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [duration, paused, progress]);

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

export function useToast(): ToastRuntime {
  const runtime = useContext(ToastContext);

  if (!runtime) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return runtime;
}
