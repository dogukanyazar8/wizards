import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(process.cwd(), "src", "app");

describe("mobile root boundary", () => {
  it("keeps the root component focused on app orchestration instead of screen UI", () => {
    const rootSource = readFileSync(
      join(appRoot, "whispr-mobile-root.tsx"),
      "utf8",
    );

    assert.match(
      rootSource,
      /import \{ ActiveScreen, AuthGate \} from "\.\/mobile-root-screens";/,
    );
    assert.doesNotMatch(
      rootSource,
      /\b(ActivityIndicator|Image|Pressable|StyleSheet|TextInput|View)\b/,
    );
  });

  it("keeps native screen rendering in the dedicated screen module", () => {
    const screenSource = readFileSync(
      join(appRoot, "mobile-root-screens.tsx"),
      "utf8",
    );

    assert.match(screenSource, /export function ActiveScreen\(/);
    assert.match(screenSource, /export function AuthGate\(/);
    assert.match(screenSource, /function MessagesScreen\(/);
    assert.match(screenSource, /function OverviewScreen\(/);
    assert.match(screenSource, /function ProfileSettingsScreen\(/);
  });

  it("keeps virtualized channel chat out of the shell scroll view", () => {
    const shellSource = readFileSync(join(appRoot, "mobile-app-shell.tsx"), "utf8");
    const rootSource = readFileSync(join(appRoot, "whispr-mobile-root.tsx"), "utf8");

    assert.match(shellSource, /contentUsesOwnScroll\?: boolean/);
    assert.match(shellSource, /contentUsesOwnScroll \? \(/);
    assert.match(rootSource, /const contentUsesOwnScroll =/);
    assert.match(rootSource, /contentUsesOwnScroll=\{contentUsesOwnScroll\}/);
  });

  it("keeps channel message refresh on the virtualized list", () => {
    const screenSource = readFileSync(
      join(appRoot, "mobile-root-screens.tsx"),
      "utf8",
    );

    assert.match(screenSource, /\bRefreshControl\b/);
    assert.match(screenSource, /refreshControl=\{/);
    assert.match(screenSource, /refreshing=\{state\.status === "loading"\}/);
  });

  it("keeps realtime background sync out of the shell refresh indicator", () => {
    const rootSource = readFileSync(
      join(appRoot, "whispr-mobile-root.tsx"),
      "utf8",
    );

    assert.match(rootSource, /const isShellRefreshing = status === "checking";/);
    assert.doesNotMatch(rootSource, /isMobileSyncRefreshing\(bootstrapSyncState\)/);
    assert.doesNotMatch(rootSource, /isMobileSyncRefreshing\(channelSyncState\)/);
  });

  it("keeps the dedicated voice room screen separate from voice leave cleanup", () => {
    const rootSource = readFileSync(
      join(appRoot, "whispr-mobile-root.tsx"),
      "utf8",
    );
    const screenSource = readFileSync(
      join(appRoot, "mobile-root-screens.tsx"),
      "utf8",
    );

    assert.match(rootSource, /activeWorkspaceVoiceChannelId/);
    assert.match(rootSource, /handleCloseWorkspaceVoiceChannel/);
    assert.match(rootSource, /handleLeaveWorkspaceVoiceChannel/);
    assert.match(rootSource, /activeWorkspaceTextChannelId !== null \|\|[\s\S]*activeWorkspaceVoiceChannelId !== null/);
    assert.match(screenSource, /MobileVoiceChannelScreen/);
    assert.match(screenSource, /onCloseWorkspaceVoiceChannel/);
    assert.match(screenSource, /onLeaveWorkspaceVoiceChannel/);
  });

  it("keeps voice room participants in a single mobile section", () => {
    const screenSource = readFileSync(
      join(appRoot, "mobile-root-screens.tsx"),
      "utf8",
    );

    assert.match(screenSource, /participants=\{model\.allParticipants\}/);
    assert.doesNotMatch(screenSource, /participants=\{model\.speakingParticipants\}/);
    assert.doesNotMatch(screenSource, /participants=\{model\.listeningParticipants\}/);
  });
});
