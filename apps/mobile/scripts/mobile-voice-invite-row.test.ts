import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMobileVoiceInviteRowPresentation } from "../src/voice/mobile-voice-invite-row";

describe("mobile voice invite row presentation", () => {
  it("offers the filled invite action until an invite is on its way", () => {
    assert.deepEqual(getMobileVoiceInviteRowPresentation(undefined), {
      busy: false,
      disabled: false,
      icon: "person-add-outline",
      tone: "accent",
    });
  });

  it("locks the row while the invite is in flight or already answered yes", () => {
    assert.deepEqual(getMobileVoiceInviteRowPresentation("sending"), {
      busy: true,
      disabled: true,
      icon: null,
      tone: "neutral",
    });
    assert.deepEqual(getMobileVoiceInviteRowPresentation("sent"), {
      busy: false,
      disabled: true,
      icon: "paper-plane-outline",
      tone: "neutral",
    });
    assert.deepEqual(getMobileVoiceInviteRowPresentation("accepted"), {
      busy: false,
      disabled: true,
      icon: "checkmark",
      tone: "success",
    });
  });

  it("keeps a declined or failed invite retryable", () => {
    // Declining is the invitee's answer, not a dead end: the row can ask again.
    assert.deepEqual(getMobileVoiceInviteRowPresentation("declined"), {
      busy: false,
      disabled: false,
      icon: "close",
      tone: "neutral",
    });
    assert.deepEqual(getMobileVoiceInviteRowPresentation("failed"), {
      busy: false,
      disabled: false,
      icon: "refresh",
      tone: "danger",
    });
  });
});
