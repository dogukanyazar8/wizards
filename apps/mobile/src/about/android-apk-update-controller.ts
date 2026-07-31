import type { MobileAndroidArtifact } from "@wizards/types";
import { sha256 } from "js-sha256";

import type {
  MobileUpdateController,
  MobileUpdateErrorKind,
  MobileUpdateProgress,
  MobileUpdateSnapshot,
  MobileUpdateState,
} from "./mobile-update-controller";
import { getMobileNetworkClassSnapshot } from "../network/mobile-network-events";

export const ANDROID_APK_MIME_TYPE = "application/vnd.android.package-archive";
export const ANDROID_APK_INSTALL_FLAGS = 0x10000001;
export const ANDROID_APK_DOWNLOAD_SAFETY_MIN_BYTES = 16 * 1024 * 1024;
export const ANDROID_APK_DOWNLOAD_SAFETY_MAX_BYTES = 64 * 1024 * 1024;
export const ANDROID_APK_HASH_CHUNK_BYTES = 1024 * 1024;

type AndroidDownloadProgress = {
  readonly totalBytesExpectedToWrite: number;
  readonly totalBytesWritten: number;
};

type AndroidDownloadResult = {
  readonly status: number;
  readonly uri: string;
};

type AndroidDownloadTask = {
  downloadAsync(): Promise<AndroidDownloadResult | undefined>;
  pauseAsync(): Promise<unknown>;
  resumeAsync(): Promise<AndroidDownloadResult | undefined>;
};

type AndroidFileInfo =
  | {
      readonly exists: false;
    }
  | {
      readonly exists: true;
      readonly isDirectory: boolean;
      readonly size: number;
      readonly uri: string;
    };

export interface AndroidApkUpdateControllerDependencies {
  readonly cacheDirectory: string | null;
  readonly clearResumeData: (key: string) => Promise<void>;
  readonly confirmCellularDownload: (sizeBytes: number) => Promise<boolean>;
  readonly createDownloadResumable: (
    url: string,
    fileUri: string,
    callback: (progress: AndroidDownloadProgress) => void,
    resumeData?: string,
  ) => AndroidDownloadTask;
  readonly deleteAsync: (uri: string) => Promise<void>;
  readonly getContentUriAsync: (uri: string) => Promise<string>;
  readonly getFreeDiskStorageAsync: () => Promise<number>;
  readonly getInfoAsync: (uri: string) => Promise<AndroidFileInfo>;
  readonly getNetwork: () => MobileUpdateProgress["network"];
  readonly hashFileSha256: (
    uri: string,
    sizeBytes: number,
    onProgress?: (readBytes: number) => void,
  ) => Promise<string>;
  readonly loadResumeData: (key: string) => Promise<string | null>;
  readonly now: () => number;
  readonly readCacheDirectory: () => Promise<string[]>;
  readonly saveResumeData: (key: string, resumeData: string) => Promise<void>;
  readonly startActivityAsync: (
    action: string,
    params: { readonly data: string; readonly flags: number; readonly type: string },
  ) => Promise<{ readonly resultCode: number }>;
}

export interface CreateAndroidApkUpdateControllerInput {
  readonly artifact: MobileAndroidArtifact;
  readonly dependencies?: AndroidApkUpdateControllerDependencies;
  readonly latestVersion: string;
}

type AndroidApkIntegrityNativeModule = {
  sha256(uri: string): Promise<string>;
};

function getAndroidApkIntegrityNativeModule(): AndroidApkIntegrityNativeModule | null {
  try {
    const { NativeModules } = require("react-native") as typeof import("react-native");
    const module = NativeModules.WhisprApkIntegrity as AndroidApkIntegrityNativeModule | undefined;
    return typeof module?.sha256 === "function" ? module : null;
  } catch {
    return null;
  }
}

function base64ToBytes(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleaned = value.replace(/=+$/, "");
  const output = new Uint8Array(Math.floor((cleaned.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let outputIndex = 0;

  for (const character of cleaned) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new Error("Invalid base64 file chunk.");
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outputIndex] = (buffer >> bits) & 0xff;
      outputIndex += 1;
    }
  }

  return output;
}

