import { closeInAppSettingsOverlay, expectSettingsOverlayOpen } from "../../helpers/navigation";
import {
  CLOCK_STRIP_MODULO,
  REAL_MEDIA_PROJECT_NAME,
  REAL_MEDIA_READY_TIMEOUT,
  capturePatternReferenceGray,
  captureStageGray,
  closeRealMediaPages,
  collectVideoBaseline,
  computeGlassToGlassLatencyMs,
  computeGraySsim,
  expectFramesDecodedToIncrease,
  expectStageVideoPlaying,
  isRealMediaProject,
  joinVoiceChannel,
  launchScreenPatternBrowser,
  median,
  openRealMediaPage,
  openScreenPatternTab,
  readScreenPatternSource,
  readStageVideo,
  readVideoRtpStats,
  sampleClockStripFromStage,
  sleep,
  startScreenShare,
  stopScreenShare,
  switchScreenShareSourceViaSettings,
  waitForVideoRtpStats,
  type ClockStripSample,
  type RealMediaPage,
} from "../../fixtures/screen-share";
import { expect, test } from "../../fixtures/test";
import { clearE2EVoiceStates, getE2EServerRoute } from "../../helpers/db";
import { e2eUsers } from "../../helpers/test-data";

/**
 * Ekran paylaşımı Ş0.3 — gerçek `getDisplayMedia` + gerçek LiveKit, iki tarayıcı bağlamı.
 *
 * Yalnız `chromium-real-media` projesinde koşar (T13): sahte sağlayıcı takılı bir derlemede
 * LiveKit'e hiç gidilmez ve bu spec'in iddiaları anlamsızdır. Sayısal eşikler ilk turda
 * **soft**tur (ek + günlük); Ş9 sertleştirir. Beklenen preset varsayılan `h1080fps60` (1080).
 */
const EXPECTED_SHARE_HEIGHT = 1080;
const SOFT_LATENCY_BUDGET_MS = 300;
const SOFT_SSIM_FLOOR = 0.9;

function summarizeStats(label: string, stats: Awaited<ReturnType<typeof readVideoRtpStats>>) {
  if (!stats) {
    return `${label}: no stats`;
  }
  return [
    `${label}:`,
    `${stats.frameWidth ?? "?"}x${stats.frameHeight ?? "?"}`,
    `fps=${stats.framesPerSecond ?? "?"}`,
    `limit=${stats.qualityLimitationReason ?? "n/a"}`,
    `encoder=${stats.encoderImplementation ?? "n/a"}`,
    `decoder=${stats.decoderImplementation ?? "n/a"}`,
    `powerEfficient=${stats.powerEfficientEncoder ?? stats.powerEfficientDecoder ?? "n/a"}`,
    `svc=${stats.scalabilityMode ?? "n/a"}`,
  ].join(" ");
}

