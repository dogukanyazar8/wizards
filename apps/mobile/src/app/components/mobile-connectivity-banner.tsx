import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text } from "react-native";

import type { MobileTheme } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import {
  isMobileConnectivityDegradedPhase,
  type MobileConnectivityPhase,
} from "../mobile-connectivity-presentation";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const BANNER_ENTER_MS = 200;
const DOT_PULSE_MS = 900;

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

const createStyles = (theme: MobileTheme) => ({
  action: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderRadius: theme.radii.pill,
    borderWidth: theme.layout.border.hairline,
    borderColor: theme.border.subtle,
    flexDirection: "row" as const,
    gap: 6,
    justifyContent: "center" as const,
    minHeight: 30,
    paddingHorizontal: 12,
  },
  actionDisabled: { opacity: theme.layout.opacity.disabled },
  actionLabel: {
    ...theme.typography.label,
    color: theme.text.primary,
  },
  actionPressed: { opacity: theme.layout.opacity.pressed },
  banner: {
    alignItems: "center" as const,
    borderBottomWidth: theme.layout.border.hairline,
    flexDirection: "row" as const,
    gap: 10,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: theme.spacing.page,
    paddingVertical: 7,
    width: "100%" as const,
    zIndex: 90,
  },
  bannerFailed: {
    backgroundColor: theme.status.dangerSoft,
    borderBottomColor: theme.status.danger,
  },
  bannerOffline: {
    backgroundColor: theme.status.warningSoft,
    borderBottomColor: theme.status.warning,
  },
  bannerReconnecting: {
    backgroundColor: theme.status.warningSoft,
    borderBottomColor: theme.status.warning,
  },
  bannerRestored: {
    backgroundColor: theme.status.successSoft,
    borderBottomColor: theme.status.success,
  },
  dot: { borderRadius: 4, height: 8, width: 8 },
  dotFailed: { backgroundColor: theme.status.danger },
  dotOffline: { backgroundColor: theme.status.warning },
  dotReconnecting: { backgroundColor: theme.status.warning },
  dotRestored: { backgroundColor: theme.status.success },
  title: {
    color: theme.status.onStatus,
    flex: 1,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 13,
    minWidth: 0,
  },
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

function getPhaseStyles(phase: Exclude<MobileConnectivityPhase, "hidden">, styles: BannerStyles) {
  switch (phase) {
    case "failed":
      return { banner: styles.bannerFailed, dot: styles.dotFailed };
    case "offline":
      return { banner: styles.bannerOffline, dot: styles.dotOffline };
    case "restored":
      return { banner: styles.bannerRestored, dot: styles.dotRestored };
    default:
      return { banner: styles.bannerReconnecting, dot: styles.dotReconnecting };
  }
}

/**
 * The single connectivity surface: network loss, socket reconnects, a spent
 * retry budget and recovery all speak through one bar, in that priority order.
 *
 * The bar states the situation in one line and offers the only action that can
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

  const phaseStyles = getPhaseStyles(phase, styles);
  const canRetry = isMobileConnectivityDegradedPhase(phase);

  return (
    <ConnectivityBannerSurface phase={phase} style={[styles.banner, phaseStyles.banner]}>
      <ConnectivityDot phase={phase} style={[styles.dot, phaseStyles.dot]} />
      <Text numberOfLines={1} style={styles.title}>
        {getPhaseTitle(phase)}
      </Text>
      {canRetry ? (
        <Pressable
          accessibilityLabel={copy.realtimeReconnectAction}
          accessibilityRole="button"
          accessibilityState={{ busy: retrying, disabled: retrying }}
          disabled={retrying}
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.action,
            retrying && styles.actionDisabled,
            pressed && styles.actionPressed,
          ]}
          testID="mobile-connectivity-reconnect"
        >
          {retrying ? <ActivityIndicator size="small" /> : null}
          <Text style={styles.actionLabel}>
            {retrying ? copy.realtimeRetryingAction : copy.realtimeReconnectAction}
          </Text>
        </Pressable>
      ) : null}
    </ConnectivityBannerSurface>
  );
}

/** Only a state the app is actively working on breathes; a settled one holds still. */
function ConnectivityDot({
  phase,
  style,
}: {
  phase: Exclude<MobileConnectivityPhase, "hidden">;
  style: object[];
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase !== "reconnecting") {
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: DOT_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          toValue: 0.35,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: DOT_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, pulse]);

  return <Animated.View style={[...style, { opacity: pulse }]} />;
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
