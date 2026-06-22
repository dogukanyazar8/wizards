"use client";

import type { Update as TauriUpdate } from "@tauri-apps/plugin-updater";
import {
  getDesktopAppInfo,
  getDesktopQuitOnCloseEnabled,
  setDesktopQuitOnCloseEnabled,
} from "@/lib/desktop/controls";
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

export type DesktopNativeUpdateVerificationStatus = "matched" | "mismatched" | "unavailable";

export interface DesktopNativeUpdateVerificationResult {
  currentVersion: string | null;
  expectedVersion: string;
  releaseRing: string;
  status: DesktopNativeUpdateVerificationStatus;
}

interface PendingDesktopUpdateVerification {
  expectedVersion: string;
  previousVersion: string;
  recordedAtMs: number;
  releaseRing: string;
}

type NativeUpdate = TauriUpdate;

const DESKTOP_UPDATE_CHECK_TIMEOUT_MS = 12_000;
const DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS = 120_000;
export const DISMISSED_DESKTOP_UPDATE_STORAGE_KEY = "whispr.dismissedDesktopUpdateVersion";
const PENDING_DESKTOP_UPDATE_VERIFICATION_STORAGE_KEY =
  "whispr.pendingDesktopUpdateVerification";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function durationSince(startedAt: number) {
  return now() - startedAt;
}

function getDesktopUpdateStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeDesktopVersion(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^v/i, "") ?? "";
  return normalized.length > 0 ? normalized : null;
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

function readPendingDesktopUpdateVerification(): PendingDesktopUpdateVerification | null {
  const storage = getDesktopUpdateStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(PENDING_DESKTOP_UPDATE_VERIFICATION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingDesktopUpdateVerification>;
    const expectedVersion = normalizeDesktopVersion(parsed.expectedVersion);
    const previousVersion = normalizeDesktopVersion(parsed.previousVersion);

    if (!expectedVersion || !previousVersion || typeof parsed.releaseRing !== "string") {
      storage.removeItem(PENDING_DESKTOP_UPDATE_VERIFICATION_STORAGE_KEY);
      return null;
    }

    return {
      expectedVersion,
      previousVersion,
      recordedAtMs:
        typeof parsed.recordedAtMs === "number" && Number.isFinite(parsed.recordedAtMs)
          ? parsed.recordedAtMs
          : Date.now(),
      releaseRing: parsed.releaseRing,
    };
  } catch {
    storage.removeItem(PENDING_DESKTOP_UPDATE_VERIFICATION_STORAGE_KEY);
    return null;
  }
}

function clearPendingDesktopUpdateVerification() {
  getDesktopUpdateStorage()?.removeItem(PENDING_DESKTOP_UPDATE_VERIFICATION_STORAGE_KEY);
}

export function getDismissedDesktopUpdateVersion() {
  return getDesktopUpdateStorage()?.getItem(DISMISSED_DESKTOP_UPDATE_STORAGE_KEY) ?? null;
}

export function dismissDesktopUpdateVersion(version: string) {
  const storage = getDesktopUpdateStorage();
  if (!storage) {
    return;
  }

  storage.setItem(DISMISSED_DESKTOP_UPDATE_STORAGE_KEY, version);
}

export function clearDismissedDesktopUpdateVersion(version?: string) {
  const storage = getDesktopUpdateStorage();
  if (!storage) {
    return;
  }

  if (!version || storage.getItem(DISMISSED_DESKTOP_UPDATE_STORAGE_KEY) === version) {
    storage.removeItem(DISMISSED_DESKTOP_UPDATE_STORAGE_KEY);
  }
}

export function rememberPendingDesktopUpdateVerification(info: DesktopNativeUpdateInfo) {
  const storage = getDesktopUpdateStorage();
  const expectedVersion = normalizeDesktopVersion(info.version);
  const previousVersion = normalizeDesktopVersion(info.currentVersion);

  if (!storage || !expectedVersion || !previousVersion) {
    return;
  }

  const payload: PendingDesktopUpdateVerification = {
    expectedVersion,
    previousVersion,
    recordedAtMs: Date.now(),
    releaseRing: info.releaseRing,
  };

  storage.setItem(PENDING_DESKTOP_UPDATE_VERIFICATION_STORAGE_KEY, JSON.stringify(payload));
}

export async function verifyPendingDesktopUpdateInstallation(): Promise<DesktopNativeUpdateVerificationResult | null> {
  const pending = readPendingDesktopUpdateVerification();

  if (!pending) {
    recordDesktopPerformanceMetric({
      operation: "desktop_update_verify",
      result: "skipped",
    });
    return null;
  }

  const appInfo = await getDesktopAppInfo().catch(() => null);
  const currentVersion = normalizeDesktopVersion(appInfo?.appVersion);

  if (!currentVersion) {
    recordDesktopPerformanceMetric({
      operation: "desktop_update_verify",
      result: "failure",
    });
    return {
      currentVersion: null,
      expectedVersion: pending.expectedVersion,
      releaseRing: pending.releaseRing,
      status: "unavailable",
    };
  }

  if (currentVersion === pending.expectedVersion) {
    clearPendingDesktopUpdateVerification();
    clearDismissedDesktopUpdateVersion(pending.expectedVersion);
    recordDesktopPerformanceMetric({
      operation: "desktop_update_verify",
      result: "success",
    });
    return {
      currentVersion,
      expectedVersion: pending.expectedVersion,
      releaseRing: pending.releaseRing,
      status: "matched",
    };
  }

  recordDesktopPerformanceMetric({
    operation: "desktop_update_verify",
    result: "failure",
  });

  return {
    currentVersion,
    expectedVersion: pending.expectedVersion,
    releaseRing: pending.releaseRing,
    status: "mismatched",
  };
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
  let downloadFinished = false;
  let previousQuitOnClose: boolean | null = null;
  let quitOnCloseOverridden = false;
  const downloadStartedAt = now();

  try {
    try {
      previousQuitOnClose = await getDesktopQuitOnCloseEnabled();
      if (!previousQuitOnClose) {
        await setDesktopQuitOnCloseEnabled(true);
        quitOnCloseOverridden = true;
      }
    } catch {
      previousQuitOnClose = null;
    }

    const installStartedAt = now();

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? null;
        downloadedBytes = 0;
        downloadFinished = false;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
      } else if (event.event === "Finished") {
        downloadFinished = true;
        recordDesktopPerformanceMetric({
          durationMs: durationSince(downloadStartedAt),
          operation: "desktop_update_download",
          result: "success",
        });
      }

      onProgress({ downloadedBytes, totalBytes });
    }, {
      timeout: DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS,
    });

    recordDesktopPerformanceMetric({
      durationMs: durationSince(installStartedAt),
      operation: "desktop_update_install",
      result: "success",
    });
    rememberPendingDesktopUpdateVerification(toUpdateInfo(update));
  } catch (error) {
    recordDesktopPerformanceMetric({
      durationMs: durationSince(downloadStartedAt),
      operation: isSignatureFailure(error)
        ? "desktop_update_signature_verification"
        : downloadFinished
          ? "desktop_update_install"
          : "desktop_update_download",
      result: isSignatureFailure(error) ? "signature_failure" : "failure",
    });

    if (quitOnCloseOverridden && previousQuitOnClose !== null) {
      await setDesktopQuitOnCloseEnabled(previousQuitOnClose).catch(() => undefined);
    }

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
