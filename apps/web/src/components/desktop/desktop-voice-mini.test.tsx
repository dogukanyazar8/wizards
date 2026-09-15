import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { VoiceMiniSnapshot } from "@wizards/types";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { DesktopVoiceMiniView } from "./desktop-voice-mini";

const snapshot: VoiceMiniSnapshot = {
  active: true,
  connection: { quality: "good", rttMs: null },
  participants: [
    {
      userId: "local",
      displayName: "Ada",
      avatarUrl: null,
      audioLevel: 0,
      isSpeaking: false,
      isLocal: true,
      isMuted: true,
      isDeafened: true,
    },
  ],
  updatedAt: "2026-09-15T12:00:00.000Z",
  version: 1,
};

function render(value: VoiceMiniSnapshot | null) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DesktopVoiceMiniView snapshot={value} />
    </LocaleProvider>,
  );
}

describe("Voice Mini", () => {
  it("does not claim a connection or offer voice commands before active data arrives", () => {
    for (const value of [null, { ...snapshot, active: false }]) {
      const html = render(value);
      assert.ok(html.includes("Ses bekleniyor"));
      assert.ok(!html.includes("Ses bağlı"));
      assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
      assert.ok(!html.includes('title="Ada'));
    }
  });

  it("renders real mute and deafen state and keeps the leave action available", () => {
    const html = render(snapshot);
    assert.ok(html.includes("Ses bağlı"));
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2);
    assert.ok(!html.includes('disabled=""'));
    assert.ok(html.includes("lucide-headphone-off"));
    assert.ok(html.includes("Sesten ayrıl"));
  });

  it("distinguishes unknown, lost and poor connection quality", () => {
    for (const [quality, label] of [
      ["unknown", "Bağlanıyor"],
      ["lost", "Yeniden bağlanıyor"],
      ["poor", "Zayıf bağlantı"],
    ] as const) {
      const html = render({ ...snapshot, connection: { quality, rttMs: null } });
      assert.ok(html.includes(label));
      assert.ok(!html.includes("Ses bağlı"));
    }
  });

  it("prioritizes speakers, caps avatars and shows remaining participants without dropping local controls", () => {
    const participants = Array.from({ length: 5 }, (_, index) => ({
      ...snapshot.participants[0]!,
      userId: String(index),
      displayName: `Person ${index}`,
      isLocal: index === 0,
      isSpeaking: index === 4,
    }));
    const html = render({ ...snapshot, participants });
    assert.equal((html.match(/role="img"/g) ?? []).length, 3);
    assert.ok(html.includes("+2"));
    assert.ok(html.includes("5 katılımcı"));
    assert.ok(html.indexOf('aria-label="Person 4') < html.indexOf('aria-label="Person 0'));
    assert.ok(!html.includes('disabled=""'));
    assert.deepEqual(
      participants.map((p) => p.userId),
      ["0", "1", "2", "3", "4"],
    );
  });
});
