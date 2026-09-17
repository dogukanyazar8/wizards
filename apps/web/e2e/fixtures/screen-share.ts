import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  REAL_MEDIA_PROJECT_NAME,
  REAL_MEDIA_WINDOW,
  SCREEN_PATTERN_CHROMIUM_ARGS,
  SCREEN_PATTERN_PAGE_PATH,
  SCREEN_PATTERN_PAGE_TITLE,
} from "../../playwright.config";
import { loginAs } from "../helpers/auth";
import { expectVoiceParticipantCountAtLeast, type getE2EServerRoute } from "../helpers/db";
import { attachE2EPageDiagnostics, type E2EPageDiagnosticsHandle } from "../helpers/diagnostics";
import {
  closeInAppSettingsOverlay,
  expectSettingsOverlayOpen,
  gotoAppRoute,
} from "../helpers/navigation";
import type { E2EUserKey } from "../helpers/test-data";
import { expect } from "./test";

/**
 * Ekran paylaşımı Ş0.3 — gerçek-medya fixture'ı.
 *
 * `chromium-real-media` projesi sahte sağlayıcıyı takmaz: `getDisplayMedia` gerçek (headless
 * Chromium `--auto-select-desktop-capture-source`), LiveKit gerçek (`--dev`). Ürün kodu
 * `window.__whisprVoiceRoom` gibi bir kanca açmaz; `RTCPeerConnection` bağlam başlangıcında
 * (init script) sarmalanır ve her bağlantı bir kayıt defterine düşer — `getStats()` oradan okunur.
 */

export { REAL_MEDIA_PROJECT_NAME, SCREEN_PATTERN_PAGE_PATH, SCREEN_PATTERN_PAGE_TITLE };

export const RTC_PEER_CONNECTION_REGISTRY_KEY = "__whisprRtcPeerConnections";
export const STAGE_VIDEO_SELECTOR = '[data-testid="server-voice-share-stage"] video';

/**
 * Desen sayfası geometrisi (`src/app/e2e/screen-pattern/page.tsx` ile aynı sayılar;
 * `scripts/playwright-real-media-config.test.mjs` ikisini kilitler).
 */
export const CLOCK_STRIP_BITS = 24;
export const CLOCK_STRIP_CELL_PX = 40;
export const CLOCK_STRIP_MODULO = 2 ** CLOCK_STRIP_BITS;
/** Şeridin altındaki boşluk dahil; SSIM bu satırın altını karşılaştırır. */
export const PATTERN_STATIC_REGION_TOP_PX = CLOCK_STRIP_CELL_PX + 8;
export const PATTERN_COMPARE_SIZE = { height: 270, width: 480 } as const;

export const REAL_MEDIA_READY_TIMEOUT = process.env.CI === "true" ? 45_000 : 20_000;

export type RealMediaPage = {
  context: BrowserContext;
  diagnostics: E2EPageDiagnosticsHandle;
  page: Page;
  userKey: E2EUserKey;
};

export type E2EVoiceRoute = Awaited<ReturnType<typeof getE2EServerRoute>>;

export type VideoRtpStats = {
  active: boolean | null;
  bytes: number;
  decoderImplementation: string | null;
  encoderImplementation: string | null;
  frameHeight: number | null;
  frameWidth: number | null;
  frames: number;
  framesDropped: number | null;
  framesPerSecond: number | null;
  freezeCount: number | null;
  jitterBufferDelay: number | null;
  jitterBufferEmittedCount: number | null;
  keyFrames: number | null;
  nackCount: number | null;
  packetsLost: number | null;
  pliCount: number | null;
  powerEfficientDecoder: boolean | null;
  powerEfficientEncoder: boolean | null;
  qualityLimitationDurations: Record<string, number> | null;
  qualityLimitationReason: string | null;
  scalabilityMode: string | null;
  targetBitrate: number | null;
  timestamp: number;
  totalFreezesDuration: number | null;
};

