import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as screenShare from "./screen-share";
import {
  DEFAULT_SCREEN_SHARE_FRAME_RATE,
  DEFAULT_SCREEN_SHARE_MODE,
  DEFAULT_SCREEN_SHARE_RESOLUTION,
  getScreenShareBitrateKbps,
  getScreenShareResolutionHeight,
  parseScreenShareHealthSnapshot,
  resolveScreenSharePresetId,
  SCREEN_SHARE_BITRATE_LADDER_KBPS,
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_IMPLEMENTATION_NAME_PATTERN,
  SCREEN_SHARE_MAX_BITRATE_KBPS,
  SCREEN_SHARE_MOTION_BITRATE_MULTIPLIER,
  SCREEN_SHARE_RESOLUTIONS,
  SCREEN_SHARE_WATCHER_SAMPLE_MAX,
  ScreenShareFrameRateSchema,
  ScreenShareHealthDirectionSchema,
  ScreenShareHealthSnapshotSchema,
  ScreenShareModeSchema,
  ScreenShareQualityLimitationDurationsSchema,
  ScreenShareQualityLimitationReasonSchema,
  ScreenShareResolutionSchema,
  ScreenShareStreamInfoSchema,
  ScreenShareStreamKindSchema,
  ScreenShareWatchersUpdateSchema,
  splitScreenShareQualityId,
  type ScreenShareFrameRate,
  type ScreenShareHealthSnapshot,
  type ScreenShareResolution,
} from "./screen-share";
import {
  MobileVoiceScreenShareUpdateEventSchema,
  MobileVoiceStateParticipantSchema,
} from "./mobile";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const sendSnapshot: ScreenShareHealthSnapshot = {
  direction: "send",
  sampledAt: 1_760_000_000_000,
  fps: 59.6,
  width: 1920,
  height: 1080,
  bitrateKbps: 5_800,
  qualityLimitationReason: "none",
  qualityLimitationDurationsMs: { none: 58_000, cpu: 2_000, bandwidth: 0, other: 0 },
  encoderImplementation: "libvpx",
  decoderImplementation: null,
  powerEfficientEncoder: false,
  framesDropped: null,
  freezeCount: null,
  totalFreezesDurationMs: null,
  jitterBufferDelayMs: null,
  packetsLost: 3,
  roundTripTimeMs: 41,
};

const receiveSnapshot: ScreenShareHealthSnapshot = {
  direction: "receive",
  sampledAt: 1_760_000_002_000,
  fps: 30,
  width: 1920,
  height: 1080,
  bitrateKbps: null,
  qualityLimitationReason: null,
  qualityLimitationDurationsMs: null,
  encoderImplementation: null,
  decoderImplementation: "ExternalDecoder (VideoToolbox)",
  powerEfficientEncoder: null,
  framesDropped: 4,
  freezeCount: 1,
  totalFreezesDurationMs: 180,
  jitterBufferDelayMs: 62.5,
  packetsLost: 0,
  roundTripTimeMs: null,
};

const streamInfo = { kind: "game" as const, gameId: "custom:0a1b2c3d4e5f", label: "Hades" };

const watchersUpdate = {
  channelId: "channel-1",
  sharerUserId: "user-1",
  count: 3,
  sample: ["user-2", "user-3", "user-4"],
};

describe("screen share schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(screenShare, {
      ScreenShareFrameRateSchema: {
        schema: ScreenShareFrameRateSchema,
        valid: 30,
        invalid: 24,
      },
      ScreenShareHealthDirectionSchema: {
        schema: ScreenShareHealthDirectionSchema,
        valid: "receive",
        invalid: "both",
      },
      ScreenShareHealthSnapshotSchema: {
        schema: ScreenShareHealthSnapshotSchema,
        valid: sendSnapshot,
        invalid: { ...sendSnapshot, fps: -1 },
      },
      ScreenShareModeSchema: {
        schema: ScreenShareModeSchema,
        valid: "motion",
        invalid: "balanced",
      },
      ScreenShareQualityLimitationDurationsSchema: {
        schema: ScreenShareQualityLimitationDurationsSchema,
        valid: { none: 0, cpu: 0, bandwidth: 0, other: 0 },
        invalid: { none: 0, cpu: 0, bandwidth: 0 },
      },
      ScreenShareQualityLimitationReasonSchema: {
        schema: ScreenShareQualityLimitationReasonSchema,
        valid: "bandwidth",
        invalid: "gpu",
      },
      ScreenShareResolutionSchema: {
        schema: ScreenShareResolutionSchema,
        valid: "h2160",
        invalid: "h4320",
      },
      ScreenShareStreamInfoSchema: {
        schema: ScreenShareStreamInfoSchema,
        valid: streamInfo,
        invalid: { ...streamInfo, kind: "tab" },
      },
      ScreenShareStreamKindSchema: {
        schema: ScreenShareStreamKindSchema,
        valid: "window",
        invalid: "tab",
      },
      ScreenShareWatchersUpdateSchema: {
        schema: ScreenShareWatchersUpdateSchema,
        valid: watchersUpdate,
        invalid: { ...watchersUpdate, count: -1 },
      },
    });
  });

  it("carries the K4 defaults: 1080p, 60 fps, text mode", () => {
    assert.equal(DEFAULT_SCREEN_SHARE_RESOLUTION, "h1080");
    assert.equal(DEFAULT_SCREEN_SHARE_FRAME_RATE, 60);
    assert.equal(DEFAULT_SCREEN_SHARE_MODE, "text");
    assert.deepEqual([...SCREEN_SHARE_RESOLUTIONS], ["h720", "h1080", "h1440", "h2160"]);
    assert.deepEqual([...SCREEN_SHARE_FRAME_RATES], [15, 30, 60]);
    assert.equal(getScreenShareResolutionHeight("h2160"), 2160);
  });
});