test.describe("screen share real media", () => {
  test.describe.configure({ timeout: process.env.CI === "true" ? 240_000 : 150_000 });
  test.skip(
    ({ browserName }) => browserName !== "chromium" || !isRealMediaProject(test.info()),
    `runs only in the ${REAL_MEDIA_PROJECT_NAME} project (live provider build)`,
  );

  test.beforeEach(async () => {
    await clearE2EVoiceStates();
  });

  test("viewer decodes the sharer's screen and the sender keeps the preset height", async ({
    browser,
  }, testInfo) => {
    const route = await getE2EServerRoute();
    const sharer = await openRealMediaPage(browser, "alice", testInfo);
    const viewer = await openRealMediaPage(browser, "bob", testInfo);

    try {
      await joinVoiceChannel(sharer.page, route);
      await joinVoiceChannel(viewer.page, route);

      const summaries: { phase: string; status: number }[] = [];
      sharer.page.on("response", (response) => {
        if (!response.url().endsWith("/api/v1/telemetry/client-health")) return;
        const body = response.request().postDataJSON() as {
          events?: { surface?: string; context?: { phase?: string } }[];
        } | null;
        const event = body?.events?.find((entry) => entry.surface === "screen_share.send.fps");
        if (event?.context?.phase)
          summaries.push({ phase: event.context.phase, status: response.status() });
      });
      await startScreenShare(sharer.page);

      const stage = await expectStageVideoPlaying(viewer.page);
      expect(stage.videoWidth).toBeGreaterThan(0);

      const decoded = await expectFramesDecodedToIncrease(viewer.page, { timeout: 3_000 });
      expect(decoded.after).toBeGreaterThan(decoded.before);

      // Çözünürlük sözleşmesi: `maintain-resolution` + preset yüksekliği (1080) korunur.
      const send = await waitForVideoRtpStats(
        sharer.page,
        "send",
        (stats) => stats.frameHeight === EXPECTED_SHARE_HEIGHT,
        REAL_MEDIA_READY_TIMEOUT,
      );
      expect(send.frameHeight).toBe(EXPECTED_SHARE_HEIGHT);

      // Ş0.3 baseline: CI yazılım encoder'ında ölçülen fps / bitrate / limit sebebi rapora yazılır.
      const [sendBaseline, receiveBaseline] = await Promise.all([
        collectVideoBaseline(sharer.page, "send", { intervalMs: 1_000, samples: 61 }),
        collectVideoBaseline(viewer.page, "receive", { intervalMs: 1_000, samples: 61 }),
      ]);
      const baseline = {
        project: testInfo.project.name,
        receive: receiveBaseline,
        send: sendBaseline,
        stage,
        summaries,
      };

      console.info(
        [
          "[real-media baseline]",
          summarizeStats("send", sendBaseline?.last ?? null),
          `avgFps=${sendBaseline?.averageFps ?? "?"}`,
          `avgKbps=${sendBaseline?.averageKbps ?? "?"}`,
          `limitDurations=${JSON.stringify(sendBaseline?.last.qualityLimitationDurations ?? null)}`,
          "|",
          summarizeStats("receive", receiveBaseline?.last ?? null),
          `avgFps=${receiveBaseline?.averageFps ?? "?"}`,
          `avgKbps=${receiveBaseline?.averageKbps ?? "?"}`,
          `freezes=${receiveBaseline?.last.freezeCount ?? "?"}`,
        ].join(" "),
      );
      testInfo.annotations.push({
        description: `send ${sendBaseline?.averageFps ?? "?"} fps / ${sendBaseline?.averageKbps ?? "?"} kbps, limit=${sendBaseline?.last.qualityLimitationReason ?? "?"}, encoder=${sendBaseline?.last.encoderImplementation ?? "?"}`,
        type: "real-media-baseline",
      });
      await expect
        .poll(() =>
          summaries.some((summary) => summary.phase === "interval" && summary.status === 200),
        )
        .toBe(true);
      expect(summaries.some((summary) => summary.phase === "start" && summary.status === 200)).toBe(
        true,
      );
      await stopScreenShare(sharer.page);
      await expect
        .poll(() => summaries.some((summary) => summary.phase === "end" && summary.status === 200))
        .toBe(true);
      await testInfo.attach("screen-share-real-media-baseline.json", {
        body: JSON.stringify(baseline, null, 2),
        contentType: "application/json",
      });
    } finally {
      await closeRealMediaPages([sharer, viewer]);
    }
  });

  test("stopping the share ends the viewer's track within two seconds", async ({
    browser,
  }, testInfo) => {
    const route = await getE2EServerRoute();
    const sharer = await openRealMediaPage(browser, "alice", testInfo);
    const viewer = await openRealMediaPage(browser, "bob", testInfo);

    try {
      await joinVoiceChannel(sharer.page, route);
      await joinVoiceChannel(viewer.page, route);
      await startScreenShare(sharer.page);
      await expectStageVideoPlaying(viewer.page);
      await expectFramesDecodedToIncrease(viewer.page, { timeout: 3_000 });

      await stopScreenShare(sharer.page);

      await expect
        .poll(async () => (await readStageVideo(viewer.page)).trackState, {
          intervals: [100, 200, 250],
          timeout: 2_000,
        })
        .not.toBe("live");
      await expect(viewer.page.getByTestId("server-voice-share-stage")).toBeHidden({
        timeout: 10_000,
      });
    } finally {
      await closeRealMediaPages([sharer, viewer]);
    }
  });

  test("switching the source keeps the viewer's stream flowing", async ({ browser }, testInfo) => {
    const route = await getE2EServerRoute();
    const sharer = await openRealMediaPage(browser, "alice", testInfo);
    const viewer = await openRealMediaPage(browser, "bob", testInfo);

    try {
      await joinVoiceChannel(sharer.page, route);
      await joinVoiceChannel(viewer.page, route);
      await startScreenShare(sharer.page);
      await expectStageVideoPlaying(viewer.page);
      await expectFramesDecodedToIncrease(viewer.page, { timeout: 3_000 });

      // Kaynak değişimi yeni bir yakalama ve yeni bir yayındır; izleyen yeni track'i alır ve
      // kare saymaya devam eder. Auto-select aynı yüzeyi ("Entire screen") tekrar seçer.
      await switchScreenShareSourceViaSettings(sharer.page);

      await expect(sharer.page.getByTestId("server-voice-control-share")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expectStageVideoPlaying(viewer.page);
      await expectFramesDecodedToIncrease(viewer.page, { timeout: 5_000 });
    } finally {
      await closeRealMediaPages([sharer, viewer]);
    }
  });

  test("live mode and frame rate changes keep the share alive; viewer zoom and count work", async ({
    browser,
  }, testInfo) => {
    const route = await getE2EServerRoute();
    const sharer = await openRealMediaPage(browser, "alice", testInfo);
    const viewer = await openRealMediaPage(browser, "bob", testInfo);
    try {
      await joinVoiceChannel(sharer.page, route);
      await joinVoiceChannel(viewer.page, route);
      await sharer.page.getByTestId("server-voice-control-settings").click();
      await expectSettingsOverlayOpen(sharer.page);
      await sharer.page.locator("#settings-tab-screen-share").click();
      await sharer.page.getByTestId("setting-segment-e9-0").click();
      await expect(sharer.page.getByTestId("setting-segment-e9-0")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await sharer.page.getByTestId("setting-segment-e8-2").click();
      await closeInAppSettingsOverlay(sharer.page);
      await startScreenShare(sharer.page);
      await expectStageVideoPlaying(viewer.page);
      await expect(sharer.page.getByTestId("voice-stage-viewer-count")).toContainText("1", {
        timeout: REAL_MEDIA_READY_TIMEOUT,
      });
      const viewport = viewer.page.getByTestId("voice-stage-viewport");
      await viewport.focus();
      await viewport.press("=");
      await expect(viewer.page.getByTestId("voice-stage-zoom-reset")).toHaveText("125%");
      await viewport.press("0");
      await expect(viewer.page.getByTestId("voice-stage-zoom-reset")).toHaveText("100%");
      await viewport.dblclick();
      await expect
        .poll(() =>
          viewer.page.evaluate(() => document.fullscreenElement?.getAttribute("data-testid")),
        )
        .toBe("server-voice-share-stage");
      await viewport.dblclick();
      await expect
        .poll(() => viewer.page.evaluate(() => document.fullscreenElement === null))
        .toBe(true);
      await viewer.page.getByTestId("voice-stage-fit").click();
      await expect(viewport.locator("video")).toHaveCSS("object-fit", "cover");
      await sharer.page.getByTestId("server-voice-control-settings").click();
      await expectSettingsOverlayOpen(sharer.page);
      await sharer.page.locator("#settings-tab-screen-share").click();
      const [modeTelemetry] = await Promise.all([
        sharer.page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/v1/telemetry/client-health") &&
            response.request().postData()?.includes("screen-share-mode-change") === true,
        ),
        sharer.page.getByTestId("setting-segment-e9-1").click(),
      ]);
      expect(modeTelemetry.status()).toBe(200);
      await sharer.page.getByTestId("setting-segment-e8-0").click();
      await closeInAppSettingsOverlay(sharer.page);
      await expect
        .poll(() =>
          sharer.page.evaluate(() => {
            const registry = (
              window as unknown as { __whisprRtcPeerConnections: Set<RTCPeerConnection> }
            ).__whisprRtcPeerConnections;
            return [...registry]
              .flatMap((connection) => connection.getSenders())
              .some(
                (sender) =>
                  sender.track?.kind === "video" &&
                  sender.track.contentHint === "motion" &&
                  sender.getParameters().degradationPreference === "maintain-framerate" &&
                  sender.getParameters().encodings[0]?.maxFramerate === 15,
              );
          }),
        )
        .toBe(true);
      const stats = await waitForVideoRtpStats(
        sharer.page,
        "send",
        (entry) =>
          entry.framesPerSecond !== null &&
          entry.framesPerSecond > 0 &&
          entry.framesPerSecond <= 16,
      );
      expect(stats.framesPerSecond).toBeLessThanOrEqual(16);
      await expectFramesDecodedToIncrease(viewer.page);
      await stopScreenShare(sharer.page);
    } finally {
      await closeRealMediaPages([sharer, viewer]);
    }
  });

  test("4K capture gate accepts a hardware probe and publishes 2160 pixels", async ({
    browser,
  }, testInfo) => {
    const route = await getE2EServerRoute();
    const sharer = await openRealMediaPage(browser, "alice", testInfo, {
      viewport: { width: 3840, height: 2160 },
    });
    try {
      await sharer.context.route("**/api/v1/feature-flags", (route) =>
        route.fulfill({ json: { screenShare4k: true } }),
      );
      await sharer.context.addInitScript(() => {
        Object.defineProperty(navigator.mediaCapabilities, "encodingInfo", {
          value: async () => ({ supported: true, smooth: true, powerEfficient: true }),
        });
      });
      await sharer.page.reload();
      await joinVoiceChannel(sharer.page, route);
      await sharer.page.getByTestId("server-voice-control-settings").click();
      await expectSettingsOverlayOpen(sharer.page);
      await sharer.page.locator("#settings-tab-screen-share").click();
      const option = sharer.page.getByTestId("setting-segment-e1-3");
      await expect(option).toBeEnabled();
      await option.click();
      await closeInAppSettingsOverlay(sharer.page);
      await startScreenShare(sharer.page);
      const stats = await waitForVideoRtpStats(
        sharer.page,
        "send",
        (entry) => entry.frameHeight === 2160,
      );
      expect(stats.frameHeight).toBe(2160);
      await stopScreenShare(sharer.page);
    } finally {
      await closeRealMediaPages([sharer]);
    }
  });

  test("a third sharer hits the two-share cap", async ({ browser }, testInfo) => {
    const route = await getE2EServerRoute();
    const pages: RealMediaPage[] = [];

    try {
      const alice = await openRealMediaPage(browser, "alice", testInfo);
      pages.push(alice);
      const bob = await openRealMediaPage(browser, "bob", testInfo);
      pages.push(bob);
      const charlie = await openRealMediaPage(browser, "charlie", testInfo);
      pages.push(charlie);

      await joinVoiceChannel(alice.page, route);
      await joinVoiceChannel(bob.page, route);
      await joinVoiceChannel(charlie.page, route);

      await startScreenShare(alice.page);
      await startScreenShare(bob.page);

      // Üçüncü bağlam iki paylaşımı da görmeden tıklarsa cap yerine üçüncü bir yayın açardı.
      for (const username of [e2eUsers.alice.username, e2eUsers.bob.username]) {
        await expect(
          charlie.page.getByTestId(`voice-sidebar-screen-share-${username}`),
        ).toBeVisible({ timeout: REAL_MEDIA_READY_TIMEOUT });
      }
      await expectStageVideoPlaying(charlie.page);

      await charlie.page.getByTestId("server-voice-control-share").click();

      const inlineError = charlie.page.getByTestId("voice-inline-error");
      await expect(inlineError).toBeVisible({ timeout: 10_000 });
      await expect(inlineError).toContainText(
        /Maksimum ekran paylaşımı sınırına ulaşıldı|Maximum screen shares reached/,
      );
      await expect(charlie.page.getByTestId("server-voice-control-share")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    } finally {
      await closeRealMediaPages(pages);
    }
  });
});

test.describe("screen share real media pattern", () => {
  test.describe.configure({ timeout: process.env.CI === "true" ? 240_000 : 150_000 });
  test.skip(
    ({ browserName }) => browserName !== "chromium" || !isRealMediaProject(test.info()),
    `runs only in the ${REAL_MEDIA_PROJECT_NAME} project (live provider build)`,
  );

  test.beforeEach(async () => {
    await clearE2EVoiceStates();
  });

  test("tab pattern round trip measures SSIM and glass-to-glass latency (soft)", async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const route = await getE2EServerRoute();
    // Ayrı tarayıcı: ekran yerine başlığı eşleşen sekme yakalanır (glass-to-glass + SSIM).
    const patternBrowser = await launchScreenPatternBrowser();
    const pages: RealMediaPage[] = [];

    try {
      const sharer = await openRealMediaPage(patternBrowser, "alice", testInfo, {
        silentMicrophone: true,
      });
      pages.push(sharer);
      const viewer = await openRealMediaPage(patternBrowser, "bob", testInfo, {
        silentMicrophone: true,
      });
      pages.push(viewer);
      await joinVoiceChannel(sharer.page, route);
      await joinVoiceChannel(viewer.page, route);
      const pattern = await openScreenPatternTab(sharer.context);
      const source = await readScreenPatternSource(pattern);

      await sharer.page.bringToFront();
      await startScreenShare(sharer.page);
      await expectStageVideoPlaying(viewer.page);
      await expectFramesDecodedToIncrease(viewer.page, { timeout: 3_000 });
      // Kodlayıcının ilk saniyelerdeki düşük katmanı geçmesi için kısa bir ısınma.
      await sleep(2_000);
      await testInfo.attach("screen-share-decoded-pattern.png", {
        body: await viewer.page
          .locator('[data-testid="server-voice-share-stage"] video')
          .screenshot(),
        contentType: "image/png",
      });

      const latencies: number[] = [];
      const samples: ClockStripSample[] = [];
      let previousMs: number | null = null;
      for (let index = 0; index < 6; index += 1) {
        const sample = await sampleClockStripFromStage(viewer.page, source);
        if (sample) {
          console.info("[real-media clock]", JSON.stringify(sample));
          samples.push(sample);
          latencies.push(computeGlassToGlassLatencyMs(sample, source));
          if (previousMs !== null) {
            // Mekanizma doğrulaması: şerit ilerler ve bir örnek arası 10 s'yi geçmez.
            const advance = (sample.ms - previousMs + CLOCK_STRIP_MODULO) % CLOCK_STRIP_MODULO;
            expect(advance).toBeGreaterThan(0);
            expect(advance).toBeLessThan(10_000);
          }
          previousMs = sample.ms;
        }
        await sleep(500);
      }
      expect(samples.length).toBeGreaterThanOrEqual(3);
      const latencyMedianMs = median(latencies);
      expect(latencyMedianMs).not.toBeNull();
      expect(latencyMedianMs ?? Number.POSITIVE_INFINITY).toBeLessThan(10_000);

      const [reference, candidate] = await Promise.all([
        capturePatternReferenceGray(pattern),
        captureStageGray(viewer.page, source),
      ]);
      expect(reference).not.toBeNull();
      expect(candidate).not.toBeNull();
      const ssim = reference && candidate ? computeGraySsim(reference, candidate) : 0;

      const send = await readVideoRtpStats(sharer.page, "send");
      const receive = await readVideoRtpStats(viewer.page, "receive");
      const result = {
        latencyMedianMs,
        latencySamplesMs: latencies,
        receive,
        send,
        softThresholds: { latencyMs: SOFT_LATENCY_BUDGET_MS, ssim: SOFT_SSIM_FLOOR },
        source,
        ssim: Number(ssim.toFixed(4)),
        stripSamples: samples,
        withinBudget: {
          latency: latencyMedianMs !== null && latencyMedianMs < SOFT_LATENCY_BUDGET_MS,
          ssim: ssim >= SOFT_SSIM_FLOOR,
        },
      };
      await testInfo.attach("screen-share-pattern-result.json", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
      console.info(
        `[real-media pattern] latencyMedian=${latencyMedianMs ?? "?"}ms (soft < ${SOFT_LATENCY_BUDGET_MS}) ssim=${ssim.toFixed(4)} (soft >= ${SOFT_SSIM_FLOOR}) ${summarizeStats("send", send)} ${summarizeStats("receive", receive)}`,
      );
      testInfo.annotations.push({
        description: `latency median ${latencyMedianMs ?? "?"} ms, ssim ${ssim.toFixed(4)}`,
        type: "real-media-pattern",
      });
    } finally {
      await closeRealMediaPages(pages);
      await patternBrowser.close();
    }
  });
});