export type VideoBaseline = {
  averageFps: number | null;
  averageKbps: number | null;
  durationMs: number;
  first: VideoRtpStats;
  last: VideoRtpStats;
  sampleCount: number;
};

export type StageVideoSnapshot = {
  currentTime: number;
  readyState: number;
  trackState: "detached" | "ended" | "live" | "missing";
  videoHeight: number;
  videoWidth: number;
};

export type ClockStripSample = {
  bits: string;
  ms: number;
  sampledAtWallMs: number;
  videoHeight: number;
  videoWidth: number;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isRealMediaProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === REAL_MEDIA_PROJECT_NAME;
}

export async function installRtcPeerConnectionTap(context: BrowserContext): Promise<void> {
  await context.addInitScript((registryKey: string) => {
    const scope = window as unknown as Record<string, unknown>;
    const Native = window.RTCPeerConnection;
    if (typeof Native !== "function" || scope[registryKey]) {
      return;
    }

    const registry = new Set<RTCPeerConnection>();
    Object.defineProperty(scope, registryKey, { configurable: false, value: registry });

    function TappedRTCPeerConnection(this: unknown, ...args: unknown[]) {
      const connection = new (Native as unknown as new (...input: unknown[]) => RTCPeerConnection)(
        ...args,
      );
      registry.add(connection);
      connection.addEventListener("connectionstatechange", () => {
        if (connection.connectionState === "closed") {
          registry.delete(connection);
        }
      });
      return connection;
    }

    TappedRTCPeerConnection.prototype = Native.prototype;
    Object.setPrototypeOf(TappedRTCPeerConnection, Native);
    scope.RTCPeerConnection = TappedRTCPeerConnection;
  }, RTC_PEER_CONNECTION_REGISTRY_KEY);
}

/**
 * Desen grubu ekranı değil başlığı eşleşen sekmeyi yakalar; `launchOptions` çalışan (worker)
 * kapsamlı olduğundan bir `describe` içinde `test.use` ile değiştirilemez — grup kendi
 * tarayıcısını açar ve testin sonunda kapatır.
 */
export async function launchScreenPatternBrowser(): Promise<Browser> {
  // Tab selection requires the full browser's headless mode, not headless-shell.
  return chromium.launch({ channel: "chromium", args: [...SCREEN_PATTERN_CHROMIUM_ARGS] });
}

export async function openRealMediaPage(
  browser: Browser,
  userKey: E2EUserKey,
  testInfo: TestInfo,
  options: { silentMicrophone?: boolean; viewport?: { width: number; height: number } } = {},
): Promise<RealMediaPage> {
  // `browser.newContext()` does not inherit the project's `use` block; the capture size
  // (1920×1080 at DPR 1) is the resolution contract, so it is passed explicitly.
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: options.viewport ?? { ...REAL_MEDIA_WINDOW },
    screen: options.viewport ?? { ...REAL_MEDIA_WINDOW },
  });
  await installRtcPeerConnectionTap(context);
  if (options.silentMicrophone) {
    await context.addInitScript(() => {
      // Only microphone capture is synthetic. Never open the operator's microphone.
      // getDisplayMedia remains native so the pattern test measures actual tab pixels.
      const capture = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async (constraints) => {
        const stream = await capture(constraints);
        if (stream.getVideoTracks()[0]?.getSettings().displaySurface !== "browser") {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("Pattern fixture rejected non-tab capture before publication");
        }
        return stream;
      };
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!constraints?.audio || constraints.video)
          throw new Error("Pattern fixture supports audio only");
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const silence = audio.createGain();
        silence.gain.value = 0;
        const destination = audio.createMediaStreamDestination();
        oscillator.connect(silence).connect(destination);
        oscillator.start();
        await audio.resume();
        const track = destination.stream.getAudioTracks()[0]!;
        const stop = track.stop.bind(track);
        let stopped = false;
        track.stop = () => {
          if (stopped) return;
          stopped = true;
          stop();
          oscillator.stop();
          void audio.close();
        };
        return destination.stream;
      };
    });
  }
  const page = await context.newPage();
  const diagnostics = attachE2EPageDiagnostics(page, testInfo, userKey);

  await loginAs(page, userKey);

  return { context, diagnostics, page, userKey };
}

