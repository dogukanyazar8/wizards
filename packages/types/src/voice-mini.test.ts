import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseVoiceMiniSnapshot,
  VoiceMiniConnectionQualitySchema,
  VoiceMiniParticipantSchema,
  VoiceMiniSnapshotPrivacyModeSchema,
  VoiceMiniSnapshotSchema,
  VoiceOverlayAnchorSchema,
  VoiceOverlayPreferencesSchema,
  VoiceOverlaySizeSchema,
} from "./voice-mini";
import * as voiceSchemas from "./voice-mini";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";

const participant = {
  audioLevel: 0.5,
  avatarUrl: "https://cdn.example.com/avatar.png",
  displayName: "Ada",
  isDeafened: false,
  isLocal: true,
  isMuted: false,
  isSpeaking: true,
  userId: "user-1",
};

const preferences = {
  anchor: "bottom-right" as const,
  size: "normal" as const,
  speakingOnly: false,
};

const snapshot = {
  active: true,
  connection: { quality: "good" as const, rttMs: 42 },
  overlay: preferences,
  participants: [participant],
  privacyMode: "standard" as const,
  updatedAt: "2026-07-09T12:00:00.000Z",
};

describe("voice mini schemas", () => {
  it("keeps every exported schema covered by an acceptance and rejection fixture", () => {
    assertSchemaBehaviorCoverage(voiceSchemas, {
      VoiceMiniConnectionQualitySchema: {
        schema: VoiceMiniConnectionQualitySchema,
        valid: "excellent",
        invalid: "offline",
      },
      VoiceMiniParticipantSchema: {
        schema: VoiceMiniParticipantSchema,
        valid: participant,
        invalid: { ...participant, audioLevel: 2 },
      },
      VoiceMiniSnapshotPrivacyModeSchema: {
        schema: VoiceMiniSnapshotPrivacyModeSchema,
        valid: "streamer",
        invalid: "private",
      },
      VoiceMiniSnapshotSchema: {
        schema: VoiceMiniSnapshotSchema,
        valid: snapshot,
        invalid: { ...snapshot, updatedAt: "now" },
      },
      VoiceOverlayAnchorSchema: {
        schema: VoiceOverlayAnchorSchema,
        valid: "top-left",
        invalid: "center",
      },
      VoiceOverlayPreferencesSchema: {
        schema: VoiceOverlayPreferencesSchema,
        valid: preferences,
        invalid: { ...preferences, size: "huge" },
      },
      VoiceOverlaySizeSchema: {
        schema: VoiceOverlaySizeSchema,
        valid: "compact",
        invalid: "huge",
      },
    });
  });

  it("enforces participant audio, URL, name, and identifier boundaries", () => {
    assertAccepts(VoiceMiniParticipantSchema, { ...participant, audioLevel: 0 });
    assertAccepts(VoiceMiniParticipantSchema, { ...participant, audioLevel: 1 });
    assertAccepts(VoiceMiniParticipantSchema, {
      ...participant,
      avatarUrl: null,
      displayName: "d".repeat(80),
      userId: "u".repeat(128),
    });
    assertRejects(VoiceMiniParticipantSchema, { ...participant, audioLevel: -0.01 }, [
      "audioLevel",
    ]);
    assertRejects(VoiceMiniParticipantSchema, { ...participant, audioLevel: 1.01 }, ["audioLevel"]);
    assertRejects(VoiceMiniParticipantSchema, { ...participant, avatarUrl: "not-a-url" }, [
      "avatarUrl",
    ]);
    assertRejects(
      VoiceMiniParticipantSchema,
      { ...participant, avatarUrl: `https://example.com/${"a".repeat(2030)}` },
      ["avatarUrl"],
    );
    assertRejects(VoiceMiniParticipantSchema, { ...participant, displayName: "" }, ["displayName"]);
    assertRejects(VoiceMiniParticipantSchema, { ...participant, displayName: "d".repeat(81) }, [
      "displayName",
    ]);
    assertRejects(VoiceMiniParticipantSchema, { ...participant, userId: "" }, ["userId"]);
    assertRejects(VoiceMiniParticipantSchema, { ...participant, userId: "u".repeat(129) }, [
      "userId",
    ]);
  });

  it("enforces snapshot RTT, participant count, and timestamp boundaries", () => {
    assertAccepts(VoiceMiniSnapshotSchema, {
      ...snapshot,
      connection: { quality: "unknown", rttMs: 0 },
      participants: [],
    });
    assertAccepts(VoiceMiniSnapshotSchema, {
      ...snapshot,
      connection: { quality: "poor", rttMs: 60_000 },
      participants: Array.from({ length: 12 }, (_, index) => ({
        ...participant,
        userId: `user-${index}`,
      })),
    });
    assertRejects(
      VoiceMiniSnapshotSchema,
      { ...snapshot, connection: { quality: "good", rttMs: -1 } },
      ["connection", "rttMs"],
    );
    assertRejects(
      VoiceMiniSnapshotSchema,
      { ...snapshot, connection: { quality: "good", rttMs: 60_001 } },
      ["connection", "rttMs"],
    );
    assertRejects(
      VoiceMiniSnapshotSchema,
      { ...snapshot, participants: Array.from({ length: 13 }, () => participant) },
      ["participants"],
    );
    assertRejects(VoiceMiniSnapshotSchema, { ...snapshot, updatedAt: "today" }, ["updatedAt"]);
  });

  it("returns parsed snapshots and fails closed for invalid input", () => {
    assert.deepEqual(parseVoiceMiniSnapshot(snapshot), snapshot);
    assert.equal(parseVoiceMiniSnapshot({ ...snapshot, active: "yes" }), null);
    assert.equal(parseVoiceMiniSnapshot(null), null);
  });
});
