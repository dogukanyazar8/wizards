"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAppStartupDurationMs,
  getAppStartupRuntime,
  recordAppStartupReadyMetric,
  type AppStartupResult,
} from "@/lib/app-startup/performance";
import { getInitialShellSplashPhase, markShellStartupSplashSeen } from "@/lib/app-startup/session";
import {
  getShellReadinessStatus,
  getShellSplashPhaseAfterMaxTimeout,
  isShellReady,
  SHELL_SPLASH_FADE_OUT_MS,
  SHELL_SPLASH_MAX_VISIBLE_MS,
  SHELL_SPLASH_MIN_VISIBLE_MS,
  shouldMountShellSplash,
  shouldShowShellSplash,
  type AppStartupStatus,
  type ShellReadinessInput,
  type ShellReadinessPhase,
} from "@/lib/app-startup/readiness";

export type ShellReadinessState = {
  isReady: boolean;
  shouldMountSplash: boolean;
  shouldShowSplash: boolean;
  status: AppStartupStatus;
};

function getNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function recordStartupMetricOnce(
  readyMetricRecordedRef: { current: boolean },
  shouldRecordStartupMetricRef: { current: boolean },
  startupStartedAtMs: number,
  result: AppStartupResult,
) {
  if (readyMetricRecordedRef.current || !shouldRecordStartupMetricRef.current) {
    return;
  }

  readyMetricRecordedRef.current = true;
  recordAppStartupReadyMetric({
    durationMs: getAppStartupDurationMs(startupStartedAtMs, getNow()),
    result,
    runtime: getAppStartupRuntime(),
  });
}

export function useShellReadiness(input: ShellReadinessInput): ShellReadinessState {
  const isReady = isShellReady(input);
  const isReadyRef = useRef(isReady);
  const [initialPhase] = useState<ShellReadinessPhase>(getInitialShellSplashPhase);
  const [phase, setPhase] = useState<ShellReadinessPhase>(initialPhase);
  const [startupStartedAtMs] = useState(getNow);
  const readyMetricRecordedRef = useRef(false);
  const shouldRecordStartupMetricRef = useRef(initialPhase !== "dismissed");
  const shownAtRef = useRef<number>(startupStartedAtMs);

  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

  useEffect(() => {
    if (initialPhase !== "dismissed") {
      markShellStartupSplashSeen();
    }
  }, [initialPhase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!isReadyRef.current) {
        recordStartupMetricOnce(
          readyMetricRecordedRef,
          shouldRecordStartupMetricRef,
          startupStartedAtMs,
          "timeout",
        );
      }
      setPhase(getShellSplashPhaseAfterMaxTimeout);
    }, SHELL_SPLASH_MAX_VISIBLE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [startupStartedAtMs]);

  useEffect(() => {
    if (!isReady || phase !== "showing") {
      return undefined;
    }

    const remainingMs = Math.max(0, SHELL_SPLASH_MIN_VISIBLE_MS - (getNow() - shownAtRef.current));

    if (remainingMs === 0) {
      setPhase("hiding");
      return undefined;
    }

    const minimumVisibilityId = window.setTimeout(() => {
      setPhase("hiding");
    }, remainingMs);

    return () => window.clearTimeout(minimumVisibilityId);
  }, [isReady, phase]);

  useEffect(() => {
    if (phase !== "hiding") {
      return undefined;
    }

    const fadeOutId = window.setTimeout(() => {
      setPhase("dismissed");
    }, SHELL_SPLASH_FADE_OUT_MS);

    return () => window.clearTimeout(fadeOutId);
  }, [phase]);

  useEffect(() => {
    if (!isReady || readyMetricRecordedRef.current || !shouldRecordStartupMetricRef.current) {
      return;
    }

    recordStartupMetricOnce(
      readyMetricRecordedRef,
      shouldRecordStartupMetricRef,
      startupStartedAtMs,
      "success",
    );
  }, [isReady, startupStartedAtMs]);

  return useMemo(
    () => ({
      isReady,
      shouldMountSplash: shouldMountShellSplash(phase),
      shouldShowSplash: shouldShowShellSplash(phase),
      status: getShellReadinessStatus({ ...input, isReady }),
    }),
    [input, isReady, phase],
  );
}
