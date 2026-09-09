import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import {
  formatSplashUpdateProgress,
  formatSplashUpdateSize,
  SPLASH_STEP_LINE_SUFFIX,
  type SplashStateId,
  type SplashStepId,
  type SplashUpdateProgress,
} from "@wizards/types";

import { whisprSplashMark } from "../../../design/palette";
import { mobileSplashMetrics, mobileSplashTypography } from "../../../design/tokens";
import type { MobileTheme } from "../../../design/themes";
import { activeMobileCopy } from "../../../locale/mobile-locale-preferences";
import {
  getMobileSplashStateVisual,
  MOBILE_SPLASH_STATE_COPY,
  MOBILE_SPLASH_STEP_COPY,
  pickMobileSplashTipKey,
} from "./mobile-splash-model";

/**
 * Mobil açılış ekranı — SPEC-SPLASH §6.
 *
 * Ölçüler `mobileSplashMetrics`/`mobileSplashTypography`den (Dalga 1), metinler mobil
 * kopya sözlüğünden, renkler temadan gelir. Bileşen karar vermez: adım ve durum
 * dışarıdan verilir.
 */

const BREATHE_MS = 3_600;
const DRIFT_MS = 16_000;
const EQUALIZER_MS = 2_100;
const BAR_DELAY_MS = 130;

export type MobileSplashScreenProps = {
  readonly onAction?: () => void;
  readonly state?: SplashStateId;
  readonly step: SplashStepId;
  readonly theme: MobileTheme;
  readonly update?: SplashUpdateProgress | null;
  readonly versionLine: string;
  readonly environmentLabel: string;
  readonly environmentTone: "prod" | "uat";
};

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) {
        setReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

/** SPEC §3.2 — nefes ve ışıma; hareket azaltma altında hiç kurulmaz. */
function useBreathe(enabled: boolean) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, { duration: BREATHE_MS / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [enabled, progress]);

  return useAnimatedStyle(() => ({ transform: [{ scale: 1 + progress.value * 0.055 }] }));
}

function useDrift(enabled: boolean) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, { duration: DRIFT_MS / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [enabled, progress]);

  return useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * 12 },
      { translateY: progress.value * -10 },
      { scale: 1 + progress.value * 0.06 },
    ],
  }));
}

/** SPEC §3.1 mobil aurorası: iki radyal, tüm ekranda. */
function MobileSplashAurora({
  animated,
  theme,
  wash,
}: {
  readonly animated: boolean;
  readonly theme: MobileTheme;
  readonly wash: { readonly color: string; readonly opacity: number } | null;
}) {
  const driftStyle = useDrift(animated);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, driftStyle]}>
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id="whisprSplashPrimary" r="50%">
            <Stop
              offset="0"
              stopColor={wash ? wash.color : theme.accent.default}
              stopOpacity={wash ? wash.opacity : 0.22}
            />
            <Stop offset="1" stopColor={wash ? wash.color : theme.accent.default} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient cx="50%" cy="50%" id="whisprSplashSuccess" r="50%">
            <Stop offset="0" stopColor={theme.status.success} stopOpacity={0.14} />
            <Stop offset="1" stopColor={theme.status.success} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="34%" fill="url(#whisprSplashPrimary)" rx="52%" ry="42%" />
        {wash ? null : (
          <Ellipse cx="62%" cy="72%" fill="url(#whisprSplashSuccess)" rx="50%" ry="40%" />
        )}
      </Svg>
    </Animated.View>
  );
}

/**
 * Logo işareti — SPEC §2 ölçüleri.
 *
 * Gradyan tasarımda sabit renk olarak tanımlıdır (tokenlı değildir); bu, uygulamada
 * hex kullanılan tek yerdir ve bilerek öyledir.
 */
function MobileSplashMark({ animated, dimmed }: { animated: boolean; dimmed: boolean }) {
  const bars = mobileSplashMetrics.markBarHeights;

  return (
    <View
      style={[
        styles.mark,
        { opacity: dimmed ? 0.9 : 1, transform: [{ scale: mobileSplashMetrics.markScale }] },
      ]}
    >
      <LinearGradient
        colors={whisprSplashMark.gradient}
        end={{ x: 1, y: 1 }}
        locations={whisprSplashMark.gradientLocations}
        start={{ x: 0, y: 0 }}
        style={styles.markGradient}
      >
        {bars.map((height, index) => (
          <MobileSplashBar
            animated={animated}
            delayMs={index * BAR_DELAY_MS}
            height={height}
            key={`${height}-${index}`}
          />
        ))}
      </LinearGradient>
    </View>
  );
}