export async function closeRealMediaPages(pages: readonly RealMediaPage[]): Promise<void> {
  await Promise.allSettled(pages.map(({ diagnostics }) => diagnostics.attachIfFailed()));
  // Closing a tab alone leaves LiveKit's reconnect grace period active. Explicit leave
  // releases the publication before the next case reuses the same seeded channel.
  const departures = await Promise.allSettled(
    pages.map(async ({ page }) => {
      if (page.isClosed()) return;
      if (await page.getByTestId("in-app-settings-overlay").isVisible())
        await closeInAppSettingsOverlay(page);
      await page.evaluate(async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
      });
      const leave = page.getByTestId("server-voice-control-leave");
      if (!(await leave.isVisible())) return;
      await leave.click();
      await expect(leave).toBeHidden({ timeout: REAL_MEDIA_READY_TIMEOUT });
    }),
  );
  await Promise.allSettled(pages.map(({ context }) => context.close()));
  for (const { diagnostics } of pages) {
    diagnostics.dispose();
  }
  const failures = departures.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Real-media room cleanup failed",
    );
}

/** `voice.spec.ts:58-79` deseni; gerçek LiveKit bağlantısı için daha geniş süre. */
export async function joinVoiceChannel(page: Page, route: E2EVoiceRoute): Promise<void> {
  await gotoAppRoute(page, `/channels/${route.serverId}/${route.voiceChannelId}`, {
    readyTestId: "voice-channel-view",
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
  await expect(page.getByTestId("voice-channel-view")).toBeVisible({
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
  await expect(page.getByTestId("server-voice-control-leave")).toBeVisible({
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
  await expect(page.getByTestId("server-voice-control-share")).toBeEnabled({
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
  await expect(page.locator('[data-testid="server-voice-tile"]:visible').first()).toBeVisible({
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
  await expectVoiceParticipantCountAtLeast(route.voiceChannelId, 1);
}

export async function startScreenShare(page: Page): Promise<void> {
  const button = page.getByTestId("server-voice-control-share");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true", {
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
  await expect(page.getByTestId("server-voice-share-stage")).toBeVisible({
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
}

export async function stopScreenShare(page: Page): Promise<void> {
  const button = page.getByTestId("server-voice-control-share");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false", {
    timeout: REAL_MEDIA_READY_TIMEOUT,
  });
}

/**
 * Kaynak değiştirme yalnız Ayarlar › Ses ve Video › Ekran paylaşımı satırından (e7, ikinci
 * eylem) tetiklenir; K19 global barı Ş2'de gelince bu yardımcı ona geçer.
 */
export async function switchScreenShareSourceViaSettings(page: Page): Promise<void> {
  await page.getByTestId("server-voice-control-settings").click();
  await expectSettingsOverlayOpen(page);
  await page.locator("#settings-tab-screen-share").click();
  const switchAction = page.getByTestId("setting-actions-e7-1");
  await expect(switchAction).toBeVisible();
  await expect(switchAction).toHaveText(/Change source|Kaynak değiştir/);
  await expect(switchAction).toBeEnabled();
  await switchAction.click();
  await expect(switchAction).toBeEnabled({ timeout: REAL_MEDIA_READY_TIMEOUT });
  await closeInAppSettingsOverlay(page);
}

export async function readVideoRtpStats(
  page: Page,
  direction: "receive" | "send",
): Promise<VideoRtpStats | null> {
  return page.evaluate(
    async ({ direction: statsDirection, registryKey }) => {
      const registry = (window as unknown as Record<string, unknown>)[registryKey];
      if (!(registry instanceof Set)) {
        return null;
      }

      const type = statsDirection === "send" ? "outbound-rtp" : "inbound-rtp";
      const number = (value: unknown) => (typeof value === "number" ? value : null);
      const text = (value: unknown) => (typeof value === "string" ? value : null);
      const flag = (value: unknown) => (typeof value === "boolean" ? value : null);
      const candidates: VideoRtpStats[] = [];

      for (const connection of registry as Set<RTCPeerConnection>) {
        if (connection.connectionState === "closed") {
          continue;
        }

        let report: RTCStatsReport;
        try {
          report = await connection.getStats();
        } catch {
          continue;
        }

        report.forEach((entry: Record<string, unknown>) => {
          const kind = entry.kind ?? entry.mediaType;
          if (entry.type !== type || kind !== "video") {
            return;
          }

          candidates.push({
            active: flag(entry.active),
            bytes: number(statsDirection === "send" ? entry.bytesSent : entry.bytesReceived) ?? 0,
            decoderImplementation: text(entry.decoderImplementation),
            encoderImplementation: text(entry.encoderImplementation),
            frameHeight: number(entry.frameHeight),
            frameWidth: number(entry.frameWidth),
            frames:
              number(statsDirection === "send" ? entry.framesEncoded : entry.framesDecoded) ?? 0,
            framesDropped: number(entry.framesDropped),
            framesPerSecond: number(entry.framesPerSecond),
            freezeCount: number(entry.freezeCount),
            jitterBufferDelay: number(entry.jitterBufferDelay),
            jitterBufferEmittedCount: number(entry.jitterBufferEmittedCount),
            keyFrames: number(
              statsDirection === "send" ? entry.keyFramesEncoded : entry.keyFramesDecoded,
            ),
            nackCount: number(entry.nackCount),
            packetsLost: number(entry.packetsLost),
            pliCount: number(entry.pliCount),
            powerEfficientDecoder: flag(entry.powerEfficientDecoder),
            powerEfficientEncoder: flag(entry.powerEfficientEncoder),
            qualityLimitationDurations:
              entry.qualityLimitationDurations &&
              typeof entry.qualityLimitationDurations === "object"
                ? Object.fromEntries(
                    Object.entries(entry.qualityLimitationDurations as Record<string, unknown>)
                      .filter(([, value]) => typeof value === "number")
                      .map(([key, value]) => [key, value as number]),
                  )
                : null,
            qualityLimitationReason: text(entry.qualityLimitationReason),
            scalabilityMode: text(entry.scalabilityMode),
            targetBitrate: number(entry.targetBitrate),
            timestamp: number(entry.timestamp) ?? Date.now(),
            totalFreezesDuration: number(entry.totalFreezesDuration),
          });
        });
      }

      if (candidates.length === 0) {
        return null;
      }

      // SVC/simulcast can expose several outbound streams: the active one with the largest
      // frame wins, then the one that has moved the most bytes.
      candidates.sort((left, right) => {
        const activeDelta = Number(right.active !== false) - Number(left.active !== false);
        if (activeDelta !== 0) return activeDelta;
        const heightDelta = (right.frameHeight ?? 0) - (left.frameHeight ?? 0);
        if (heightDelta !== 0) return heightDelta;
        return right.bytes - left.bytes;
      });

      return candidates[0] ?? null;
    },
    { direction, registryKey: RTC_PEER_CONNECTION_REGISTRY_KEY },
  );
}

export async function waitForVideoRtpStats(
  page: Page,
  direction: "receive" | "send",
  predicate: (stats: VideoRtpStats) => boolean = () => true,
  timeout = REAL_MEDIA_READY_TIMEOUT,
): Promise<VideoRtpStats> {
  const holder: { latest: VideoRtpStats | null } = { latest: null };
  await expect
    .poll(
      async () => {
        holder.latest = await readVideoRtpStats(page, direction);
        return holder.latest !== null && predicate(holder.latest);
      },
      { intervals: [250, 500, 1_000], timeout },
    )
    .toBe(true);

  if (!holder.latest) {
    throw new Error(`No ${direction} video RTP stats were observed.`);
  }

  return holder.latest;
}

/** Ş0.3 baseline: `intervalMs` aralıkla `samples` örnek; fps ve kbps deltalardan. */
export async function collectVideoBaseline(
  page: Page,
  direction: "receive" | "send",
  { intervalMs = 1_000, samples = 10 }: { intervalMs?: number; samples?: number } = {},
): Promise<VideoBaseline | null> {
  const first = await readVideoRtpStats(page, direction);
  if (!first) {
    return null;
  }

  let last = first;
  let sampleCount = 1;
  for (let index = 1; index < samples; index += 1) {
    await sleep(intervalMs);
    const sample = await readVideoRtpStats(page, direction);
    if (sample) {
      last = sample;
      sampleCount += 1;
    }
  }

  const durationMs = last.timestamp - first.timestamp;
  const seconds = durationMs / 1_000;

  return {
    averageFps: seconds > 0 ? Number(((last.frames - first.frames) / seconds).toFixed(2)) : null,
    averageKbps:
      seconds > 0 ? Number((((last.bytes - first.bytes) * 8) / 1_000 / seconds).toFixed(1)) : null,
    durationMs,
    first,
    last,
    sampleCount,
  };
}

export async function readStageVideo(page: Page): Promise<StageVideoSnapshot> {
  return page.evaluate((selector) => {
    const video = document.querySelector(selector);
    if (!(video instanceof HTMLVideoElement)) {
      return {
        currentTime: 0,
        readyState: 0,
        trackState: "missing" as const,
        videoHeight: 0,
        videoWidth: 0,
      };
    }

    const stream = video.srcObject;
    const tracks = stream instanceof MediaStream ? stream.getVideoTracks() : [];
    const trackState =
      !(stream instanceof MediaStream) || tracks.length === 0
        ? ("detached" as const)
        : tracks.every((track) => track.readyState === "ended")
          ? ("ended" as const)
          : ("live" as const);

    return {
      currentTime: video.currentTime,
      readyState: video.readyState,
      trackState,
      videoHeight: video.videoHeight,
      videoWidth: video.videoWidth,
    };
  }, STAGE_VIDEO_SELECTOR);
}

export async function expectStageVideoPlaying(page: Page): Promise<StageVideoSnapshot> {
  const holder: { latest: StageVideoSnapshot | null } = { latest: null };
  await expect
    .poll(
      async () => {
        holder.latest = await readStageVideo(page);
        return (
          holder.latest.videoWidth > 0 &&
          holder.latest.videoHeight > 0 &&
          holder.latest.trackState === "live"
        );
      },
      { intervals: [250, 500, 1_000], timeout: REAL_MEDIA_READY_TIMEOUT },
    )
    .toBe(true);

  if (!holder.latest) {
    throw new Error("The share stage video never reported a live track.");
  }

  return holder.latest;
}

export async function expectFramesDecodedToIncrease(
  page: Page,
  { timeout = 3_000 }: { timeout?: number } = {},
): Promise<{ after: number; before: number }> {
  const baseline = await waitForVideoRtpStats(page, "receive", (stats) => stats.frames > 0);
  const before = baseline.frames;
  const holder = { after: before };
  await expect
    .poll(
      async () => {
        const stats = await readVideoRtpStats(page, "receive");
        holder.after = stats?.frames ?? holder.after;
        return holder.after;
      },
      { intervals: [200, 250, 500], timeout },
    )
    .toBeGreaterThan(before);

  return { after: holder.after, before };
}

/** Desen sayfasını **paylaşan** bağlamda ikinci sekme olarak açar (sekme yakalama aynı profili ister). */
export async function openScreenPatternTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await gotoAppRoute(page, SCREEN_PATTERN_PAGE_PATH, { readyTestId: "e2e-screen-pattern" });
  await expect(page).toHaveTitle(SCREEN_PATTERN_PAGE_TITLE);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __whisprScreenPatternLastMs?: number })
            .__whisprScreenPatternLastMs ?? null,
      ),
    )
    .not.toBeNull();
  return page;
}

export async function readScreenPatternSource(page: Page): Promise<{
  height: number;
  timeOriginMs: number;
  width: number;
}> {
  return page.evaluate(() => ({
    height: window.innerHeight,
    timeOriginMs: performance.timeOrigin,
    width: window.innerWidth,
  }));
}

/**
 * İzleyen `<video>`'sundan saat şeridini okur: her karenin merkezinde 5×5 piksel ortalanır,
 * gri > 127 → 1. Kaynak ölçüsü (`source`) → video ölçüsü oranıyla koordinat çevrilir.
 */
export async function sampleClockStripFromStage(
  page: Page,
  source: { height: number; width: number },
): Promise<ClockStripSample | null> {
  return page.evaluate(
    ({ bits, cell, selector, sourceHeight, sourceWidth }) => {
      const video = document.querySelector(selector);
      if (!(video instanceof HTMLVideoElement) || video.videoWidth === 0) {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return null;
      }

      context.drawImage(video, 0, 0);
      const sampledAtWallMs = Date.now();
      const scaleX = video.videoWidth / sourceWidth;
      const scaleY = video.videoHeight / sourceHeight;
      let ms = 0;
      let bitString = "";

      for (let index = 0; index < bits; index += 1) {
        const centerX = Math.round((index + 0.5) * cell * scaleX);
        const centerY = Math.round(0.5 * cell * scaleY);
        const patch = context.getImageData(
          Math.max(0, centerX - 2),
          Math.max(0, centerY - 2),
          5,
          5,
        ).data;
        let sum = 0;
        for (let offset = 0; offset < patch.length; offset += 4) {
          sum +=
            0.299 * (patch[offset] ?? 0) +
            0.587 * (patch[offset + 1] ?? 0) +
            0.114 * (patch[offset + 2] ?? 0);
        }
        const bit = sum / (patch.length / 4) > 127 ? 1 : 0;
        bitString += String(bit);
        ms = ms * 2 + bit;
      }

      return {
        bits: bitString,
        ms,
        sampledAtWallMs,
        videoHeight: video.videoHeight,
        videoWidth: video.videoWidth,
      };
    },
    {
      bits: CLOCK_STRIP_BITS,
      cell: CLOCK_STRIP_CELL_PX,
      selector: STAGE_VIDEO_SELECTOR,
      sourceHeight: source.height,
      sourceWidth: source.width,
    },
  );
}

/** Şerit değeri desen sekmesinin `performance.now()` değeridir; duvar saatine `timeOrigin` çevirir. */
export function computeGlassToGlassLatencyMs(
  sample: ClockStripSample,
  source: { timeOriginMs: number },
): number {
  const expectedMs =
    ((Math.floor(sample.sampledAtWallMs - source.timeOriginMs) % CLOCK_STRIP_MODULO) +
      CLOCK_STRIP_MODULO) %
    CLOCK_STRIP_MODULO;
  return (expectedMs - sample.ms + CLOCK_STRIP_MODULO) % CLOCK_STRIP_MODULO;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

type GrayCapture = { data: number[]; height: number; width: number };

/** İzleyen `<video>`'sunun statik bölgesini (şeridin altı) gri tona indirger. */
export async function captureStageGray(
  page: Page,
  source: { height: number; width: number },
): Promise<GrayCapture | null> {
  return page.evaluate(
    ({ height, selector, sourceHeight, sourceWidth, topPx, width }) => {
      const video = document.querySelector(selector);
      if (!(video instanceof HTMLVideoElement) || video.videoWidth === 0) {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return null;
      }

      const scaleY = video.videoHeight / sourceHeight;
      const scaleX = video.videoWidth / sourceWidth;
      const cropTop = Math.round(topPx * scaleY);
      context.drawImage(
        video,
        0,
        cropTop,
        Math.round(sourceWidth * scaleX),
        video.videoHeight - cropTop,
        0,
        0,
        width,
        height,
      );
      const pixels = context.getImageData(0, 0, width, height).data;
      const data: number[] = [];
      for (let offset = 0; offset < pixels.length; offset += 4) {
        data.push(
          Math.round(
            0.299 * (pixels[offset] ?? 0) +
              0.587 * (pixels[offset + 1] ?? 0) +
              0.114 * (pixels[offset + 2] ?? 0),
          ),
        );
      }
      return { data, height, width };
    },
    {
      height: PATTERN_COMPARE_SIZE.height,
      selector: STAGE_VIDEO_SELECTOR,
      sourceHeight: source.height,
      sourceWidth: source.width,
      topPx: PATTERN_STATIC_REGION_TOP_PX,
      width: PATTERN_COMPARE_SIZE.width,
    },
  );
}

/** Desen sekmesinin kendi ekran görüntüsü (referans), aynı bölge ve aynı ölçek. */
export async function capturePatternReferenceGray(page: Page): Promise<GrayCapture | null> {
  const png = await page.screenshot({ type: "png" });
  return page.evaluate(
    async ({ dataUrl, height, topPx, width }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return null;
      }

      const scale = image.naturalHeight / window.innerHeight;
      const cropTop = Math.round(topPx * scale);
      context.drawImage(
        image,
        0,
        cropTop,
        image.naturalWidth,
        image.naturalHeight - cropTop,
        0,
        0,
        width,
        height,
      );
      const pixels = context.getImageData(0, 0, width, height).data;
      const data: number[] = [];
      for (let offset = 0; offset < pixels.length; offset += 4) {
        data.push(
          Math.round(
            0.299 * (pixels[offset] ?? 0) +
              0.587 * (pixels[offset + 1] ?? 0) +
              0.114 * (pixels[offset + 2] ?? 0),
          ),
        );
      }
      return { data, height, width };
    },
    {
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      height: PATTERN_COMPARE_SIZE.height,
      topPx: PATTERN_STATIC_REGION_TOP_PX,
      width: PATTERN_COMPARE_SIZE.width,
    },
  );
}

/**
 * Gri ton SSIM (Wang 2004), 8×8 pencereler, C1=(0.01·255)², C2=(0.03·255)². Bağımlılık yok:
 * `pixelmatch` kilit dosyasına dokunmadan eklenemezdi; kaba karşılaştırma için bu yeter.
 */
export function computeGraySsim(
  reference: GrayCapture,
  candidate: GrayCapture,
  windowSize = 8,
): number {
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error("SSIM inputs must share the same dimensions.");
  }

  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const { height, width } = reference;
  let total = 0;
  let windows = 0;

  for (let y = 0; y + windowSize <= height; y += windowSize) {
    for (let x = 0; x + windowSize <= width; x += windowSize) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;
      const count = windowSize * windowSize;

      for (let dy = 0; dy < windowSize; dy += 1) {
        for (let dx = 0; dx < windowSize; dx += 1) {
          const index = (y + dy) * width + (x + dx);
          const a = reference.data[index] ?? 0;
          const b = candidate.data[index] ?? 0;
          sumA += a;
          sumB += b;
          sumAA += a * a;
          sumBB += b * b;
          sumAB += a * b;
        }
      }

      const meanA = sumA / count;
      const meanB = sumB / count;
      const varianceA = sumAA / count - meanA * meanA;
      const varianceB = sumBB / count - meanB * meanB;
      const covariance = sumAB / count - meanA * meanB;
      const ssim =
        ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
        ((meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2));

      total += ssim;
      windows += 1;
    }
  }

  return windows === 0 ? 0 : total / windows;
}
