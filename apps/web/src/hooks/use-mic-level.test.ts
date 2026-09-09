import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countLitMicSegments,
  MIC_LEVEL_SILENCE_DBFS,
  MicLevelSession,
  toMicLevelDbfs,
  type CapturedAudioStream,
} from "@/hooks/use-mic-level";

type FakeTrack = { stop: () => void; stopped: boolean };

function fakeStream(trackCount = 1): CapturedAudioStream & { tracks: FakeTrack[] } {
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

function fakeScheduler() {
  const timers = new Map<number, () => void>();
  let nextId = 1;

  return {
    clearTimer: (handle: unknown) => {
      timers.delete(handle as number);
    },
    fire: () => {
      for (const callback of [...timers.values()]) callback();
    },
    pending: () => timers.size,
    setTimer: (callback: () => void) => {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
  };
}

function makeSession(
  overrides: {
    capture?: () => Promise<CapturedAudioStream>;
    level?: () => number;
  } = {},
) {
  const stream = fakeStream(2);
  const scheduler = fakeScheduler();
  let disposedMonitors = 0;

  const session = new MicLevelSession({
    capture: overrides.capture ?? (() => Promise.resolve(stream)),
    createMonitor: () => ({
      dispose: () => {
        disposedMonitors += 1;
      },
      readLevel: overrides.level ?? (() => 0.5),
    }),
    scheduler,
  });

  return { disposedMonitors: () => disposedMonitors, scheduler, session, stream };
}

describe("MicLevelSession — kaynak sızıntısı yasak", () => {
  it("test bitince her track duruyor", async () => {
    const { scheduler, session, stream } = makeSession();

    await session.start();
    assert.equal(session.getSnapshot().status, "listening");
    assert.ok(stream.tracks.every((track) => !track.stopped));

    session.stop();

    assert.ok(
      stream.tracks.every((track) => track.stopped),
      "track'ler durmadı",
    );
    assert.equal(scheduler.pending(), 0, "zamanlayıcı kaldı");
    assert.equal(session.getSnapshot().status, "idle");
    assert.equal(session.getSnapshot().level, 0);
  });

  it("sökülme (sekme değişimi) mikrofonu kapatıyor", async () => {
    const { disposedMonitors, session, stream } = makeSession();

    await session.start();
    session.dispose();

    assert.ok(
      stream.tracks.every((track) => track.stopped),
      "sökülmede track açık kaldı",
    );
    assert.equal(disposedMonitors(), 1);
  });

  it("başlatma uçarken gelen durdurma geç gelen stream'i de kapatıyor", async () => {
    const stream = fakeStream();
    const deferred: { release: (() => void) | null } = { release: null };
    const scheduler = fakeScheduler();

    const session = new MicLevelSession({
      capture: () =>
        new Promise<CapturedAudioStream>((resolve) => {
          deferred.release = () => resolve(stream);
        }),
      createMonitor: () => ({ dispose: () => {}, readLevel: () => 0 }),
      scheduler,
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
    assert.equal(scheduler.pending(), 0);
  });

  it("izin reddedilirse durum `denied` ve açık kaynak yok", async () => {
    const denied = new DOMException("no", "NotAllowedError");
    const { scheduler, session } = makeSession({ capture: () => Promise.reject(denied) });

    await session.start();

    assert.equal(session.getSnapshot().status, "denied");
    assert.equal(session.getSnapshot().error, "denied");
    assert.equal(scheduler.pending(), 0);
  });

  it("iki kez başlatmak ikinci bir stream açmaz", async () => {
    let captures = 0;
    const stream = fakeStream();
    const { session } = {
      session: new MicLevelSession({
        capture: () => {
          captures += 1;
          return Promise.resolve(stream);
        },
        createMonitor: () => ({ dispose: () => {}, readLevel: () => 0 }),
        scheduler: fakeScheduler(),
      }),
    };

    await session.start();
    await session.start();

    assert.equal(captures, 1);
  });

  it("tick seviyeyi yayınlıyor", async () => {
    const { scheduler, session } = makeSession({ level: () => 0.75 });
    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    await session.start();
    scheduler.fire();

    assert.equal(session.getSnapshot().level, 0.75);
    assert.ok(notifications > 0);
  });
});

describe("Ölçek dönüşümleri", () => {
  it("dBFS tabanı sessizlikte `-60`", () => {
    assert.equal(toMicLevelDbfs(0), MIC_LEVEL_SILENCE_DBFS);
    assert.equal(toMicLevelDbfs(-1), MIC_LEVEL_SILENCE_DBFS);
    assert.equal(toMicLevelDbfs(Number.NaN), MIC_LEVEL_SILENCE_DBFS);
    assert.equal(toMicLevelDbfs(1), 0);
    assert.ok(Math.abs(toMicLevelDbfs(0.5) - -6.0206) < 0.001);
  });

  it("segment sayısı sözlükten gelir, bileşenden değil", () => {
    assert.equal(countLitMicSegments(0, 14), 0);
    assert.equal(countLitMicSegments(1, 14), 14);
    assert.equal(countLitMicSegments(0.5, 14), 7);
    assert.equal(countLitMicSegments(2, 14), 14);
    assert.equal(countLitMicSegments(0.5, 0), 0);
  });
});
