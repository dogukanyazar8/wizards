import assert from "node:assert/strict";
import { test } from "node:test";
import { Track, LocalTrack, type Room } from "livekit-client";
import { ScreenShareSession } from "./screen-share-session";
import { getScreenShareCaptureOptions, getScreenSharePublishOptions } from "./screen-share";

function track(source: Track.Source) {
  const media = Object.assign(new EventTarget(), { readyState: "live" });
  return Object.setPrototypeOf(
    {
      source,
      mediaStreamTrack: media,
      stop() {
        media.readyState = "ended";
      },
      detach() {},
    },
    LocalTrack.prototype,
  ) as LocalTrack;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const tracks = [track(Track.Source.ScreenShare), track(Track.Source.ScreenShareAudio)];
  const publications: { source: Track.Source; track: LocalTrack }[] = [];
  const localParticipant = {
    createScreenTracks: async () => tracks,
    getTrackPublications: () => publications,
    publishTrack: async (track: LocalTrack) => {
      publications.push({ source: track.source, track });
    },
    unpublishTrack: async (track: LocalTrack) => {
      const index = publications.findIndex((publication) => publication.track === track);
      if (index >= 0) publications.splice(index, 1);
    },
  };
  const options = {
    capture: getScreenShareCaptureOptions("h1080fps60"),
    publish: getScreenSharePublishOptions("h1080fps60"),
    replace: false,
    isCurrent: () => true,
    canPublish: () => true,
    onEnded: () => {},
  };
  return {
    tracks,
    publications,
    localParticipant,
    room: { localParticipant } as unknown as Room,
    options,
    session: new ScreenShareSession(),
  };
}

test("publishes video and audio; stop releases both without touching the call microphone", async () => {
  const f = fixture();
  const mic = track(Track.Source.Microphone);
  f.publications.push({ source: mic.source, track: mic });
  assert.equal(await f.session.start(f.room, f.options), true);
  assert.equal(f.publications.length, 3);
  await f.session.stop(f.room);
  assert.equal(f.publications.length, 1);
  assert.equal(mic.mediaStreamTrack.readyState, "live");
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
  assert.equal(f.session.getSnapshot(), "idle");
});

test("reports a live local capture before waiting for publication", async () => {
  const f = fixture();
  let captured = false;
  f.localParticipant.publishTrack = async () => {
    assert.equal(captured, true);
  };
  await f.session.start(f.room, {
    ...f.options,
    onCaptured: () => {
      captured = true;
    },
  });
  assert.equal(captured, true);
});

test("cancelling a source picker preserves the existing share", async () => {
  const f = fixture();
  const old = track(Track.Source.ScreenShare);
  f.publications.push({ source: old.source, track: old });
  f.localParticipant.createScreenTracks = async () => {
    throw new DOMException("dismissed", "NotAllowedError");
  };
  assert.equal(await f.session.start(f.room, { ...f.options, replace: true }), false);
  assert.equal(old.mediaStreamTrack.readyState, "live");
  assert.equal(f.publications.length, 1);
});

test("source switching keeps the old stream until capture succeeds, then replaces video and audio", async () => {
  const f = fixture();
  const old = [track(Track.Source.ScreenShare), track(Track.Source.ScreenShareAudio)];
  f.publications.push(...old.map((track) => ({ source: track.source, track })));
  const capture = deferred<LocalTrack[]>();
  f.localParticipant.createScreenTracks = () => capture.promise;
  const work = f.session.start(f.room, { ...f.options, replace: true });
  assert.equal(f.session.getSnapshot(), "switching");
  assert.ok(old.every((track) => track.mediaStreamTrack.readyState === "live"));
  capture.resolve(f.tracks);
  assert.equal(await work, true);
  assert.ok(old.every((track) => track.mediaStreamTrack.readyState === "ended"));
  assert.deepEqual(
    f.publications.map((p) => p.track),
    f.tracks,
  );
});

