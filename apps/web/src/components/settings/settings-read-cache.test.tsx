import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BADGE_IDS } from "@wizards/types";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { badgeQueryKeys } from "@/lib/badges/client";
import { securityQueryKeys } from "@/lib/settings/security-client";
import { settingsQueryKeys } from "@/lib/settings/client";
import { SETTINGS_TEST_BOOTSTRAP, SETTINGS_TEST_LAYOUT } from "@/lib/settings/read-test-fixtures";
import { findSettingsSection } from "@/lib/settings/tree";
import { useOwnBadgesState, OwnBadgesProvider, BadgeGridBlock } from "./blocks/badge-grid-block";
import {
  useAccountSessionsState,
  AccountSessionsProvider,
  ActiveSessionsBlock,
} from "./blocks/active-sessions-block";
import { SecurityEventsBlock } from "./blocks/security-events-block";
import { AccountSection } from "./sections/account/account-section";
import { AppearanceTextTab } from "./sections/appearance/text-tab";
import { MESSAGING_PRIVACY_QUERY_KEY } from "@/components/messages/privacy-settings-card";
import { GAME_SHARING_QUERY_KEY } from "@/lib/game-activity/client";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useCameraDevices } from "@/hooks/use-camera-devices";
import { MEDIA_DEVICES_QUERY_KEY } from "@/hooks/use-available-media-devices";

function render(client: QueryClient, node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        {node}
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
function Badges() {
  const value = useOwnBadgesState();
  return (
    <OwnBadgesProvider value={value}>
      <BadgeGridBlock row={{ key: "r1", type: "custom", block: "badges" }} data={{}} />
    </OwnBadgesProvider>
  );
}
function Sessions() {
  const value = useAccountSessionsState();
  return (
    <AccountSessionsProvider value={value}>
      <ActiveSessionsBlock row={{ key: "o1", type: "custom", block: "sessions" }} data={{}} />
    </AccountSessionsProvider>
  );
}

it("reopens badges from cache and keeps all badges during a failed background refresh", () => {
  const client = new QueryClient();
  client.setQueryData(badgeQueryKeys.own(), {
    badges: [{ id: "staff", tier: 1, earnedAt: "2026-01-01T00:00:00Z" }],
    progress: [],
  });
  for (let mount = 0; mount < 3; mount++) {
    const markup = render(client, <Badges />);
    assert.doesNotMatch(markup, /skeleton|role="status"/);
    assert.match(markup, /data-badge-earned="true"/);
    for (const id of BADGE_IDS) assert.ok(markup.includes(`data-testid="settings-badge-${id}"`));
  }
  client
    .getQueryCache()
    .find({ queryKey: badgeQueryKeys.own() })!
    .setState({ status: "error", error: new Error("offline") });
  assert.doesNotMatch(render(client, <Badges />), /-error|skeleton/);
  client.clear();
});

it("reopens session/security lists without replacing cached rows with skeletons", () => {
  const client = new QueryClient();
  client.setQueryData(securityQueryKeys.sessions, [
    {
      id: "current",
      current: true,
      device: "Saved device",
      deviceType: "DESKTOP",
      os: "Windows",
      platform: "web",
      location: null,
      lastActive: "2026-09-14T00:00:00Z",
    },
  ]);
  client.setQueryData(securityQueryKeys.events, [
    {
      id: "event",
      kind: "passwordChanged",
      createdAt: "2026-09-14T00:00:00Z",
      userAgent: null,
      location: null,
    },
  ]);
  for (let mount = 0; mount < 2; mount++) {
    assert.match(render(client, <Sessions />), /settings-session-current/);
    const events = render(
      client,
      <SecurityEventsBlock row={{ key: "s3", type: "custom", block: "secEvents" }} data={{}} />,
    );
    assert.doesNotMatch(events, /skeleton/);
    assert.match(events, /Parola/);
  }
  client.clear();
});

it("uses saved privacy values in the first render, before hydration effects", () => {
  const client = new QueryClient();
  client.setQueryData(settingsQueryKeys.bootstrap, SETTINGS_TEST_BOOTSTRAP);
  client.setQueryData(settingsQueryKeys.layout, {
    ...SETTINGS_TEST_LAYOUT,
    allowGroupInvites: false,
    profileVisibility: "NOBODY",
  });
  client.setQueryData(MESSAGING_PRIVACY_QUERY_KEY, { readReceipts: false, typingIndicator: true });
  client.setQueryData(GAME_SHARING_QUERY_KEY, { enabled: false });
  const section = findSettingsSection("account")!;
  const input = {
    section,
    tab: section.tabs.find((tab) => tab.key === "privacy")!,
    openRisky: null,
    openSelect: null,
    toggleRisky() {},
    toggleSelect() {},
  };
  for (let mount = 0; mount < 2; mount++) {
    const markup = render(client, <AccountSection input={input} />);
    assert.doesNotMatch(markup, /settings-skeleton/);
    assert.match(markup, /Hiç kimse/);
    for (const key of ["g5", "g6", "g7"])
      assert.match(
        markup.match(new RegExp(`<button[^>]*data-testid="setting-toggle-${key}"[^>]*>`))?.[0] ??
          "",
        /aria-checked="false"/,
      );
  }
  client.clear();
});

it("uses saved appearance controls immediately when entering from another section", () => {
  const client = new QueryClient();
  client.setQueryData(settingsQueryKeys.layout, SETTINGS_TEST_LAYOUT);
  const markup = render(client, <AppearanceTextTab />);
  assert.doesNotMatch(markup, /settings-skeleton/);
  assert.match(
    markup.match(/<button[^>]*data-testid="setting-toggle-m4"[^>]*>/)?.[0] ?? "",
    /aria-checked="true"/,
  );
  assert.match(markup, /aria-valuenow="20"/);
  client.clear();
});

it("audio and camera pickers reuse the shared device snapshot on their first render", () => {
  const client = new QueryClient();
  client.setQueryData(MEDIA_DEVICES_QUERY_KEY, [
    { kind: "audioinput", deviceId: "mic", groupId: "group", label: "Saved mic" },
    { kind: "videoinput", deviceId: "cam", groupId: "group", label: "Saved camera" },
  ]);
  function Devices() {
    const audio = useAudioDevices();
    const camera = useCameraDevices();
    return (
      <p>
        {audio.inputDevices[0]?.label} / {camera.devices[0]?.label}
      </p>
    );
  }
  assert.match(render(client, <Devices />), /Saved mic \/ Saved camera/);
  client.clear();
});
