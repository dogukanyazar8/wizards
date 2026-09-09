import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCameraPreviewConstraints,
  buildCameraPreviewTransform,
  CameraPreviewSession,
  rotateCameraPreview,
  type CapturedVideoStream,
} from "@/hooks/use-camera-preview";
import { DEFAULT_CAMERA_DEVICE_ID } from "@/store/voice-store";

type FakeTrack = { stop: () => void; stopped: boolean };

function fakeStream(trackCount = 1): CapturedVideoStream & { tracks: FakeTrack[] } {
  const tracks: FakeTrack[] = Array.from({ length: trackCount }, () => {
    const track: FakeTrack = {
      stop: () => {
        track.stopped = true;
      },
      stopped: false,
    };

    return track;
  });

  return { getTracks: () => tracks, tracks };
}

describe("CameraPreviewSession — önizleme kapanınca track duruyor", () => {
  it("durdurma her track'i kapatıyor ve stream'i bırakıyor", async () => {
    const stream = fakeStream(2);
    const session = new CameraPreviewSession({ capture: () => Promise.resolve(stream) });

    await session.start();
    assert.equal(session.getSnapshot().status, "ready");
    assert.equal(session.getSnapshot().stream, stream);

    session.stop();

    assert.ok(
      stream.tracks.every((track) => track.stopped),
      "track'ler durmadı",
    );
    assert.equal(session.getSnapshot().stream, null);
    assert.equal(session.getSnapshot().status, "idle");
  });

  it("sökülme kamerayı kapatıyor", async () => {
    const stream = fakeStream();
    const session = new CameraPreviewSession({ capture: () => Promise.resolve(stream) });

    await session.start();
    session.dispose();

    assert.ok(stream.tracks.every((track) => track.stopped));
  });

  it("başlatma uçarken gelen durdurma geç gelen stream'i kapatıyor", async () => {
    const stream = fakeStream();
    const deferred: { release: (() => void) | null } = { release: null };

    const session = new CameraPreviewSession({
      capture: () =>
        new Promise<CapturedVideoStream>((resolve) => {
          deferred.release = () => resolve(stream);
        }),
    });

    const pending = session.start();
    session.stop();
    deferred.release?.();
    await pending;

    assert.ok(
      stream.tracks.every((track) => track.stopped),
      "geç gelen stream sahipsiz kaldı",
    );
    assert.equal(session.getSnapshot().status, "idle");
  });

  it("izin ve cihaz hataları ayrı durumlar", async () => {
    const cases: Array<[string, string]> = [
      ["NotAllowedError", "denied"],
      ["SecurityError", "denied"],
      ["NotReadableError", "device-unavailable"],
      ["OverconstrainedError", "device-unavailable"],
      ["AbortError", "error"],
    ];

    for (const [name, expected] of cases) {
      const session = new CameraPreviewSession({
        capture: () => Promise.reject(new DOMException("nope", name)),
      });

      await session.start();
      assert.equal(session.getSnapshot().status, expected, name);
      assert.equal(session.getSnapshot().stream, null);
    }
  });
});

describe("Önizleme kısıtları ve dönüşümü", () => {
  it("varsayılan cihaz `deviceId` kısıtı taşımaz", () => {
    const constraints = buildCameraPreviewConstraints(DEFAULT_CAMERA_DEVICE_ID);
    const video = constraints.video as MediaTrackConstraints;

    assert.equal(constraints.audio, false);
    assert.equal(video.deviceId, undefined);
  });

  it("seçili cihaz tam eşleşmeyle isteniyor", () => {
    const video = buildCameraPreviewConstraints("cam-2").video as MediaTrackConstraints;

    assert.deepEqual(video.deviceId, { exact: "cam-2" });
  });

  it("aynalama ve döndürme tek dizede birleşiyor", () => {
    assert.equal(
      buildCameraPreviewTransform({ mirrored: true, rotation: 90 }),
      "scaleX(-1) rotate(90deg)",
    );
    assert.equal(
      buildCameraPreviewTransform({ mirrored: false, rotation: 0 }),
      "scaleX(1) rotate(0deg)",
    );
  });

  it("döndürme 0/90/180/270 dolanıyor", () => {
    assert.equal(rotateCameraPreview(0, -90), 270);
    assert.equal(rotateCameraPreview(270, 90), 0);
    assert.equal(rotateCameraPreview(90, 90), 180);
  });
});