export async function hashAndroidApkFileSha256(
  uri: string,
  sizeBytes: number,
  onProgress?: (readBytes: number) => void,
  readChunk?: (
    uri: string,
    options: { readonly encoding: "base64"; readonly length: number; readonly position: number },
  ) => Promise<string>,
): Promise<string> {
  const nativeModule = readChunk ? null : getAndroidApkIntegrityNativeModule();
  if (nativeModule) {
    const digest = await nativeModule.sha256(uri);
    onProgress?.(sizeBytes);
    return digest;
  }

  const read =
    readChunk ??
    (async (fileUri, options) => {
      const fileSystem =
        require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
      return fileSystem.readAsStringAsync(fileUri, options);
    });
  const digest = sha256.create();

  for (let position = 0; position < sizeBytes; position += ANDROID_APK_HASH_CHUNK_BYTES) {
    const length = Math.min(ANDROID_APK_HASH_CHUNK_BYTES, sizeBytes - position);
    digest.update(base64ToBytes(await read(uri, { encoding: "base64", length, position })));
    onProgress?.(position + length);
  }

  return digest.hex();
}

function resolveNetwork(): MobileUpdateProgress["network"] {
  const network = getMobileNetworkClassSnapshot();
  return network === "wifi" || network === "cellular" ? network : "unknown";
}

