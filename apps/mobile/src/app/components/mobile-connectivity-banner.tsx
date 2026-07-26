import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";

import type { MobileTheme } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import {
  createInitialMobileConnectivityPresentation,
  planMobileConnectivityPresentation,
  type MobileConnectivityHealth,
  type MobileConnectivityPhase,
} from "../mobile-connectivity-presentation";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const BANNER_ENTER_MS = 200;

/**
 * The airplane-mode flow (`.maestro/helpers/phase5-offline-recovery.yml`) waits
 * on the offline id, so the test id names the *phase* rather than the component.
 * That is also what a reader wants from a log: which state the bar was in.
 */
const PHASE_TEST_ID: Record<Exclude<MobileConnectivityPhase, "hidden">, string> = {
  offline: "mobile-offline-banner",
  reconnecting: "mobile-realtime-banner",
  restored: "mobile-connectivity-restored",
};

const createStyles = (theme: MobileTheme) => ({
  action: {
    alignItems: "center" as const,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    justifyContent: "center" as const,
    minHeight: 32,
    paddingHorizontal: 12,
  },
  actionLabel: {
    ...theme.typography.label,
    color: theme.status.onStatus,
  },
  actionPressed: { opacity: 0.85 },
  banner: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 10,
    minHeight: 44,
    paddingHorizontal: theme.spacing.page,
    paddingVertical: 6,
    width: "100%" as const,
    zIndex: 90,
  },
  bannerOffline: { backgroundColor: theme.status.warningSoft },
  bannerReconnecting: { backgroundColor: theme.status.warningSoft },
  bannerRestored: { backgroundColor: theme.status.successSoft },
  description: {
    color: theme.status.onStatus,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 11,
    lineHeight: 15,
  },
  dot: { borderRadius: 4, height: 8, width: 8 },
  dotOffline: { backgroundColor: theme.status.warning },
  dotReconnecting: { backgroundColor: theme.status.warning },
  dotRestored: { backgroundColor: theme.status.success },
  text: { flex: 1, gap: 1, minWidth: 0 },
  title: {
    color: theme.status.onStatus,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 12,
  },
});

type BannerStyles = ReturnType<typeof useThemedStyles<ReturnType<typeof createStyles>>>;

function getPhaseCopy(phase: Exclude<MobileConnectivityPhase, "hidden">, canRetry: boolean) {
  if (phase === "offline") {
    return { description: copy.offlineBannerDescription, title: copy.offlineBannerTitle };
  }

  if (phase === "restored") {
    return {
      description: copy.connectivityRestoredDescription,
      title: copy.connectivityRestoredTitle,
    };
  }

  return canRetry
    ? { description: copy.realtimeFailedDescription, title: copy.realtimeFailedTitle }
    : { description: copy.realtimeReconnectingDescription, title: copy.realtimeReconnectingTitle };
}

function getPhaseStyles(phase: Exclude<MobileConnectivityPhase, "hidden">, styles: BannerStyles) {
  if (phase === "offline") {
    return { banner: styles.bannerOffline, dot: styles.dotOffline };
  }

  if (phase === "restored") {
    return { banner: styles.bannerRestored, dot: styles.dotRestored };
  }

  return { banner: styles.bannerReconnecting, dot: styles.dotReconnecting };
}

/**
 * The single connectivity surface: network loss, socket reconnects, and recovery
 * all speak through one bar, in that priority order.
 *
 * Timing is the whole point. `planMobileConnectivityPresentation` decides *when*
 * a state is worth showing — a reconnect that resolves in under two seconds is
 * never mentioned, an outage that is mentioned stays until it is resolved, and a
 * resolved outage closes with a confirmation instead of the bar just vanishing.
 */
export function MobileConnectivityBanner({
  canRetry,
  health,
  onReconnect,
}: {
  canRetry: boolean;
  health: MobileConnectivityHealth;
  onReconnect(): void;
}) {
  const styles = useThemedStyles(createStyles);
  const [presentation, setPresentation] = useState(createInitialMobileConnectivityPresentation);
  const healthSinceRef = useRef(Date.now());
  const lastHealthRef = useRef(health);

  useEffect(() => {
    if (lastHealthRef.current !== health) {
      lastHealthRef.current = health;
      healthSinceRef.current = Date.now();
    }

    const replan = () =>
      setPresentation((current) =>
        planMobileConnectivityPresentation({
          health,
          healthSince: healthSinceRef.current,
          now: Date.now(),
          previous: current,
        }),
      );

    replan();

    if (presentation.nextCheckInMs === null) {
      return;
    }

    const timer = setTimeout(replan, presentation.nextCheckInMs);
    return () => clearTimeout(timer);
  }, [health, presentation]);

  const { phase } = presentation;

  if (phase === "hidden") {
    return null;
  }

  const phaseCopy = getPhaseCopy(phase, canRetry);
  const phaseStyles = getPhaseStyles(phase, styles);
  const showRetry = phase === "reconnecting" && canRetry;

  return (
    <ConnectivityBannerSurface phase={phase} style={[styles.banner, phaseStyles.banner]}>
      <View style={[styles.dot, phaseStyles.dot]} />
      <View style={styles.text}>
        <Text style={styles.title}>{phaseCopy.title}</Text>
        <Text numberOfLines={2} style={styles.description}>
          {phaseCopy.description}
        </Text>
      </View>
      {showRetry ? (
        <Pressable
          accessibilityLabel={copy.realtimeReconnectAction}
          accessibilityRole="button"
          onPress={onReconnect}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          testID="mobile-connectivity-reconnect"
        >
          <Text style={styles.actionLabel}>{copy.realtimeReconnectAction}</Text>
        </Pressable>
      ) : null}
    </ConnectivityBannerSurface>
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
