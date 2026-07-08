import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
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
    assert.match(screenSource, /export \{ AuthGate \} from "\.\/screens\/auth-gate";/);
    assert.doesNotMatch(screenSource, /function MessagesScreen\(/);
    assert.doesNotMatch(screenSource, /function OverviewScreen\(/);
    assert.doesNotMatch(screenSource, /function ProfileSettingsScreen\(/);
    assert.doesNotMatch(screenSource, /function MobileChannelChatScreen\(/);
    assert.doesNotMatch(screenSource, /function MobileVoiceChannelScreen\(/);
    assert.match(screenSource, /from "\.\/screens\/home-screen"/);
    assert.match(screenSource, /from "\.\/screens\/dm-screen"/);
    assert.match(screenSource, /from "\.\/screens\/auth-gate"/);
    assert.match(screenSource, /from "\.\/screens\/settings-screen"/);
    assert.match(screenSource, /from "\.\/screens\/notifications-screen"/);

    const legacySource = readFileSync(
      join(appRoot, "mobile-root-screens-legacy.tsx"),
      "utf8",
    );
    assert.doesNotMatch(legacySource, /export function ActiveScreen\(/);
  });

  it("keeps mobile auth UI outside the legacy screen module", () => {
    const authSource = readFileSync(join(appRoot, "screens", "auth-gate.tsx"), "utf8");
    const legacySource = readFileSync(
      join(appRoot, "mobile-root-screens-legacy.tsx"),
      "utf8",
    );

    assert.match(authSource, /export function AuthGate\(/);
    assert.match(authSource, /getMobileDevLoginCredentials/);
    assert.match(authSource, /MOBILE_AUTH_EMAIL_PATTERN/);
    assert.doesNotMatch(legacySource, /export function AuthGate\(/);
    assert.doesNotMatch(legacySource, /getMobileDevLoginCredentials/);
    assert.doesNotMatch(legacySource, /MOBILE_AUTH_EMAIL_PATTERN/);
  });

  it("keeps route and composer modules split by mobile surface", () => {
    const expectedModules = [
      join(appRoot, "screens", "home-screen.tsx"),
      join(appRoot, "screens", "dm-screen.tsx"),
      join(appRoot, "screens", "channel-screen.tsx"),
      join(appRoot, "screens", "voice-screen.tsx"),
      join(appRoot, "screens", "settings-screen.tsx"),
      join(appRoot, "screens", "notifications-screen.tsx"),
      join(appRoot, "screens", "auth-gate.tsx"),
      join(appRoot, "overlays", "mobile-voice-invite-overlay.tsx"),
      join(appRoot, "composer", "mobile-composer.tsx"),
    ];

    for (const modulePath of expectedModules) {
      assert.equal(existsSync(modulePath), true, `${modulePath} should exist`);
    }
  });

  it("keeps screen modules as explicit adapters instead of direct legacy re-exports", () => {
    const expectedExportsByModule = [
      {
        exports: ["OverviewScreen", "MobileWorkspaceBrowser"],
        path: join(appRoot, "screens", "home-screen.tsx"),
      },
      {
        exports: ["MessagesScreen", "DMConversationScreen"],
        path: join(appRoot, "screens", "dm-screen.tsx"),
      },
      {
        exports: ["MobileChannelChatScreen"],
        path: join(appRoot, "screens", "channel-screen.tsx"),
      },
      {
        exports: ["VoiceScreen", "MobileVoiceChannelScreen"],
        path: join(appRoot, "screens", "voice-screen.tsx"),
      },
      {
        exports: ["ProfileSettingsScreen"],
        path: join(appRoot, "screens", "settings-screen.tsx"),
      },
      {
        exports: ["NotificationsScreen"],
        path: join(appRoot, "screens", "notifications-screen.tsx"),
      },
      {
        exports: ["AuthGate"],
        path: join(appRoot, "screens", "auth-gate.tsx"),
      },
      {
        exports: ["DMComposer"],
        path: join(appRoot, "composer", "mobile-composer.tsx"),
      },
      {
        exports: ["MobileVoiceInviteOverlay"],
        path: join(appRoot, "overlays", "mobile-voice-invite-overlay.tsx"),
      },
    ];

    for (const moduleContract of expectedExportsByModule) {
      const source = readFileSync(moduleContract.path, "utf8");

      assert.doesNotMatch(
        source,
        /export\s+\{[\s\S]*?\}\s+from\s+["']\.\.\/mobile-root-screens-legacy["'];?/,
        `${moduleContract.path} should not be a direct legacy re-export`,
      );
      assert.doesNotMatch(
        source,
        /export\s+\{[\s\S]*?\}\s+from\s+["']\.\.\/\.\.\/mobile-root-screens-legacy["'];?/,
        `${moduleContract.path} should not be a direct legacy re-export`,
      );

      for (const exportName of moduleContract.exports) {
        assert.match(
          source,
          new RegExp(`export function ${exportName}\\(`),
          `${moduleContract.path} should own an explicit ${exportName} adapter`,
        );
      }
    }
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
      join(appRoot, "mobile-root-screens-legacy.tsx"),
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
    const voiceScreenSource = readFileSync(
      join(appRoot, "screens", "voice-screen.tsx"),
      "utf8",
    );

    assert.match(rootSource, /activeWorkspaceVoiceChannelId/);
    assert.match(rootSource, /handleCloseWorkspaceVoiceChannel/);
    assert.match(rootSource, /handleLeaveWorkspaceVoiceChannel/);
    assert.match(rootSource, /activeWorkspaceTextChannelId !== null \|\|[\s\S]*activeWorkspaceVoiceChannelId !== null/);
    assert.match(voiceScreenSource, /MobileVoiceChannelScreen/);
    assert.match(screenSource, /onCloseWorkspaceVoiceChannel/);
    assert.match(screenSource, /onLeaveWorkspaceVoiceChannel/);
    assert.match(screenSource, /from "\.\/overlays\/mobile-voice-invite-overlay"/);
    assert.doesNotMatch(
      readFileSync(join(appRoot, "mobile-root-screens-legacy.tsx"), "utf8"),
      /export function MobileVoiceInviteOverlay\(/,
    );
  });

  it("keeps voice room participants in a single mobile section", () => {
    const screenSource = readFileSync(
      join(appRoot, "mobile-root-screens-legacy.tsx"),
      "utf8",
    );

    assert.match(screenSource, /participants=\{model\.allParticipants\}/);
    assert.doesNotMatch(screenSource, /participants=\{model\.speakingParticipants\}/);
    assert.doesNotMatch(screenSource, /participants=\{model\.listeningParticipants\}/);
  });
});
