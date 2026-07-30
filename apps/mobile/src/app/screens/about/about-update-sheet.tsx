import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { MobileAppUpdateLatest } from "@wizards/types";

import type { MobileAboutCopy } from "../../../about/mobile-about-model";
import type {
  MobileUpdateController,
  MobileUpdateStep,
} from "../../../about/mobile-update-controller";
import { BottomSheet, type BottomSheetPresentation } from "../../components/kit/bottom-sheet";
import { MOBILE_ABOUT_UPDATE_OVERLAY_ID } from "../../components/kit/overlay-registry";
import { useTheme } from "../../providers/mobile-theme-provider";
import { AboutCheckIcon } from "./about-icons";
import { AboutBrandLogo } from "./about-primitives";
import { useAboutUpdateSheetStyles } from "./about-update-sheet.styles";

type UpdateStepStatus = "active" | "complete" | "danger" | "pending";

const UPDATE_STEPS: readonly MobileUpdateStep[] = ["download", "verify", "install"];

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function AboutUpdateStepCircle({
  status,
  testID,
}: {
  readonly status: UpdateStepStatus;
  readonly testID: string;
}) {
  const theme = useTheme();
  const styles = useAboutUpdateSheetStyles();
  const reduceMotion = useReducedMotion() === true;
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (status !== "active" || reduceMotion) {
      rotation.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation, status]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (status === "complete") {
    return (
      <View style={[styles.stepCircle, styles.stepComplete]} testID={testID}>
        <AboutCheckIcon color={theme.about.successText} size={12} />
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.stepCircle,
        status === "active"
          ? styles.stepActive
          : status === "danger"
            ? styles.stepDanger
            : styles.stepPending,
        status === "active" ? animatedStyle : null,
      ]}
      testID={
        status === "active"
          ? "mobile-about-update-step-active"
          : status === "danger"
            ? "mobile-about-update-verify-danger"
            : testID
      }
    />
  );
}

