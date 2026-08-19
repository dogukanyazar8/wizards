import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAudioDeviceOptions } from "./audio-device-options";

const labels = {
  communications: "Communications default",
  default: "System default",
  fallback: (index: number) => `Microphone ${index + 1}`,
};

describe("buildAudioDeviceOptions", () => {
  it("collapses equivalent default and communications pseudo-devices by group", () => {
    const result = buildAudioDeviceOptions(
      "audioinput",
      [
        {
          deviceId: "default",
          groupId: "logitech-group",
          kind: "audioinput",
          label: "Default - Microphone (Logitech G733)",
        },
        {
          deviceId: "communications",
          groupId: "logitech-group",
          kind: "audioinput",
          label: "Communications - Microphone (Logitech G733)",
        },
        {
          deviceId: "logitech-id",
          groupId: "logitech-group",
          kind: "audioinput",
          label: "Microphone (Logitech G733)",
        },
      ],
      labels,
    );

    assert.deepEqual(
      result.map(({ deviceId, label }) => ({ deviceId, label })),
      [
        { deviceId: "default", label: "System default" },
        { deviceId: "logitech-id", label: "Microphone (Logitech G733)" },
      ],
    );
  });

  it("collapses equivalent pseudo-devices by normalized target label", () => {
    const result = buildAudioDeviceOptions(
      "audiooutput",
      [
        {
          deviceId: "default",
          groupId: "",
          kind: "audiooutput",
          label: "Default - Speakers (Logitech G733)",
        },
        {
          deviceId: "communications",
          groupId: "",
          kind: "audiooutput",
          label: "Communications - Speakers (Logitech G733)",
        },
      ],
      labels,
    );

    assert.deepEqual(
      result.map((device) => device.deviceId),
      ["default"],
    );
  });

  it("keeps pseudo-devices that resolve to different targets", () => {
    const result = buildAudioDeviceOptions(
      "audioinput",
      [
        {
          deviceId: "default",
          groupId: "logitech-group",
          kind: "audioinput",
          label: "Default - Microphone (Logitech G733)",
        },
        {
          deviceId: "communications",
          groupId: "webcam-group",
          kind: "audioinput",
          label: "Communications - Microphone (Webcam)",
        },
      ],
      labels,
    );

    assert.deepEqual(
      result.map(({ deviceId, label }) => ({ deviceId, label })),
      [
        { deviceId: "default", label: "System default" },
        { deviceId: "communications", label: "Communications default" },
      ],
    );
  });

  it("adds a synthetic default without removing physical devices", () => {
    const result = buildAudioDeviceOptions(
      "audioinput",
      [
        {
          deviceId: "logitech-id",
          groupId: "logitech-group",
          kind: "audioinput",
          label: "",
        },
      ],
      labels,
    );

    assert.deepEqual(
      result.map(({ deviceId, label }) => ({ deviceId, label })),
      [
        { deviceId: "default", label: "System default" },
        { deviceId: "logitech-id", label: "Microphone 1" },
      ],
    );
  });
});