describe("screen share bitrate ladder (K5)", () => {
  const modes = ["text", "motion"] as const;

  it("matches the K5 table for text mode", () => {
    assert.deepEqual(SCREEN_SHARE_BITRATE_LADDER_KBPS.text, {
      h720: { 15: 1_500, 30: 2_500, 60: 3_500 },
      h1080: { 15: 2_500, 30: 4_000, 60: 6_000 },
      h1440: { 15: 4_000, 30: 7_000, 60: 12_000 },
      h2160: { 15: 8_000, 30: 12_000, 60: 20_000 },
    });
  });

  it("never drops when resolution or frame rate rises", () => {
    for (const mode of modes) {
      const ladder = SCREEN_SHARE_BITRATE_LADDER_KBPS[mode];

      for (const [index, resolution] of SCREEN_SHARE_RESOLUTIONS.entries()) {
        const lower = SCREEN_SHARE_RESOLUTIONS[index - 1];

        for (const [fpsIndex, frameRate] of SCREEN_SHARE_FRAME_RATES.entries()) {
          const slowerFrameRate = SCREEN_SHARE_FRAME_RATES[fpsIndex - 1];

          if (slowerFrameRate !== undefined) {
            assert.ok(
              ladder[resolution][frameRate] >= ladder[resolution][slowerFrameRate],
              `${mode} ${resolution}: ${frameRate} fps < ${slowerFrameRate} fps`,
            );
          }

          if (lower !== undefined) {
            assert.ok(
              ladder[resolution][frameRate] >= ladder[lower][frameRate],
              `${mode} ${frameRate} fps: ${resolution} < ${lower}`,
            );
          }
        }
      }
    }
  });

  it("prices motion at text × 1.3 (rounded) in every cell, capped at 24 Mbps", () => {
    for (const resolution of SCREEN_SHARE_RESOLUTIONS) {
      for (const frameRate of SCREEN_SHARE_FRAME_RATES) {
        const text = getScreenShareBitrateKbps("text", resolution, frameRate);
        const motion = getScreenShareBitrateKbps("motion", resolution, frameRate);

        assert.ok(motion >= text, `${resolution}/${frameRate}: motion below text`);
        assert.equal(
          motion,
          Math.min(
            Math.round(text * SCREEN_SHARE_MOTION_BITRATE_MULTIPLIER),
            SCREEN_SHARE_MAX_BITRATE_KBPS,
          ),
          `${resolution}/${frameRate}`,
        );
        assert.ok(motion <= SCREEN_SHARE_MAX_BITRATE_KBPS);
      }
    }
  });

  it("caps 2160p60 motion at exactly 24 000 kbps", () => {
    assert.equal(getScreenShareBitrateKbps("motion", "h2160", 60), 24_000);
    assert.equal(SCREEN_SHARE_MAX_BITRATE_KBPS, 24_000);
  });
});