test("stop during a pending picker prevents late publication and rejects duplicate starts", async () => {
  const f = fixture();
  const capture = deferred<LocalTrack[]>();
  f.localParticipant.createScreenTracks = () => capture.promise;
  const work = f.session.start(f.room, f.options);
  assert.equal(await f.session.start(f.room, f.options), false);
  await f.session.stop(f.room);
  capture.resolve(f.tracks);
  assert.equal(await work, false);
  assert.equal(f.publications.length, 0);
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
});

test("leaving the room while selecting a source releases late capture", async () => {
  const f = fixture();
  assert.equal(await f.session.start(f.room, { ...f.options, isCurrent: () => false }), false);
  assert.equal(f.publications.length, 0);
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
});

test("permission or capacity changing during selection never replaces the old share", async () => {
  const f = fixture();
  const old = track(Track.Source.ScreenShare);
  f.publications.push({ source: old.source, track: old });
  await assert.rejects(
    f.session.start(f.room, { ...f.options, replace: true, canPublish: () => false }),
    /SCREEN_SHARE_NOT_ALLOWED/,
  );
  assert.equal(old.mediaStreamTrack.readyState, "live");
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
});

test("publication failure cleans partial video and audio publications", async () => {
  const f = fixture();
  const publish = f.localParticipant.publishTrack;
  f.localParticipant.publishTrack = async (track) => {
    if (track.source === Track.Source.ScreenShareAudio) throw new Error("publish failed");
    await publish(track);
  };
  await assert.rejects(f.session.start(f.room, f.options), /publish failed/);
  assert.equal(f.publications.length, 0);
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
});

test("stop while publication is in flight removes its late result", async () => {
  const f = fixture();
  const started = deferred<void>();
  const publishing = deferred<void>();
  const publish = f.localParticipant.publishTrack;
  f.localParticipant.publishTrack = async (track) => {
    started.resolve();
    await publishing.promise;
    await publish(track);
  };
  const work = f.session.start(f.room, f.options);
  await started.promise;
  await f.session.stop(f.room);
  publishing.resolve();
  assert.equal(await work, false);
  assert.equal(f.publications.length, 0);
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
});

test("unpublish failure cannot keep local recording alive", async () => {
  const f = fixture();
  await f.session.start(f.room, f.options);
  f.localParticipant.unpublishTrack = async () => {
    throw new Error("offline");
  };
  await assert.rejects(f.session.stop(f.room), /SCREEN_SHARE_UNPUBLISH_FAILED/);
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
});

test("only the currently published video ending stops the share", async () => {
  const f = fixture();
  let ended = 0;
  await f.session.start(f.room, {
    ...f.options,
    onEnded: () => {
      ended++;
    },
  });
  f.tracks[1]!.mediaStreamTrack.dispatchEvent(new Event("ended"));
  assert.equal(ended, 0);
  f.tracks[0]!.mediaStreamTrack.dispatchEvent(new Event("ended"));
  assert.equal(ended, 1);
  await f.session.stop(f.room);
  const next = [track(Track.Source.ScreenShare)];
  f.localParticipant.createScreenTracks = async () => next;
  await f.session.start(f.room, {
    ...f.options,
    onEnded: () => {
      ended++;
    },
  });
  f.tracks[0]!.mediaStreamTrack.dispatchEvent(new Event("ended"));
  assert.equal(ended, 1);
  next[0]!.mediaStreamTrack.dispatchEvent(new Event("ended"));
  assert.equal(ended, 2);
});

test("capture factory runs immediately and async publish resolution cleans up on failure", async () => {
  const f = fixture();
  let called = false;
  const work = f.session.start(f.room, {
    ...f.options,
    capture: () => {
      called = true;
      return Promise.resolve(f.tracks);
    },
    publish: async () => {
      throw Error("probe failure");
    },
  });
  assert.equal(called, true);
  await assert.rejects(work, /probe failure/);
  assert.ok(f.tracks.every((track) => track.mediaStreamTrack.readyState === "ended"));
  assert.equal(f.session.getSnapshot(), "idle");
});