function MobileSplashBar({
  animated,
  delayMs,
  height,
}: {
  readonly animated: boolean;
  readonly delayMs: number;
  readonly height: number;
}) {
  const progress = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      progress.value = 1;
      return;
    }

    const timeout = setTimeout(() => {
      progress.value = withRepeat(
        withTiming(1, {
          duration: EQUALIZER_MS / 2,
          easing: Easing.bezier(0.45, 0, 0.2, 1),
        }),
        -1,
        true,
      );
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [animated, delayMs, progress]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: 0.68 + progress.value * 0.32,
    transform: [{ scaleY: 0.5 + progress.value * 0.5 }],
  }));

  return (
    <Animated.View
      style={[
        styles.markBar,
        { height, marginHorizontal: mobileSplashMetrics.markBarGap / 2 },
        barStyle,
      ]}
    />
  );
}

function MobileSplashDots({ animated, theme }: { animated: boolean; theme: MobileTheme }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((index) => (
        <MobileSplashDot animated={animated} index={index} key={index} theme={theme} />
      ))}
    </View>
  );
}

function MobileSplashDot({
  animated,
  index,
  theme,
}: {
  readonly animated: boolean;
  readonly index: number;
  readonly theme: MobileTheme;
}) {
  const progress = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      progress.value = 1;
      return;
    }

    const timeout = setTimeout(() => {
      progress.value = withRepeat(
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }, index * 160);

    return () => clearTimeout(timeout);
  }, [animated, index, progress]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + progress.value * 0.72,
    transform: [{ translateY: progress.value * -2.5 }],
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: theme.accent.default, marginRight: mobileSplashMetrics.dotGap },
        dotStyle,
      ]}
    />
  );
}

