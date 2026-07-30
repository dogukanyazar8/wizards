import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileAndroidArtifact } from "@wizards/types";

import {
  ANDROID_APK_INSTALL_FLAGS,
  ANDROID_APK_MIME_TYPE,
  createAndroidApkUpdateController,
  type AndroidApkUpdateControllerDependencies,
} from "../src/about/android-apk-update-controller";

const artifact: MobileAndroidArtifact = {
  sha256: "a".repeat(64),
  sizeBytes: 48_200_000,
  url: "https://updates.whispr.team/mobile/uat/releases/v0.9.0/whispr-8200.apk",
  versionCode: 8_200,
};

function createHarness(overrides: Partial<AndroidApkUpdateControllerDependencies> = {}) {
  let callback:
    | ((progress: { totalBytesExpectedToWrite: number; totalBytesWritten: number }) => void)
    | undefined;
  const calls = {
    confirmCellular: 0,
    delete: [] as string[],
    download: 0,
    intent: [] as Array<{ action: string; params: unknown }>,
    pause: 0,
    resume: 0,
    resumeData: [] as Array<string | undefined>,
    targets: [] as string[],
  };
  const task = {
    downloadAsync: async () => {
      calls.download += 1;
      callback?.({
        totalBytesExpectedToWrite: artifact.sizeBytes,
        totalBytesWritten: artifact.sizeBytes / 2,
      });
      callback?.({
        totalBytesExpectedToWrite: artifact.sizeBytes,
        totalBytesWritten: artifact.sizeBytes,
      });
      return { status: 200, uri: "file:///cache/whispr-8200.apk" };
    },
    pauseAsync: async () => {
      calls.pause += 1;
      return { resumeData: "resume-token" };
    },
    resumeAsync: async () => {
      calls.resume += 1;
      return { status: 206, uri: "file:///cache/whispr-8200.apk" };
    },
  };
  let clock = 1_000;
  const dependencies: AndroidApkUpdateControllerDependencies = {
    cacheDirectory: "file:///cache/",
    confirmCellularDownload: async () => {
      calls.confirmCellular += 1;
      return true;
    },
    clearResumeData: async () => undefined,
    createDownloadResumable: (_url, fileUri, progressCallback, resumeData) => {
      callback = progressCallback;
      calls.resumeData.push(resumeData);
      calls.targets.push(fileUri);
      return task;
    },
    deleteAsync: async (uri) => {
      calls.delete.push(uri);
    },
    getContentUriAsync: async () => "content://whispr/whispr-8200.apk",
    getFreeDiskStorageAsync: async () => artifact.sizeBytes + 64 * 1024 * 1024,
    getInfoAsync: async () => ({
      exists: true,
      isDirectory: false,
      size: artifact.sizeBytes,
      uri: "file:///cache/whispr-8200.apk",
    }),
    getNetwork: () => "wifi",
    hashFileSha256: async () => artifact.sha256,
    loadResumeData: async () => null,
    now: () => {
      clock += 1_000;
      return clock;
    },
    readCacheDirectory: async () => [],
    saveResumeData: async () => undefined,
    startActivityAsync: async (action, params) => {
      calls.intent.push({ action, params });
      return { resultCode: 0 };
    },
    ...overrides,
  };

  return {
    calls,
    controller: createAndroidApkUpdateController({
      artifact,
      dependencies,
      latestVersion: "0.9.0",
    }),
  };
}