function createNativeDependencies(): AndroidApkUpdateControllerDependencies {
  const fileSystem = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
  const intentLauncher = require("expo-intent-launcher") as typeof import("expo-intent-launcher");
  const { Alert } = require("react-native") as typeof import("react-native");
  const asyncStorage = require("@react-native-async-storage/async-storage")
    .default as typeof import("@react-native-async-storage/async-storage").default;

  return {
    cacheDirectory: fileSystem.cacheDirectory,
    clearResumeData: (key) => asyncStorage.removeItem(key),
    confirmCellularDownload: (sizeBytes) =>
      new Promise((resolve) => {
        const sizeMegabytes = Math.ceil(sizeBytes / (1024 * 1024));
        Alert.alert(
          "Hücresel veri kullanılsın mı?",
          `Bu güncelleme yaklaşık ${sizeMegabytes} MB indirir.`,
          [
            { onPress: () => resolve(false), style: "cancel", text: "İptal" },
            { onPress: () => resolve(true), text: "İndir" },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    createDownloadResumable: (url, fileUri, callback, resumeData) =>
      fileSystem.createDownloadResumable(url, fileUri, {}, callback, resumeData),
    deleteAsync: async (uri) => {
      await fileSystem.deleteAsync(uri, { idempotent: true });
    },
    getContentUriAsync: fileSystem.getContentUriAsync,
    getFreeDiskStorageAsync: fileSystem.getFreeDiskStorageAsync,
    getInfoAsync: async (uri) => {
      const info = await fileSystem.getInfoAsync(uri);
      if (!info.exists) {
        return { exists: false };
      }
      return {
        exists: true,
        isDirectory: info.isDirectory,
        size: info.size,
        uri: info.uri,
      };
    },
    getNetwork: resolveNetwork,
    hashFileSha256: hashAndroidApkFileSha256,
    loadResumeData: (key) => asyncStorage.getItem(key),
    now: Date.now,
    readCacheDirectory: () =>
      fileSystem.cacheDirectory
        ? fileSystem.readDirectoryAsync(fileSystem.cacheDirectory)
        : Promise.resolve([]),
    saveResumeData: (key, resumeData) => asyncStorage.setItem(key, resumeData),
    startActivityAsync: (action, params) => intentLauncher.startActivityAsync(action, params),
  };
}

function safetyMargin(sizeBytes: number): number {
  return Math.min(
    ANDROID_APK_DOWNLOAD_SAFETY_MAX_BYTES,
    Math.max(ANDROID_APK_DOWNLOAD_SAFETY_MIN_BYTES, Math.ceil(sizeBytes * 0.1)),
  );
}

export function createAndroidApkUpdateController({
  artifact,
  dependencies = createNativeDependencies(),
  latestVersion,
}: CreateAndroidApkUpdateControllerInput): MobileUpdateController {
  const listeners = new Set<(snapshot: MobileUpdateSnapshot) => void>();
  const localUri = `${dependencies.cacheDirectory ?? ""}whispr-${artifact.versionCode}.apk`;
  const resumeStorageKey = `whispr.update.apk.resume.${artifact.versionCode}`;
  let snapshot: MobileUpdateSnapshot = {
    checkedAt: null,
    completedSteps: [],
    error: null,
    latestVersion,
    progress: null,
    state: "available",
  };
  let downloadTask: AndroidDownloadTask | null = null;
  let initialDownloadWasPaused = false;
  let verifiedUri: string | null = null;
  let paused = false;
  let lastProgressAt = dependencies.now();
  let lastProgressBytes = 0;
  const speedSamples: number[] = [];
  let downloadNetwork = dependencies.getNetwork();

  const emit = (next: Partial<MobileUpdateSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  };

  const fail = (error: MobileUpdateErrorKind) => {
    emit({ error, progress: null, state: "failed" });
  };

  const deleteRejectedFile = async (uri: string) => {
    verifiedUri = null;
    await dependencies.clearResumeData(resumeStorageKey);
    try {
      await dependencies.deleteAsync(uri);
    } catch {
      // Installation stays blocked even when best-effort cache cleanup fails.
    }
  };

  const verifyDownload = async (uri: string): Promise<void> => {
    emit({
      completedSteps: ["download"],
      error: null,
      progress: {
        downloadedBytes: 0,
        etaSeconds: null,
        network: downloadNetwork,
        percent: 0,
        step: "verify",
        totalBytes: artifact.sizeBytes,
      },
      state: "downloading",
    });
    const info = await dependencies.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size !== artifact.sizeBytes) {
      await deleteRejectedFile(uri);
      fail("verify-failed");
      return;
    }
    const digest = await dependencies.hashFileSha256(uri, info.size, (readBytes) => {
      emit({
        error: null,
        progress: {
          downloadedBytes: readBytes,
          etaSeconds: null,
          network: downloadNetwork,
          percent: Math.min(100, Math.max(0, (readBytes / info.size) * 100)),
          step: "verify",
          totalBytes: info.size,
        },
        state: "downloading",
      });
    });
    if (digest.toLowerCase() !== artifact.sha256) {
      await deleteRejectedFile(uri);
      fail("verify-failed");
      return;
    }

    verifiedUri = uri;
    await dependencies.clearResumeData(resumeStorageKey);
    emit({ completedSteps: ["download", "verify"], error: null, progress: null, state: "ready" });
  };

  const finishDownload = async (result: AndroidDownloadResult | undefined) => {
    if (!result) {
      if (!paused) {
        await dependencies.clearResumeData(resumeStorageKey);
        fail("download-failed");
      }
      return;
    }
    if (result.status < 200 || result.status >= 300) {
      await dependencies.clearResumeData(resumeStorageKey);
      fail("download-failed");
      return;
    }
    await verifyDownload(result.uri || localUri);
  };

  const onProgress = (value: AndroidDownloadProgress) => {
    const now = dependencies.now();
    const totalBytes =
      value.totalBytesExpectedToWrite > 0 ? value.totalBytesExpectedToWrite : artifact.sizeBytes;
    const downloadedBytes = Math.max(0, value.totalBytesWritten);
    const durationSeconds = Math.max(0.001, (now - lastProgressAt) / 1_000);
    const bytesPerSecond = Math.max(0, downloadedBytes - lastProgressBytes) / durationSeconds;
    speedSamples.push(bytesPerSecond);
    if (speedSamples.length > 5) {
      speedSamples.shift();
    }
    const averageBytesPerSecond =
      speedSamples.reduce((total, sample) => total + sample, 0) / speedSamples.length;
    const remaining = Math.max(0, totalBytes - downloadedBytes);
    lastProgressAt = now;
    lastProgressBytes = downloadedBytes;
    emit({
      error: null,
      progress: {
        downloadedBytes,
        etaSeconds: averageBytesPerSecond > 0 ? Math.ceil(remaining / averageBytesPerSecond) : null,
        network: downloadNetwork,
        percent: Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100)),
        step: "download",
        totalBytes,
      },
      state: "downloading",
    });
  };

  return {
    capabilities: {
      canPause: true,
      isEnabled: true,
      reportsPercent: true,
    },
    cancelCheck() {},
    async check(): Promise<MobileUpdateState> {
      emit({
        checkedAt: new Date(dependencies.now()).toISOString(),
        completedSteps: [],
        error: null,
        state: "available",
      });
      return "available";
    },
    async download() {
      if (!dependencies.cacheDirectory) {
        fail("download-failed");
        return;
      }
      downloadNetwork = dependencies.getNetwork();
      if (
        downloadNetwork === "cellular" &&
        !(await dependencies.confirmCellularDownload(artifact.sizeBytes))
      ) {
        return;
      }
      try {
        const currentFileName = `whispr-${artifact.versionCode}.apk`;
        for (const fileName of await dependencies.readCacheDirectory()) {
          if (/^whispr-\d+\.apk$/u.test(fileName) && fileName !== currentFileName) {
            await dependencies.deleteAsync(`${dependencies.cacheDirectory}${fileName}`);
          }
        }
      } catch {
        // Cache cleanup is best effort; it must not block a verified update.
      }
      verifiedUri = null;
      const freeBytes = await dependencies.getFreeDiskStorageAsync();
      if (freeBytes < artifact.sizeBytes + safetyMargin(artifact.sizeBytes)) {
        fail("download-failed");
        return;
      }

      paused = false;
      initialDownloadWasPaused = false;
      lastProgressAt = dependencies.now();
      lastProgressBytes = 0;
      speedSamples.length = 0;
      emit({
        completedSteps: [],
        error: null,
        progress: {
          downloadedBytes: 0,
          etaSeconds: null,
          network: downloadNetwork,
          percent: 0,
          step: "download",
          totalBytes: artifact.sizeBytes,
        },
        state: "downloading",
      });
      const resumeData = await dependencies.loadResumeData(resumeStorageKey);
      downloadTask = dependencies.createDownloadResumable(
        artifact.url,
        localUri,
        onProgress,
        resumeData ?? undefined,
      );
      try {
        const result = resumeData
          ? await downloadTask.resumeAsync()
          : await downloadTask.downloadAsync();
        if (result || !initialDownloadWasPaused) {
          await finishDownload(result);
        }
      } catch {
        await dependencies.clearResumeData(resumeStorageKey);
        fail("download-failed");
      }
    },
    getSnapshot: () => snapshot,
    async install() {
      if (!verifiedUri || snapshot.state !== "ready") {
        fail("install-failed");
        return;
      }

      emit({
        error: null,
        progress: {
          downloadedBytes: artifact.sizeBytes,
          etaSeconds: null,
          network: resolveNetwork(),
          percent: 100,
          step: "install",
          totalBytes: artifact.sizeBytes,
        },
        state: "downloading",
      });
      try {
        const contentUri = await dependencies.getContentUriAsync(verifiedUri);
        await dependencies.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: ANDROID_APK_INSTALL_FLAGS,
          type: ANDROID_APK_MIME_TYPE,
        });
        // Returning from Android's package installer does not prove the APK was
        // installed. Keep the verified package ready for an honest retry.
        emit({ error: null, progress: null, state: "ready" });
      } catch {
        fail("install-failed");
      }
    },
    async pause() {
      if (!downloadTask || snapshot.state !== "downloading") {
        return;
      }
      paused = true;
      initialDownloadWasPaused = true;
      const pauseState = await downloadTask.pauseAsync();
      if (
        pauseState &&
        typeof pauseState === "object" &&
        "resumeData" in pauseState &&
        typeof pauseState.resumeData === "string" &&
        pauseState.resumeData.length > 0
      ) {
        await dependencies.saveResumeData(resumeStorageKey, pauseState.resumeData);
      }
    },
    async resume() {
      if (!downloadTask || !paused) {
        return;
      }
      paused = false;
      try {
        await finishDownload(await downloadTask.resumeAsync());
      } catch {
        await dependencies.clearResumeData(resumeStorageKey);
        fail("download-failed");
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
