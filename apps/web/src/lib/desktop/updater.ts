"use client";

import type { Update as TauriUpdate } from "@tauri-apps/plugin-updater";
import { getDesktopAppInfo } from "@/lib/desktop/controls";
import { recordDesktopPerformanceMetric } from "@/lib/desktop/performance";
import {
  getWhisprDesktopReleaseRing,
  isWhisprDesktopRuntime,
  isWhisprDesktopUpdaterEnabled,
} from "@/lib/desktop/runtime";

export type DesktopNativeUpdateStatus =
  | "checking"
  | "downloading"
  | "error"
  | "idle"
  | "installing"
  | "ready"
  | "restarting"
  | "verified"
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
const DESKTOP_UPDATE_FAILURE_LOG_TIMEOUT_MS = 4_000;
export const DISMISSED_DESKTOP_UPDATE_STORAGE_KEY = "whispr.dismissedDesktopUpdateVersion";
const PENDING_DESKTOP_UPDATE_VERIFICATION_STORAGE_KEY = "whispr.pendingDesktopUpdateVerification";

export type DesktopUpdateFailurePhase =
  "check" | "download" | "install" | "relaunch" | "signature_verification" | "verify";

export interface DesktopUpdateFailureLogReport {
  artifactUrl?: string | null;
  currentVersion?: string | null;
  downloadedBytes?: number | null;
  errorMessage?: string | null;
  errorName?: string | null;
  errorStack?: string | null;
  manifestUrl?: string | null;
  phase: DesktopUpdateFailurePhase;
  releaseRing?: string | null;
  status?: string | null;
  targetVersion?: string | null;
  totalBytes?: number | null;
  updaterEnabled?: boolean | null;
}

export interface DesktopUpdateFailureLogResult {
  timestampMs: number;
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function durationSince(startedAt: number) {
  return now() - startedAt;
}

function redactDesktopUpdateFailureText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const redacted = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(
      /\b(authorization|bearer|cookie|password|secret|session|token)\b\s*[:=]?\s*\S*/gi,
      "$1=[redacted]",
    )
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, " ")
    .trim();

  return redacted.length > 0 ? redacted.slice(0, 4_000) : null;
}

export function serializeDesktopUpdateFailureError(error: unknown) {
  if (error instanceof Error) {
    return {
      errorMessage: redactDesktopUpdateFailureText(error.message),
      errorName: redactDesktopUpdateFailureText(error.name),
      errorStack: redactDesktopUpdateFailureText(error.stack),
    };
  }

  return {
    errorMessage: redactDesktopUpdateFailureText(String(error ?? "Unknown updater failure")),
    errorName: null,
    errorStack: null,
  };
}

function withDesktopUpdateFailureLogTimeout<T>(promise: Promise<T>) {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error("Desktop updater failure log timed out."));
    }, DESKTOP_UPDATE_FAILURE_LOG_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

export async function recordDesktopUpdateFailureLog(
  report: DesktopUpdateFailureLogReport,
): Promise<DesktopUpdateFailureLogResult | null> {
  if (!isWhisprDesktopRuntime()) {
    return null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await withDesktopUpdateFailureLogTimeout(
      invoke<DesktopUpdateFailureLogResult>("record_desktop_update_failure", {
        report: {
          ...report,
          artifactUrl: redactDesktopUpdateFailureText(report.artifactUrl),
          currentVersion: redactDesktopUpdateFailureText(report.currentVersion),
          errorMessage: redactDesktopUpdateFailureText(report.errorMessage),
          errorName: redactDesktopUpdateFailureText(report.errorName),
          errorStack: redactDesktopUpdateFailureText(report.errorStack),
          manifestUrl: redactDesktopUpdateFailureText(report.manifestUrl),
          releaseRing: redactDesktopUpdateFailureText(report.releaseRing),
          status: redactDesktopUpdateFailureText(report.status),
          targetVersion: redactDesktopUpdateFailureText(report.targetVersion),
        },
      }),
    );
  } catch {
    return null;
  }
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
    void recordDesktopUpdateFailureLog({
      ...serializeDesktopUpdateFailureError(
        new Error("Desktop runtime version could not be read after update relaunch."),
      ),
      currentVersion: null,
      phase: "verify",
      releaseRing: pending.releaseRing,
      status: "unavailable",
      targetVersion: pending.expectedVersion,
      updaterEnabled: canUseDesktopNativeUpdater(),
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
  void recordDesktopUpdateFailureLog({
    ...serializeDesktopUpdateFailureError(
      new Error(
        `Desktop update verification mismatch. Expected ${pending.expectedVersion}, got ${currentVersion}.`,
      ),
    ),
    currentVersion,
    phase: "verify",
    releaseRing: pending.releaseRing,
    status: "mismatched",
    targetVersion: pending.expectedVersion,
    updaterEnabled: canUseDesktopNativeUpdater(),
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
    void recordDesktopUpdateFailureLog({
      ...serializeDesktopUpdateFailureError(error),
      phase: isSignatureFailure(error) ? "signature_verification" : "check",
      releaseRing: getWhisprDesktopReleaseRing(),
      status: "failed",
      updaterEnabled: canUseDesktopNativeUpdater(),
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
  const downloadStartedAt = now();

  try {
    const installStartedAt = now();

    await update.downloadAndInstall(
      (event) => {
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
      },
      {
        timeout: DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS,
      },
    );

    recordDesktopPerformanceMetric({
      durationMs: durationSince(installStartedAt),
      operation: "desktop_update_install",
      result: "success",
    });
    rememberPendingDesktopUpdateVerification(toUpdateInfo(update));
  } catch (error) {
    const failurePhase: DesktopUpdateFailurePhase = isSignatureFailure(error)
      ? "signature_verification"
      : downloadFinished
        ? "install"
        : "download";

    recordDesktopPerformanceMetric({
      durationMs: durationSince(downloadStartedAt),
      operation:
        failurePhase === "signature_verification"
          ? "desktop_update_signature_verification"
          : downloadFinished
            ? "desktop_update_install"
            : "desktop_update_download",
      result: isSignatureFailure(error) ? "signature_failure" : "failure",
    });
    void recordDesktopUpdateFailureLog({
      ...serializeDesktopUpdateFailureError(error),
      currentVersion: update.currentVersion,
      downloadedBytes,
      phase: failurePhase,
      releaseRing: getWhisprDesktopReleaseRing(),
      status: "failed",
      targetVersion: update.version,
      totalBytes,
      updaterEnabled: canUseDesktopNativeUpdater(),
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
    void recordDesktopUpdateFailureLog({
      ...serializeDesktopUpdateFailureError(error),
      currentVersion: update.currentVersion,
      phase: "relaunch",
      releaseRing: getWhisprDesktopReleaseRing(),
      status: "failed",
      targetVersion: update.version,
      updaterEnabled: canUseDesktopNativeUpdater(),
    });
    throw error;
  }
}

export function getDesktopNativeUpdateInfo(update: NativeUpdate): DesktopNativeUpdateInfo {
  return toUpdateInfo(update);
}
