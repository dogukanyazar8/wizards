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

it("quality changes replace preview tracks and apply the selected constraints", async () => {
  const streams = [fakeStream(), fakeStream()];
  const calls: unknown[] = [];
  const session = new CameraPreviewSession({
    capture: async (id, quality) => {
      calls.push({ id, quality });
      return streams[calls.length - 1]!;
    },
  });
  session.reconfigure("unused", { quality: "h720", frameRate: 15 });
  assert.equal(calls.length, 0, "changing an idle preference must not request camera access");
  await session.start("first");
  session.reconfigure("second", { quality: "h720", frameRate: 15 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(streams[0]!.tracks[0]!.stopped, true);
  assert.equal(session.getSnapshot().stream, streams[1]);
  assert.deepEqual(calls[1], { id: "second", quality: { quality: "h720", frameRate: 15 } });
  const constraints = buildCameraPreviewConstraints("second", { quality: "h720", frameRate: 15 });
  assert.deepEqual(constraints.video, {
    deviceId: { exact: "second" },
    facingMode: { ideal: "user" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 15, max: 15 },
  });
  session.dispose();
  assert.equal(streams[1]!.tracks[0]!.stopped, true);
});

it("rapid camera changes dispose late captures and keep the newest stream", async () => {
  const pending: Array<(stream: CapturedVideoStream) => void> = [];
  const session = new CameraPreviewSession({
    capture: () => new Promise((resolve) => pending.push(resolve)),
  });
  const first = session.start("first");
  session.reconfigure("second", { quality: "h720", frameRate: 15 });
  session.reconfigure("third", { quality: "h1080", frameRate: 30 });
  const stale = [fakeStream(), fakeStream()];
  const latest = fakeStream();
  pending[2]!(latest);
  pending[1]!(stale[1]!);
  pending[0]!(stale[0]!);
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.getSnapshot().stream, latest);
  assert.ok(stale.every((stream) => stream.tracks[0]!.stopped));
  session.dispose();
});

it("device disconnection clears the preview and releases its event listeners", async () => {
  const handlers = new Set<() => void>();
  let stopped = 0;
  const track = {
    stop: () => stopped++,
    addEventListener: (_type: "ended", handler: () => void) => {
      handlers.add(handler);
    },
    removeEventListener: (_type: "ended", handler: () => void) => {
      handlers.delete(handler);
    },
  };
  const session = new CameraPreviewSession({ capture: async () => ({ getTracks: () => [track] }) });
  await session.start();
  assert.equal(handlers.size, 1);
  for (const handler of handlers) handler();
  assert.equal(session.getSnapshot().status, "device-unavailable");
  assert.equal(session.getSnapshot().stream, null);
  assert.equal(stopped, 1);
  assert.equal(handlers.size, 0);
  session.dispose();
});