describe("screen share preset ids", () => {
  it("round-trips every resolution × frame rate pair through resolve and split", () => {
    for (const resolution of SCREEN_SHARE_RESOLUTIONS) {
      for (const frameRate of SCREEN_SHARE_FRAME_RATES) {
        const id = resolveScreenSharePresetId(resolution, frameRate);

        assert.equal(id, `${resolution}fps${frameRate}`);
        assert.deepEqual(splitScreenShareQualityId(id), { resolution, frameRate });
      }
    }
  });

  it("resolves the legacy store value and the web 30 fps aliases to their real axes", () => {
    assert.deepEqual(splitScreenShareQualityId("h1080fps60"), {
      resolution: "h1080",
      frameRate: 60,
    });
    // `h720fps30` was an alias for `h720fps60` on the web; frame rate is its own axis now, so
    // the alias resolves to the 30 fps it always claimed to be.
    assert.deepEqual(splitScreenShareQualityId("h720fps30"), {
      resolution: "h720",
      frameRate: 30,
    });
    assert.deepEqual(splitScreenShareQualityId("h1440fps30"), {
      resolution: "h1440",
      frameRate: 30,
    });
  });

  it("rejects anything outside the preset grammar", () => {
    for (const value of [
      "h1080",
      "1080p60",
      "h1080fps24",
      "h4320fps60",
      "H1080FPS60",
      " h1080fps60",
      "",
      null,
      undefined,
      60,
      { resolution: "h1080", frameRate: 60 },
    ]) {
      assert.equal(splitScreenShareQualityId(value), null, String(value));
    }
  });

  it("keeps the ladder keyed by every preset the split accepts", () => {
    const seen = new Set<string>();

    for (const resolution of Object.keys(SCREEN_SHARE_BITRATE_LADDER_KBPS.text)) {
      for (const frameRate of Object.keys(
        SCREEN_SHARE_BITRATE_LADDER_KBPS.text[resolution as ScreenShareResolution],
      )) {
        const split = splitScreenShareQualityId(`${resolution}fps${frameRate}`);

        assert.ok(split, `${resolution}fps${frameRate}`);
        seen.add(resolveScreenSharePresetId(split.resolution, split.frameRate));
      }
    }

    assert.equal(seen.size, SCREEN_SHARE_RESOLUTIONS.length * SCREEN_SHARE_FRAME_RATES.length);
  });
});

describe("screen share stream info (K8 / K22)", () => {
  it("accepts catalog ids, custom ids, and a null game", () => {
    assertAccepts(ScreenShareStreamInfoSchema, { kind: "game", gameId: "valorant", label: null });
    assertAccepts(ScreenShareStreamInfoSchema, streamInfo);
    assertAccepts(ScreenShareStreamInfoSchema, { kind: "screen", gameId: null, label: null });
    assertAccepts(ScreenShareStreamInfoSchema, { kind: "game", gameId: null, label: null });
  });

  it("bounds the label to 1–64 characters without control characters", () => {
    assertAccepts(ScreenShareStreamInfoSchema, { ...streamInfo, label: "H".repeat(64) });
    assertRejects(ScreenShareStreamInfoSchema, { ...streamInfo, label: "H".repeat(65) }, ["label"]);
    assertRejects(ScreenShareStreamInfoSchema, { ...streamInfo, label: "" }, ["label"]);
    assertRejects(ScreenShareStreamInfoSchema, { ...streamInfo, label: "Hades\u0000" }, ["label"]);
    assertRejects(ScreenShareStreamInfoSchema, { ...streamInfo, label: "Hades\n2" }, ["label"]);
  });

  it("refuses extra fields so an exe name or window title cannot ride along", () => {
    assertRejects(ScreenShareStreamInfoSchema, { ...streamInfo, executable: "hades.exe" });
    assertRejects(ScreenShareStreamInfoSchema, { ...streamInfo, windowTitle: "Hades" });
    assertRejects(ScreenShareStreamInfoSchema, { ...streamInfo, gameId: "" }, ["gameId"]);
  });
});