export function MobileSplashScreen({
  environmentLabel,
  environmentTone,
  onAction,
  state = "loading",
  step,
  theme,
  update = null,
  versionLine,
}: MobileSplashScreenProps) {
  const reduceMotion = useReduceMotion();
  const animated = !reduceMotion && state === "loading";
  const breatheStyle = useBreathe(animated);
  const visual = state === "loading" ? null : getMobileSplashStateVisual(theme, state);
  const [tipKey] = useState(() => pickMobileSplashTipKey(Math.random()));
  const copy = activeMobileCopy;

  const pill = useMemo(
    () =>
      environmentTone === "prod"
        ? { background: theme.status.successSoft, text: theme.status.successText }
        : { background: theme.status.warningSoft, text: theme.status.warning },
    [environmentTone, theme],
  );

  const stateCopy = state === "loading" ? null : MOBILE_SPLASH_STATE_COPY[state];
  const size = update ? formatSplashUpdateSize(update.totalBytes) : null;
  const progressLabel = update ? formatSplashUpdateProgress(update) : null;
  const percent =
    update && update.totalBytes
      ? Math.min(100, Math.round((update.downloadedBytes / update.totalBytes) * 100))
      : null;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={[styles.root, { backgroundColor: theme.surface.base }]}
      testID="mobile-splash-screen"
    >
      <MobileSplashAurora
        animated={animated}
        theme={theme}
        wash={visual ? { color: visual.washColor, opacity: visual.washOpacity } : null}
      />

      <View style={styles.stage}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.ring}>
            <Animated.View style={breatheStyle}>
              <MobileSplashMark animated={animated} dimmed={visual !== null} />
            </Animated.View>
          </View>
        </View>
        <Text style={[styles.wordmark, { color: theme.text.primary }]}>Whispr</Text>
        <Text style={[styles.tagline, { color: theme.text.muted }]}>{copy.splashTagline}</Text>
      </View>

      <View style={styles.footer}>
        {stateCopy ? (
          <View style={styles.stateBlock}>
            <View style={styles.stateHead}>
              <View style={[styles.tile, { backgroundColor: visual?.tile }]} />
              <Text style={[styles.stateKicker, { color: visual?.tone }]}>
                {copy[stateCopy.kicker].toLocaleUpperCase("tr-TR")}
              </Text>
            </View>
            <Text style={[styles.stateTitle, { color: theme.text.primary }]}>
              {copy[stateCopy.title]}
            </Text>
            <Text style={[styles.stateDescription, { color: theme.text.muted }]}>
              {"descriptionUnknown" in stateCopy
                ? update?.version && size
                  ? copy[stateCopy.description]
                      .replace("{version}", update.version)
                      .replace("{size}", size)
                  : copy[stateCopy.descriptionUnknown]
                : copy[stateCopy.description]}
            </Text>
            {"action" in stateCopy ? (
              <Pressable
                accessibilityRole="button"
                onPress={onAction}
                style={[styles.action, { backgroundColor: theme.accent.action }]}
                testID="mobile-splash-action"
              >
                <Text style={[styles.actionLabel, { color: theme.text.onPrimary }]}>
                  {copy[stateCopy.action]}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.progressBlock} testID="mobile-splash-progress">
                <View style={[styles.track, { backgroundColor: theme.surface.soft }]}>
                  <View
                    style={[
                      styles.trackFill,
                      { backgroundColor: theme.accent.default, width: `${percent ?? 0}%` },
                    ]}
                  />
                </View>
                {progressLabel ? (
                  <Text style={[styles.trackLabel, { color: theme.text.muted }]}>
                    {progressLabel}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.stepLine} testID="mobile-splash-stepline">
            <MobileSplashDots animated={animated} theme={theme} />
            <Text style={[styles.stepLabel, { color: theme.text.secondary }]}>
              {`${copy[MOBILE_SPLASH_STEP_COPY[step]]}${SPLASH_STEP_LINE_SUFFIX}`}
            </Text>
          </View>
        )}

        <Text style={[styles.tip, { color: theme.text.muted }]}>{copy[tipKey]}</Text>

        <View style={styles.versionRow}>
          <View style={[styles.pill, { backgroundColor: pill.background }]}>
            <Text style={[styles.pillLabel, { color: pill.text }]}>{environmentLabel}</Text>
          </View>
          <Text style={[styles.version, { color: theme.text.muted }]}>{versionLine}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderRadius: mobileSplashMetrics.stateActionRadius,
    height: mobileSplashMetrics.stateActionHeight,
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: mobileSplashMetrics.stateActionPaddingHorizontal,
  },
  actionLabel: { ...mobileSplashTypography.stateAction },
  dot: {
    borderRadius: mobileSplashMetrics.dotSize / 2,
    height: mobileSplashMetrics.dotSize,
    width: mobileSplashMetrics.dotSize,
  },
  dots: { alignItems: "center", flexDirection: "row" },
  footer: {
    alignItems: "center",
    bottom: 0,
    gap: mobileSplashMetrics.footerGap,
    left: 0,
    paddingBottom: mobileSplashMetrics.footerPaddingBottom,
    paddingHorizontal: mobileSplashMetrics.footerPaddingHorizontal,
    position: "absolute",
    right: 0,
  },
  mark: {
    alignItems: "center",
    height: mobileSplashMetrics.markSize,
    justifyContent: "center",
    width: mobileSplashMetrics.markSize,
  },
  markBar: {
    backgroundColor: whisprSplashMark.barColor,
    borderRadius: 999,
    width: mobileSplashMetrics.markBarWidth,
  },
  markGradient: {
    alignItems: "center",
    borderRadius: mobileSplashMetrics.markRadius,
    flexDirection: "row",
    height: mobileSplashMetrics.markSize,
    justifyContent: "center",
    width: mobileSplashMetrics.markSize,
  },
  pill: {
    alignItems: "center",
    borderRadius: mobileSplashMetrics.pillRadius,
    height: mobileSplashMetrics.pillHeight,
    justifyContent: "center",
    paddingHorizontal: mobileSplashMetrics.pillPaddingHorizontal,
  },
  pillLabel: { ...mobileSplashTypography.pill },
  progressBlock: { alignSelf: "stretch", marginTop: 12 },
  ring: {
    alignItems: "center",
    height: mobileSplashMetrics.ringSize,
    justifyContent: "center",
    width: mobileSplashMetrics.ringSize,
  },
  root: { flex: 1 },
  stage: { alignItems: "center", flex: 1, justifyContent: "center" },
  stateBlock: { alignItems: "center", alignSelf: "stretch" },
  stateDescription: { ...mobileSplashTypography.stateDescription, textAlign: "center" },
  stateHead: { alignItems: "center", flexDirection: "row", gap: 8 },
  stateKicker: { ...mobileSplashTypography.stateKicker },
  stateTitle: { ...mobileSplashTypography.stateTitle, marginTop: 12, textAlign: "center" },
  stepLabel: { ...mobileSplashTypography.stepLine },
  stepLine: { alignItems: "center", flexDirection: "row", gap: 9 },
  tagline: { ...mobileSplashTypography.tagline, marginTop: mobileSplashMetrics.taglineMarginTop },
  tile: {
    borderRadius: mobileSplashMetrics.stateTileRadius,
    height: mobileSplashMetrics.stateTileSize,
    width: mobileSplashMetrics.stateTileSize,
  },
  tip: { ...mobileSplashTypography.tip, textAlign: "center" },
  track: {
    borderRadius: mobileSplashMetrics.stateProgressRadius,
    height: mobileSplashMetrics.stateProgressHeight,
    overflow: "hidden",
  },
  trackFill: { height: "100%" },
  trackLabel: { ...mobileSplashTypography.version, marginTop: 7 },
  version: { ...mobileSplashTypography.version },
  versionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: mobileSplashMetrics.versionRowGap,
  },
  wordmark: {
    ...mobileSplashTypography.wordmark,
    marginTop: mobileSplashMetrics.wordmarkMarginTop,
  },
});
