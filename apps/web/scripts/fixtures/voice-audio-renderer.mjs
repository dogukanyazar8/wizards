import React, { memo } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteAudioTrack,
  RemoteTrackPublication,
  Track,
} from "livekit-client";
import { VoiceAudioRenderer } from "../../src/components/voice/voice-audio-renderer";

// Stable props reproduce the production React Compiler boundary. All media and
// LiveKit objects are real; only server publication notifications are injected.
const Renderer = memo(VoiceAudioRenderer);
const room = new Room();
const root = createRoot(document.getElementById("root"));
const context = new AudioContext();
const oscillator = context.createOscillator();
const destination = context.createMediaStreamDestination();
oscillator.connect(destination);
oscillator.start();
const peer = new RTCPeerConnection();
const receiver = peer.addTransceiver("audio").receiver;
const participant = new RemoteParticipant(room.engine.client, "PA_remote", "remote");
const tracks = [];
let outputErrors = 0;
const onOutputError = () => outputErrors++;

function render() {
  flushSync(() => {
    root.render(React.createElement(Renderer, { room, outputDeviceId: "default", onOutputError }));
  });
}

function publish(id, source = Track.Source.Microphone, owner = participant) {
  const track = new RemoteAudioTrack(destination.stream.getAudioTracks()[0].clone(), id, receiver);
  track.source = source;
  const publication = new RemoteTrackPublication(Track.Kind.Audio, { sid: id, name: id }, true);
  publication.source = source;
  owner.trackPublications.set(id, publication);
  owner.audioTrackPublications.set(id, publication);
  tracks.push(track);
  // Publication metadata arrives before media subscription. Flush that empty
  // publication so TrackPublished alone cannot make this regression pass.
  flushSync(() => room.emit(RoomEvent.TrackPublished, publication, owner));
  publication.setTrack(track);
  room.emit(RoomEvent.TrackSubscribed, track, publication, owner);
  room.emit(
    RoomEvent.TrackSubscriptionStatusChanged,
    publication,
    publication.subscriptionStatus,
    owner,
  );
  render();
}

window.voiceAudioTest = {
  mount: render,
  join() {
    room.remoteParticipants.set(participant.identity, participant);
    room.emit(RoomEvent.ParticipantConnected, participant);
    render();
  },
  publish,
  publishExcluded() {
    publish("TR_share", Track.Source.ScreenShareAudio);
    publish("TR_local", Track.Source.Microphone, room.localParticipant);
  },
  unpublish(id) {
    const publication = participant.trackPublications.get(id);
    const track = publication.track;
    publication.setTrack(undefined);
    participant.trackPublications.delete(id);
    participant.audioTrackPublications.delete(id);
    room.emit(RoomEvent.TrackUnsubscribed, track, publication, participant);
    room.emit(RoomEvent.TrackUnpublished, publication, participant);
    room.emit(
      RoomEvent.TrackSubscriptionStatusChanged,
      publication,
      publication.subscriptionStatus,
      participant,
    );
    render();
  },
  leave() {
    room.remoteParticipants.delete(participant.identity);
    room.emit(RoomEvent.ParticipantDisconnected, participant);
    render();
  },
  async unmount() {
    flushSync(() => root.unmount());
    tracks.forEach((track) => track.stop());
    destination.stream.getTracks().forEach((track) => track.stop());
    oscillator.stop();
    peer.close();
    await context.close();
  },
  state() {
    return {
      attachments: tracks.map((track) => ({ id: track.sid, count: track.attachedElements.length })),
      listeners: room.eventNames().reduce((count, event) => count + room.listenerCount(event), 0),
      outputErrors,
    };
  },
};
