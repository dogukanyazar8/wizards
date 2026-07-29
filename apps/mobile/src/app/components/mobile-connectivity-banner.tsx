import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { MobileLineIcon, type MobileLineIconName } from "../../design/mobile-line-icons";
import type { MobileTheme, MobileToastVariantId } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import {
  isMobileConnectivityDegradedPhase,
  type MobileConnectivityPhase,
} from "../mobile-connectivity-presentation";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";
import { getMobileToastVariantPalette } from "./kit/toast-model";

const BANNER_ENTER_MS = 200;
const GLYPH_SPIN_MS = 900;

/** Same gap the toast keeps under the status bar, so both read as one system. */
const BANNER_TOP_GAP = 12;

/**
 * How long the button stays in its "trying" state after a retry was asked for.
 *
 * A reconnect either lands in milliseconds or not at all, so without a floor the
 * label flickers through "Deneniyor" too fast to read and the tap looks ignored.
 */
const RETRY_FEEDBACK_MS = 900;

/**
 * The airplane-mode flow (`.maestro/helpers/phase5-offline-recovery.yml`) waits
 * on the offline id, so the test id names the *phase* rather than the component.
 * That is also what a reader wants from a log: which state the bar was in.
 */
const PHASE_TEST_ID: Record<Exclude<MobileConnectivityPhase, "hidden">, string> = {
  failed: "mobile-realtime-failed-banner",
  offline: "mobile-offline-banner",
  reconnecting: "mobile-realtime-banner",
  restored: "mobile-connectivity-restored",
};

/**
 * Connectivity borrows the toast's tone vocabulary rather than inventing one.
 *
 * The card, the title and the geometry are identical across both surfaces;
 * colour reaches only the glyph tile and the action button, which is the rule
 * handoff 3b set for every temporary message the app makes. A second palette
 * here would be a second answer to a question already answered.
 */
const PHASE_VARIANT: Record<Exclude<MobileConnectivityPhase, "hidden">, MobileToastVariantId> = {
  failed: "error",
  offline: "warning",
  reconnecting: "loading",
  restored: "success",
};

const PHASE_ICON: Record<Exclude<MobileConnectivityPhase, "hidden">, MobileLineIconName> = {
  failed: "alert-triangle",
  offline: "globe",
  reconnecting: "loader-arc",
  restored: "check",
};

/** The arc is the only glyph that moves, exactly as in the toast. */
const PHASE_STROKE_WIDTH: Record<Exclude<MobileConnectivityPhase, "hidden">, number> = {
  failed: 2.4,
  offline: 2.2,
  reconnecting: 2.4,
  restored: 2.6,
};