describe("Android APK update controller", () => {
  it("reports resumable real-byte progress and verifies before becoming ready", async () => {
    const { calls, controller } = createHarness();
    const progress: Array<{ downloadedBytes: number | null; percent: number | null }> = [];
    controller.subscribe((snapshot) => {
      if (snapshot.progress?.step === "download") {
        progress.push({
          downloadedBytes: snapshot.progress.downloadedBytes,
          percent: snapshot.progress.percent,
        });
      }
    });

    await controller.download();

    assert.deepEqual(controller.capabilities, {
      canPause: true,
      isEnabled: true,
      reportsPercent: true,
    });
    assert.deepEqual(progress.at(-1), {
      downloadedBytes: artifact.sizeBytes,
      percent: 100,
    });
    assert.deepEqual(calls.targets, ["file:///cache/whispr-8200.apk"]);
    assert.equal(controller.getSnapshot().state, "ready");
    assert.equal(controller.getSnapshot().error, null);
  });

  it("requires explicit confirmation before a manual cellular download", async () => {
    const { calls, controller } = createHarness({
      confirmCellularDownload: async () => false,
      getNetwork: () => "cellular",
    });

    await controller.download();

    assert.equal(calls.download, 0);
    assert.equal(controller.getSnapshot().state, "available");
  });

  it("reports real hash progress during verification", async () => {
    const { controller } = createHarness({
      hashFileSha256: async (_uri, sizeBytes, onProgress) => {
        onProgress?.(sizeBytes / 2);
        onProgress?.(sizeBytes);
        return artifact.sha256;
      },
    });
    const verifyPercent: number[] = [];
    controller.subscribe((snapshot) => {
      if (snapshot.progress?.step === "verify" && snapshot.progress.percent !== null) {
        verifyPercent.push(snapshot.progress.percent);
      }
    });

    await controller.download();

    assert.deepEqual(verifyPercent, [0, 50, 100]);
  });

  it("fails before network I/O when free space is insufficient", async () => {
    const { calls, controller } = createHarness({
      getFreeDiskStorageAsync: async () => artifact.sizeBytes,
    });

    await controller.download();

    assert.equal(calls.download, 0);
    assert.equal(controller.getSnapshot().error, "download-failed");
    assert.equal(controller.getSnapshot().state, "failed");
  });

  it("deletes and blocks a size mismatch", async () => {
    const { calls, controller } = createHarness({
      getInfoAsync: async () => ({
        exists: true,
        isDirectory: false,
        size: artifact.sizeBytes - 1,
        uri: "file:///cache/whispr-8200.apk",
      }),
    });

    await controller.download();

    assert.deepEqual(calls.delete, ["file:///cache/whispr-8200.apk"]);
    assert.equal(controller.getSnapshot().error, "verify-failed");
    assert.equal(controller.getSnapshot().state, "failed");
  });

  it("deletes and blocks a SHA-256 mismatch", async () => {
    const { calls, controller } = createHarness({
      hashFileSha256: async () => "b".repeat(64),
    });

    await controller.download();

    assert.deepEqual(calls.delete, ["file:///cache/whispr-8200.apk"]);
    assert.equal(controller.getSnapshot().error, "verify-failed");
  });

  it("pauses and resumes the same resumable task", async () => {
    let finishInitialDownload: ((value: undefined) => void) | undefined;
    let signalDownloadStarted: (() => void) | undefined;
    const downloadStarted = new Promise<void>((resolve) => {
      signalDownloadStarted = resolve;
    });
    const calls = { pause: 0, resume: 0 };
    const { controller } = createHarness({
      createDownloadResumable: () => ({
        downloadAsync: () => {
          signalDownloadStarted?.();
          return new Promise<undefined>((resolve) => {
            finishInitialDownload = resolve;
          });
        },
        pauseAsync: async () => {
          calls.pause += 1;
          finishInitialDownload?.(undefined);
          return { resumeData: "resume-token" };
        },
        resumeAsync: async () => {
          calls.resume += 1;
          return { status: 206, uri: "file:///cache/whispr-8200.apk" };
        },
      }),
    });

    const download = controller.download();
    await downloadStarted;
    await controller.pause?.();
    await controller.resume?.();
    await download;

    assert.equal(calls.pause, 1);
    assert.equal(calls.resume, 1);
  });

  it("restores a persisted resumable download after an app restart", async () => {
    const { calls, controller } = createHarness({
      loadResumeData: async () => "resume-token",
    });

    await controller.download();

    assert.equal(calls.download, 0);
    assert.equal(calls.resume, 1);
    assert.deepEqual(calls.resumeData, ["resume-token"]);
    assert.equal(controller.getSnapshot().state, "ready");
  });

  it("removes older Whispr APKs without touching unrelated cache files", async () => {
    const { calls, controller } = createHarness({
      readCacheDirectory: async () => ["unrelated.tmp", "whispr-8100.apk", "whispr-8200.apk"],
    });

    await controller.download();

    assert.deepEqual(calls.delete, ["file:///cache/whispr-8100.apk"]);
  });

  it("opens the package installer with a content URI and read permission", async () => {
    const { calls, controller } = createHarness();
    await controller.download();

    await controller.install();

    assert.deepEqual(calls.intent, [
      {
        action: "android.intent.action.VIEW",
        params: {
          data: "content://whispr/whispr-8200.apk",
          flags: ANDROID_APK_INSTALL_FLAGS,
          type: ANDROID_APK_MIME_TYPE,
        },
      },
    ]);
    assert.equal(controller.getSnapshot().state, "ready");
    assert.equal(controller.getSnapshot().error, null);
  });

  it("keeps installer denial or cancellation recoverable", async () => {
    const { controller } = createHarness({
      startActivityAsync: async () => ({ resultCode: 0 }),
    });
    await controller.download();

    await controller.install();

    assert.equal(controller.getSnapshot().state, "ready");
    assert.equal(controller.getSnapshot().progress, null);
  });
});
