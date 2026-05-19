"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAppStartupDurationMs,
  getAppStartupRuntime,
  recordAppStartupReadyMetric,
} from "@/lib/app-startup/performance";
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

export function useShellReadiness(input: ShellReadinessInput): ShellReadinessState {
  const isReady = isShellReady(input);
  const [phase, setPhase] = useState<ShellReadinessPhase>("showing");
  const startupStartedAtRef = useRef(getNow());
  const readyMetricRecordedRef = useRef(false);
  const shownAtRef = useRef<number>(startupStartedAtRef.current);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPhase(getShellSplashPhaseAfterMaxTimeout);
    }, SHELL_SPLASH_MAX_VISIBLE_MS);

    return () => window.clearTimeout(timeoutId);
  }, []);

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
    if (!isReady || readyMetricRecordedRef.current) {
      return;
    }

    readyMetricRecordedRef.current = true;
    recordAppStartupReadyMetric({
      durationMs: getAppStartupDurationMs(startupStartedAtRef.current, getNow()),
      result: "success",
      runtime: getAppStartupRuntime(),
    });
  }, [isReady]);

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