const createStyles = (theme: MobileTheme) => ({
  /**
   * The toast card, held open.
   *
   * This used to be a full-bleed tinted strip with a hairline under it — the
   * inline-banner shape handoff 3a replaced everywhere else in the app, so the
   * one surface that reports an outage was also the one surface that did not
   * look like the product. Same radius, same padding, same elevation, same
   * width cap as the toast; the only difference is that this card is a state
   * rather than a message, so it stays until the state ends.
   */
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
  /**
   * The bar is mounted above the shell, and the shell is what owns the top edge
   * for the screens — so nothing had padded this one. It drew from y=0, straight
   * under the Android status bar: the title sat behind the clock, the retry
   * behind the battery icon, and the system bar swallowed the tap.
   */
  viewport: {
    paddingHorizontal: theme.spacing.section,
    width: "100%" as const,
    zIndex: 90,
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
  title: {
    color: theme.toast.title,
    flex: 1,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 19,
    minWidth: 0,
  },
  action: {
    alignItems: "center" as const,
    borderRadius: 12,
    flexDirection: "row" as const,
    flexGrow: 0,
    flexShrink: 0,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionDisabled: { opacity: theme.layout.opacity.disabled },
  actionLabel: {
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 12.5,
    includeFontPadding: false,
    lineHeight: 16,
  },
  actionPressed: { opacity: theme.layout.opacity.pressed },
});

type BannerStyles = ReturnType<typeof useThemedStyles<ReturnType<typeof createStyles>>>;

function getPhaseTitle(phase: Exclude<MobileConnectivityPhase, "hidden">): string {
  switch (phase) {
    case "failed":
      return copy.realtimeFailedTitle;
    case "offline":
      return copy.offlineBannerTitle;
    case "restored":
      return copy.connectivityRestoredTitle;
    default:
      return copy.realtimeReconnectingTitle;
  }
}

/**
 * The single connectivity surface: network loss, socket reconnects, a spent
 * retry budget and recovery all speak through one card, in that priority order.
 *
 * The card states the situation in one line and offers the only action that can
 * change it. It used to spend a second line explaining what still works while
 * hiding the retry behind a state the user could not observe — so an outage read
 * as a lecture with no way out. Whenever the connection is not carrying events
 * the button is there, including offline: the user is usually the one who just
 * fixed the network, and asking the OS again is cheaper than waiting for it.
 */
export function MobileConnectivityBanner({
  onRetry,
  phase,
}: {
  onRetry(): Promise<void> | void;
  phase: MobileConnectivityPhase;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const safeAreaTop = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const [retrying, setRetrying] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    },
    [],
  );

  const handleRetry = useCallback(() => {
    if (retrying) {
      return;
    }

    setRetrying(true);
    void Promise.resolve(onRetry())
      .catch(() => {
        // A retry that could not even be attempted is still an attempt as far as
        // this bar is concerned; the phase is what reports the outcome.
      })
      .finally(() => {
        retryTimerRef.current = setTimeout(() => setRetrying(false), RETRY_FEEDBACK_MS);
      });
  }, [onRetry, retrying]);

  if (phase === "hidden") {
    return null;
  }

  const palette = getMobileToastVariantPalette(theme, PHASE_VARIANT[phase]);
  const canRetry = isMobileConnectivityDegradedPhase(phase);

  return (
    <ConnectivityBannerSurface
      phase={phase}
      style={[styles.viewport, { paddingTop: safeAreaTop + BANNER_TOP_GAP }]}
    >
      <View style={styles.card} testID="mobile-connectivity-card">
        <View
          style={[
            styles.iconTile,
            {
              backgroundColor: palette.iconSurface,
              ...(palette.iconBorder ? { borderColor: palette.iconBorder, borderWidth: 1 } : null),
            },
          ]}
        >
          <ConnectivityGlyph color={palette.iconColor} phase={phase} />
        </View>
        <Text numberOfLines={2} style={styles.title}>
          {getPhaseTitle(phase)}
        </Text>
        {canRetry ? (
          <Pressable
            accessibilityLabel={copy.realtimeReconnectAction}
            accessibilityRole="button"
            accessibilityState={{ busy: retrying, disabled: retrying }}
            disabled={retrying}
            // The button is 32pt tall inside a 62pt card; the slop hands it the
            // card's own padding too, so the tap lands wherever a thumb aims at
            // the right-hand end.
            hitSlop={{ bottom: 12, left: 14, right: 14, top: 12 }}
            onPress={handleRetry}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: palette.actionSurface },
              retrying && styles.actionDisabled,
              pressed && styles.actionPressed,
            ]}
            testID="mobile-connectivity-reconnect"
          >
            {retrying ? <ActivityIndicator color={palette.actionText} size="small" /> : null}
            <Text style={[styles.actionLabel, { color: palette.actionText }]}>
              {retrying ? copy.realtimeRetryingAction : copy.realtimeReconnectAction}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ConnectivityBannerSurface>
  );
}

/** Only a state the app is actively working on moves; a settled one holds still. */
function ConnectivityGlyph({
  color,
  phase,
}: {
  color: string;
  phase: Exclude<MobileConnectivityPhase, "hidden">;
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== "reconnecting") {
      return;
    }

    spin.setValue(0);
    const animation = Animated.loop(
      Animated.timing(spin, {
        duration: GLYPH_SPIN_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, spin]);

  const glyph = (
    <MobileLineIcon
      color={color}
      name={PHASE_ICON[phase]}
      size={17}
      strokeWidth={PHASE_STROKE_WIDTH[phase]}
    />
  );

  if (phase !== "reconnecting") {
    return glyph;
  }

  return (
    <Animated.View
      style={{
        transform: [
          { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
        ],
      }}
      testID="mobile-connectivity-spinner"
    >
      {glyph}
    </Animated.View>
  );
}

/**
 * Keyed per phase so a morph (offline into reconnecting) replays the slide
 * instead of swapping words in place — the movement is what tells the user the
 * situation changed. Layout still settles in one frame; only paint is animated,
 * which keeps the push on the screen below instant.
 */
function ConnectivityBannerSurface({
  children,
  phase,
  style,
}: {
  children: React.ReactNode;
  phase: Exclude<MobileConnectivityPhase, "hidden">;
  style: object[];
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: BANNER_ENTER_MS,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [phase, progress]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        ...style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
          ],
        },
      ]}
      testID={PHASE_TEST_ID[phase]}
    >
      {children}
    </Animated.View>
  );
}
