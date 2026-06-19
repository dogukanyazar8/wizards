"use client";

import type { Update as TauriUpdate } from "@tauri-apps/plugin-updater";
import { recordDesktopPerformanceMetric } from "@/lib/desktop/performance";
import { getWhisprDesktopReleaseRing, isWhisprDesktopUpdaterEnabled } from "@/lib/desktop/runtime";

export type DesktopNativeUpdateStatus =
  | "checking"
  | "downloading"
  | "error"
  | "idle"
  | "installing"
  | "ready"
  | "restarting"
  | "unavailable";

export interface DesktopNativeUpdateInfo {
  body?: string;
  currentVersion: string;
  date?: string;
  releaseRing: string;
  version: string;
}

export interface DesktopNativeUpdateDownloadState {
  downloadedBytes: number;
  totalBytes: number | null;
}

type NativeUpdate = TauriUpdate;

const DESKTOP_UPDATE_CHECK_TIMEOUT_MS = 12_000;
const DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS = 120_000;

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function durationSince(startedAt: number) {
  return now() - startedAt;
}

function isSignatureFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /ed25519|minisign|signature|verify|verification/i.test(message);
}

function toUpdateInfo(update: NativeUpdate): DesktopNativeUpdateInfo {
  const info: DesktopNativeUpdateInfo = {
    currentVersion: update.currentVersion,
    releaseRing: getWhisprDesktopReleaseRing(),
    version: update.version,
  };

  if (update.body) {
    info.body = update.body;
  }

  if (update.date) {
    info.date = update.date;
  }

  return info;
}

async function importUpdaterApi() {
  return import("@tauri-apps/plugin-updater");
}

async function importProcessApi() {
  return import("@tauri-apps/plugin-process");
}

export function canUseDesktopNativeUpdater() {
  return isWhisprDesktopUpdaterEnabled();
}

export async function checkDesktopNativeUpdate() {
  if (!canUseDesktopNativeUpdater()) {
    recordDesktopPerformanceMetric({
      operation: "desktop_update_check",
      result: "skipped",
    });
    return null;
  }

  const startedAt = now();

  try {
    const { check } = await importUpdaterApi();
    const update = await check({
      timeout: DESKTOP_UPDATE_CHECK_TIMEOUT_MS,
    });

    recordDesktopPerformanceMetric({
      durationMs: durationSince(startedAt),
      operation: "desktop_update_check",
      result: "success",
    });

    return update;
  } catch (error) {
    recordDesktopPerformanceMetric({
      durationMs: durationSince(startedAt),
      operation: "desktop_update_check",
      result: isSignatureFailure(error) ? "signature_failure" : "failure",
    });
    throw error;
  }
}

export async function downloadInstallAndRelaunchDesktopUpdate(
  update: NativeUpdate,
  onProgress: (state: DesktopNativeUpdateDownloadState) => void,
) {
  let totalBytes: number | null = null;
  let downloadedBytes = 0;
  const downloadStartedAt = now();

  try {
    await update.download((event) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? null;
        downloadedBytes = 0;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
      }

      onProgress({ downloadedBytes, totalBytes });
    }, {
      timeout: DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS,
    });

    recordDesktopPerformanceMetric({
      durationMs: durationSince(downloadStartedAt),
      operation: "desktop_update_download",
      result: "success",
    });
  } catch (error) {
    recordDesktopPerformanceMetric({
      durationMs: durationSince(downloadStartedAt),
      operation: isSignatureFailure(error)
        ? "desktop_update_signature_verification"
        : "desktop_update_download",
      result: isSignatureFailure(error) ? "signature_failure" : "failure",
    });
    throw error;
  }

  const installStartedAt = now();

  try {
    await update.install();
    recordDesktopPerformanceMetric({
      durationMs: durationSince(installStartedAt),
      operation: "desktop_update_install",
      result: "success",
    });
  } catch (error) {
    recordDesktopPerformanceMetric({
      durationMs: durationSince(installStartedAt),
      operation: "desktop_update_install",
      result: "failure",
    });
    throw error;
  }

  const relaunchStartedAt = now();

  try {
    const { relaunch } = await importProcessApi();
    await relaunch();
    recordDesktopPerformanceMetric({
      durationMs: durationSince(relaunchStartedAt),
      operation: "desktop_update_relaunch",
      result: "success",
    });
  } catch (error) {
    recordDesktopPerformanceMetric({
      durationMs: durationSince(relaunchStartedAt),
      operation: "desktop_update_relaunch",
      result: "failure",
    });
    throw error;
  }
}

export function getDesktopNativeUpdateInfo(update: NativeUpdate): DesktopNativeUpdateInfo {
  return toUpdateInfo(update);
}