export function AboutUpdateSheet({
  controller,
  copy,
  formatEta,
  formatPercent,
  formatSize,
  latest,
  onClose,
  onReadyInBackground,
  open,
}: {
  readonly controller: MobileUpdateController;
  readonly copy: MobileAboutCopy;
  readonly formatEta: (seconds: number) => string;
  readonly formatPercent: (percent: number) => string;
  readonly formatSize: (bytes: number) => string;
  readonly latest: MobileAppUpdateLatest;
  readonly onClose: () => void;
  readonly onReadyInBackground: () => void;
  readonly open: boolean;
}) {
  const styles = useAboutUpdateSheetStyles();
  const safeArea = useSafeAreaInsets();
  const reduceMotion = useReducedMotion() === true;
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const progress = snapshot.progress;
  const rollbackToEmbedded = snapshot.rollbackToEmbedded === true;
  const [paused, setPaused] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const bandTranslateX = useSharedValue(0);
  const observedSteps = useRef(new Set<MobileUpdateStep>());
  if (progress) {
    observedSteps.current.add(progress.step);
  }

  const reportsPercent = controller.capabilities.reportsPercent;
  const percent =
    reportsPercent && progress?.percent !== null && progress?.percent !== undefined
      ? clampPercent(progress.percent)
      : null;
  const verifyFailed = snapshot.error === "verify-failed";

  useEffect(() => {
    if (percent !== null || reduceMotion || trackWidth <= 0 || !open) {
      bandTranslateX.value = 0;
      return;
    }

    bandTranslateX.value = -trackWidth * 0.35;
    bandTranslateX.value = withRepeat(
      withSequence(
        withTiming(trackWidth, { duration: 1_200, easing: Easing.linear }),
        withTiming(-trackWidth * 0.35, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(bandTranslateX);
  }, [bandTranslateX, open, percent, reduceMotion, trackWidth]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bandTranslateX.value }],
  }));

  const presentation = useMemo<BottomSheetPresentation>(
    () => ({
      backdropStyle: styles.backdrop,
      contentStyle: styles.content,
      handleAreaStyle: styles.handleArea,
      handleStyle: styles.handle,
      panelStyle: [styles.panel, { paddingBottom: 30 + safeArea.bottom }],
    }),
    [safeArea.bottom, styles],
  );

  const detailedProgress =
    reportsPercent &&
    progress?.downloadedBytes !== null &&
    progress?.downloadedBytes !== undefined &&
    progress.totalBytes !== null &&
    progress.etaSeconds !== null;
  const meta = rollbackToEmbedded
    ? copy.updateRollbackBody
    : detailedProgress
      ? fill(copy.updateProgressMeta, {
          downloaded: formatSize(progress.downloadedBytes),
          eta: formatEta(progress.etaSeconds),
          size: formatSize(progress.totalBytes),
        })
      : latest.sizeBytes === undefined
        ? copy.updateStepDownload
        : fill(copy.updateProgressIndeterminate, { size: formatSize(latest.sizeBytes) });

  const activeStep = progress?.step ?? null;
  const stepStatus = (step: MobileUpdateStep): UpdateStepStatus => {
    if (verifyFailed && step === "verify") {
      return "danger";
    }
    if (activeStep === step) {
      return "active";
    }
    if (step === "download" && (activeStep === "verify" || activeStep === "install")) {
      return "complete";
    }
    if (step === "verify" && observedSteps.current.has("verify") && activeStep === "install") {
      return "complete";
    }
    return "pending";
  };
  const stepLabel = (step: MobileUpdateStep) =>
    step === "download"
      ? copy.updateStepDownload
      : step === "verify"
        ? verifyFailed
          ? copy.updateVerifyFailed
          : copy.updateStepVerify
        : copy.updateStepInstall;
  const networkLabel =
    progress?.network === "wifi"
      ? copy.updateNetworkWifi
      : progress?.network === "cellular"
        ? copy.updateNetworkCellular
        : copy.updateNetworkUnknown;

  const togglePause = async () => {
    const action = paused ? controller.resume : controller.pause;
    if (!action) {
      return;
    }

    try {
      await action.call(controller);
      setPaused((current) => !current);
    } catch {
      // The adapter owns error reporting through its snapshot. Keeping the
      // current label avoids claiming a pause/resume that did not happen.
    }
  };

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== trackWidth) {
      setTrackWidth(width);
    }
  };

  return (
    <BottomSheet
      accessibilityLabel={
        rollbackToEmbedded
          ? copy.updateRollbackTitle
          : fill(copy.updateDownloading, { version: latest.version })
      }
      onClose={onClose}
      open={open}
      overlayId={MOBILE_ABOUT_UPDATE_OVERLAY_ID}
      presentation={presentation}
      sizing="content"
      testID="mobile-about-update-sheet"
    >
      <View style={styles.header}>
        <View style={styles.logoShadow}>
          {/*
           * React Native has neither CSS radial-gradient nor inset shadow.
           * AboutBrandLogo keeps the canonical supported SVG/linear artwork;
           * this wrapper carries the measurable outer drop shadow.
           */}
          <AboutBrandLogo size={46} testID="mobile-about-update-logo" />
        </View>
        <View style={styles.headerText}>
          <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
            {rollbackToEmbedded
              ? copy.updateRollbackTitle
              : fill(copy.updateDownloading, { version: latest.version })}
          </Text>
          <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.meta}>
            {meta}
          </Text>
        </View>
        {percent === null ? null : (
          <Text
            allowFontScaling={false}
            style={styles.percent}
            testID="mobile-about-update-percent"
          >
            {formatPercent(percent)}
          </Text>
        )}
      </View>

      {rollbackToEmbedded ? null : (
        <>
          <View
            onLayout={onTrackLayout}
            style={styles.progressTrack}
            testID="mobile-about-update-progress-track"
          >
            {percent === null ? (
              <Animated.View
                style={[styles.indeterminate, reduceMotion ? null : bandStyle]}
                testID="mobile-about-update-indeterminate"
              />
            ) : (
              <View
                style={[styles.progressFill, { width: `${percent}%` }]}
                testID="mobile-about-update-progress-fill"
              />
            )}
          </View>

          <View style={styles.steps}>
            {UPDATE_STEPS.map((step) => {
              const status = stepStatus(step);
              return (
                <View
                  key={step}
                  style={styles.stepRow}
                  testID={`mobile-about-update-step-row-${step}`}
                >
                  <AboutUpdateStepCircle
                    status={status}
                    testID={`mobile-about-update-step-${status}`}
                  />
                  <Text
                    maxFontSizeMultiplier={2}
                    style={[
                      styles.stepLabel,
                      status === "pending" && styles.stepLabelPending,
                      status === "danger" && styles.stepLabelDanger,
                    ]}
                  >
                    {stepLabel(step)}
                  </Text>
                  {status === "active" && step === "download" ? (
                    <Text maxFontSizeMultiplier={2} style={styles.network}>
                      {networkLabel}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      )}

      {snapshot.state === "ready" ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void controller.install()}
            style={({ pressed }) => [styles.action, styles.retry, pressed && styles.actionPressed]}
            testID="mobile-about-update-install"
          >
            <Text maxFontSizeMultiplier={2} style={[styles.actionText, styles.retryText]}>
              {rollbackToEmbedded ? copy.updateRollbackAction : copy.updateActionNow}
            </Text>
          </Pressable>
        </View>
      ) : verifyFailed ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void controller.download()}
            style={({ pressed }) => [styles.action, styles.retry, pressed && styles.actionPressed]}
            testID="mobile-about-update-retry"
          >
            <Text maxFontSizeMultiplier={2} style={[styles.actionText, styles.retryText]}>
              {copy.updateRetry}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          {controller.capabilities.canPause ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void togglePause()}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              testID="mobile-about-update-pause-resume"
            >
              <Text maxFontSizeMultiplier={2} style={styles.actionText}>
                {paused ? copy.updateResume : copy.updatePause}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onReadyInBackground();
              onClose();
            }}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            testID="mobile-about-update-background"
          >
            <Text maxFontSizeMultiplier={2} style={styles.actionText}>
              {copy.updateBackground}
            </Text>
          </Pressable>
        </View>
      )}

      <Text maxFontSizeMultiplier={2} style={[styles.note, verifyFailed && styles.noteDanger]}>
        {verifyFailed
          ? copy.updateVerifyFailedNote
          : rollbackToEmbedded
            ? copy.updateRollbackNote
            : copy.updateRestartNote}
      </Text>
    </BottomSheet>
  );
}