describe("screen share health snapshot (K16)", () => {
  it("accepts both directions with direction-specific nulls", () => {
    assert.deepEqual(parseScreenShareHealthSnapshot(sendSnapshot), sendSnapshot);
    assert.deepEqual(parseScreenShareHealthSnapshot(receiveSnapshot), receiveSnapshot);
    assert.equal(parseScreenShareHealthSnapshot({ ...sendSnapshot, direction: "up" }), null);
    assert.equal(parseScreenShareHealthSnapshot(null), null);
  });

  it("only lets allowlisted implementation names through — no PII, no free text", () => {
    for (const name of [
      "libvpx",
      "OpenH264",
      "ExternalEncoder",
      "ExternalDecoder (VideoToolbox)",
      "HardwareVideoEncoder/av1",
      "c2.qti.avc.encoder",
      "unknown",
      "",
    ]) {
      assert.match(name, SCREEN_SHARE_IMPLEMENTATION_NAME_PATTERN, name);
      assertAccepts(ScreenShareHealthSnapshotSchema, {
        ...sendSnapshot,
        encoderImplementation: name,
      });
    }

    // A character allowlist, not a semantic filter: it stops paths, addresses, brackets,
    // line breaks, non-ASCII text and anything over 64 characters. Ş0.2 must only ever write
    // the `encoderImplementation` / `decoderImplementation` stat into these fields.
    for (const name of [
      "Whispr — Screen sharing",
      "C:\\Users\\ada\\game.exe",
      "ada@example.com",
      "hades.exe [title]",
      "x".repeat(65),
      "libvpx\n",
      "Ekran paylaşımı",
      "encoder|title",
    ]) {
      assert.doesNotMatch(name, SCREEN_SHARE_IMPLEMENTATION_NAME_PATTERN, name);
      assertRejects(
        ScreenShareHealthSnapshotSchema,
        { ...sendSnapshot, encoderImplementation: name },
        ["encoderImplementation"],
      );
      assertRejects(
        ScreenShareHealthSnapshotSchema,
        { ...receiveSnapshot, decoderImplementation: name },
        ["decoderImplementation"],
      );
    }
  });

  it("keeps every measurement numeric, non-negative, and finite", () => {
    assertRejects(ScreenShareHealthSnapshotSchema, { ...sendSnapshot, fps: "60" }, ["fps"]);
    assertRejects(ScreenShareHealthSnapshotSchema, { ...sendSnapshot, width: 1919.5 }, ["width"]);
    assertRejects(
      ScreenShareHealthSnapshotSchema,
      { ...sendSnapshot, bitrateKbps: Number.POSITIVE_INFINITY },
      ["bitrateKbps"],
    );
    assertRejects(ScreenShareHealthSnapshotSchema, { ...sendSnapshot, packetsLost: -1 }, [
      "packetsLost",
    ]);
    assertRejects(
      ScreenShareHealthSnapshotSchema,
      {
        ...sendSnapshot,
        qualityLimitationDurationsMs: { none: 1, cpu: 1, bandwidth: 1, other: 1, gpu: 1 },
      },
      ["qualityLimitationDurationsMs"],
    );
    assertRejects(
      ScreenShareHealthSnapshotSchema,
      { ...sendSnapshot, qualityLimitationReason: "gpu" },
      ["qualityLimitationReason"],
    );
    assertRejects(ScreenShareHealthSnapshotSchema, { ...sendSnapshot, channelId: "channel-1" });
    assertRejects(ScreenShareHealthSnapshotSchema, { ...sendSnapshot, sourceName: "Hades" });
  });
});

describe("screen share watchers update (K11)", () => {
  it("bounds the sample to five ids and refuses negative counts", () => {
    assertAccepts(ScreenShareWatchersUpdateSchema, { ...watchersUpdate, count: 0, sample: [] });
    assertAccepts(ScreenShareWatchersUpdateSchema, {
      ...watchersUpdate,
      count: 40,
      sample: Array.from({ length: SCREEN_SHARE_WATCHER_SAMPLE_MAX }, (_, i) => `user-${i}`),
    });
    assertRejects(
      ScreenShareWatchersUpdateSchema,
      {
        ...watchersUpdate,
        sample: Array.from({ length: SCREEN_SHARE_WATCHER_SAMPLE_MAX + 1 }, (_, i) => `user-${i}`),
      },
      ["sample"],
    );
    assertRejects(ScreenShareWatchersUpdateSchema, { ...watchersUpdate, count: 1.5 }, ["count"]);
    assertRejects(ScreenShareWatchersUpdateSchema, { ...watchersUpdate, serverId: "server-1" });
  });
});

describe("mobile voice presence carries the optional stream block (K8)", () => {
  const participant = {
    avatarUrl: null,
    displayName: "Ada",
    isScreenSharing: true,
    userId: "user-1",
    username: "ada",
  };
  const update = {
    channelId: "channel-1",
    isScreenSharing: true,
    serverId: "server-1",
    userId: "user-1",
  };

  it("stays optional so pre-K8 payloads still parse", () => {
    assert.equal(assertAccepts(MobileVoiceStateParticipantSchema, participant).stream, undefined);
    assert.equal(assertAccepts(MobileVoiceScreenShareUpdateEventSchema, update).stream, undefined);
  });

  it("validates the block with the shared schema when present", () => {
    assert.deepEqual(
      assertAccepts(MobileVoiceStateParticipantSchema, { ...participant, stream: streamInfo })
        .stream,
      streamInfo,
    );
    assert.deepEqual(
      assertAccepts(MobileVoiceScreenShareUpdateEventSchema, { ...update, stream: streamInfo })
        .stream,
      streamInfo,
    );
    assertRejects(
      MobileVoiceStateParticipantSchema,
      { ...participant, stream: { ...streamInfo, kind: "tab" } },
      ["stream", "kind"],
    );
    assertRejects(
      MobileVoiceScreenShareUpdateEventSchema,
      { ...update, stream: { ...streamInfo, executable: "hades.exe" } },
      ["stream"],
    );
  });
});

// Type-level guard: the frame-rate literal union and the schema stay the same set.
const frameRateCheck: readonly ScreenShareFrameRate[] = SCREEN_SHARE_FRAME_RATES;
void frameRateCheck;
