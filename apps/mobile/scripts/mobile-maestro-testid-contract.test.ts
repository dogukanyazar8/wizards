import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  MOBILE_AUTOMATED_GATES,
  MOBILE_MANUAL_QA_CHECKS,
} from "../src/quality/mobile-quality-gate";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const flowSource = readFileSync(
  path.join(repositoryRoot, ".maestro", "phase0-navigation.yml"),
  "utf8",
);
const darkModeFlowPath = path.join(repositoryRoot, ".maestro", "phase1-dark-mode.yml");
const darkModeFlowSource = existsSync(darkModeFlowPath)
  ? readFileSync(darkModeFlowPath, "utf8")
  : "";
const loginHelperPath = path.join(repositoryRoot, ".maestro", "helpers", "login-uat.yml");
const loginHelperSource = existsSync(loginHelperPath) ? readFileSync(loginHelperPath, "utf8") : "";
const phase2FlowPath = path.join(repositoryRoot, ".maestro", "phase2-messaging.yml");
const phase2FlowSource = existsSync(phase2FlowPath) ? readFileSync(phase2FlowPath, "utf8") : "";
const phase3FlowPath = path.join(repositoryRoot, ".maestro", "phase3-social.yml");
const phase3FlowSource = existsSync(phase3FlowPath) ? readFileSync(phase3FlowPath, "utf8") : "";
const phase4FlowPath = path.join(repositoryRoot, ".maestro", "phase4-server-management.yml");
const phase4FlowSource = existsSync(phase4FlowPath) ? readFileSync(phase4FlowPath, "utf8") : "";
const phase5FlowPath = path.join(repositoryRoot, ".maestro", "phase5-voice-polish.yml");
const phase5FlowSource = existsSync(phase5FlowPath) ? readFileSync(phase5FlowPath, "utf8") : "";
const phase5OfflineFlowPath = path.join(
  repositoryRoot,
  ".maestro",
  "helpers",
  "phase5-offline-recovery.yml",
);
const phase5OfflineFlowSource = existsSync(phase5OfflineFlowPath)
  ? readFileSync(phase5OfflineFlowPath, "utf8")
  : "";
const mobilePerformanceLoginFlowPath = path.join(
  repositoryRoot,
  ".maestro",
  "mobile-performance-login.yml",
);
const mobilePerformanceLoginFlowSource = existsSync(mobilePerformanceLoginFlowPath)
  ? readFileSync(mobilePerformanceLoginFlowPath, "utf8")
  : "";
const rootGitignoreSource = readFileSync(path.join(repositoryRoot, ".gitignore"), "utf8");

const testIdSources: Record<string, { file: string; needle: string }> = {
  "mobile-bottom-tab-messages": {
    file: "src/navigation/mobile-bottom-tab-bar.tsx",
    needle: "mobile-bottom-tab-${tabId}",
  },
  "mobile-bottom-tab-overview": {
    file: "src/navigation/mobile-bottom-tab-bar.tsx",
    needle: "mobile-bottom-tab-${tabId}",
  },
  "mobile-channel-chat-screen": {
    file: "src/app/screens/channel-screen.tsx",
    needle: 'testID="mobile-channel-chat-screen"',
  },
  "mobile-dm-chat-screen": {
    file: "src/app/screens/dm-conversation-screen.tsx",
    needle: 'testID="mobile-dm-chat-screen"',
  },
  "mobile-dm-conversation-row": {
    file: "src/app/screens/dm-inbox.tsx",
    needle: 'testID="mobile-dm-conversation-row"',
  },
  "mobile-dm-inbox-screen": {
    file: "src/app/screens/dm-screen.tsx",
    needle: 'testID="mobile-dm-inbox-screen"',
  },
  "mobile-settings-screen": {
    file: "src/app/screens/settings-screen.tsx",
    needle: 'testID="mobile-settings-screen"',
  },
  "mobile-workspace-channel-text": {
    file: "src/app/screens/workspace-channel-section-list.tsx",
    needle: "mobile-workspace-channel-${channel.type.toLowerCase()}",
  },
};

describe("Phase 0 Maestro testID contract", () => {
  it("keeps mobile performance login input and submit ordering Android-safe", () => {
    assert.ok(mobilePerformanceLoginFlowSource, ".maestro/mobile-performance-login.yml must exist");
    assert.match(
      mobilePerformanceLoginFlowSource,
      /id:\s*"mobile-auth-login-email-input"\r?\n- inputText:\s*\$\{MAESTRO_PERF_EMAIL\}\r?\n- hideKeyboard\r?\n- tapOn:\r?\n\s+id:\s*"mobile-auth-login-password-input"\r?\n- inputText:\s*\$\{MAESTRO_PERF_PASSWORD\}\r?\n- hideKeyboard\r?\n- tapOn:\r?\n\s+id:\s*"mobile-auth-login-submit"/,
    );
  });

  it("keeps the shared UAT helper a signed-in no-op across both signed-out call contexts", () => {
    assert.match(rootGitignoreSource, /^\.env\.maestro$/m);
    assert.match(rootGitignoreSource, /^\.env\.local$/m);
    assert.ok(loginHelperSource, ".maestro/helpers/login-uat.yml must exist");
    assert.match(loginHelperSource, /id:\s*"mobile-settings-web-sign-in-action"/);
    assert.match(
      loginHelperSource,
      /when:\s*\r?\n\s+visible:\s*\r?\n\s+id:\s*"mobile-settings-web-sign-in-action"[\s\S]*?id:\s*"mobile-bottom-tab-overview"[\s\S]*?id:\s*"mobile-auth-welcome-screen"/,
    );
    assert.match(
      loginHelperSource,
      /when:\s*\r?\n\s+visible:\s*\r?\n\s+id:\s*"mobile-auth-welcome-screen"[\s\S]*?id:\s*"mobile-auth-welcome-sign-in"[\s\S]*?id:\s*"mobile-auth-login-screen"/,
    );
    assert.match(
      loginHelperSource,
      /id:\s*"mobile-bottom-tab-overview"[\s\S]*?id:\s*"mobile-auth-welcome-screen"[\s\S]*?id:\s*"mobile-auth-welcome-sign-in"[\s\S]*?id:\s*"mobile-auth-login-screen"/,
    );
    assert.doesNotMatch(loginHelperSource, /mobile-auth-screen/);
    assert.doesNotMatch(loginHelperSource, /MAESTRO_UAT_(?:EMAIL|PASSWORD)/);
    assert.doesNotMatch(loginHelperSource, /(?:development|fill-dev|inputText|retry)/i);
    assert.doesNotMatch(loginHelperSource, /mobile-auth-(?:login|register|forgot)-submit/);

    for (const source of [flowSource, darkModeFlowSource]) {
      assert.match(source, /file:\s*"helpers\/login-uat\.yml"/);
      assert.match(
        source,
        /id:\s*"mobile-bottom-tab-overview"[\s\S]*?file:\s*"helpers\/login-uat\.yml"/,
      );
      assert.doesNotMatch(source, /MAESTRO_UAT_(?:EMAIL|PASSWORD)/);
      assert.doesNotMatch(source, /WHISPR_MOBILE_E2E_(?:EMAIL|PASSWORD)/);
      assert.doesNotMatch(source, /tapOn:\s*"Giriş yap"/);
    }
  });

  it("binds every navigation-flow testID to a production source", () => {
    const flowIds = [...flowSource.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]);
    const uniqueFlowIds = [...new Set(flowIds)].sort();

    assert.deepEqual(uniqueFlowIds, Object.keys(testIdSources).sort());
    for (const testId of uniqueFlowIds) {
      const sourceContract = testIdSources[testId];
      assert.ok(sourceContract, `No production source contract exists for ${testId}`);
      const source = readFileSync(path.join(process.cwd(), sourceContract.file), "utf8");
      assert.ok(
        source.includes(sourceContract.needle),
        `${testId} is missing from ${sourceContract.file}`,
      );
    }
  });

  it("keeps Android back and deep-link device verification in the quality gate", () => {
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-navigation"));

    const manualIds = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.id));
    assert.ok(manualIds.has("android-hardware-back-navigation"));
    assert.ok(manualIds.has("android-navigation-deep-links"));
  });

  it("binds the Phase 1 appearance control and dark-mode Maestro flow", () => {
    const settingsSource = readFileSync(
      path.join(process.cwd(), "src/app/screens/settings-screen.tsx"),
      "utf8",
    );
    const destinationContracts = {
      "mobile-dm-inbox-screen": "src/app/screens/dm-screen.tsx",
      "mobile-notifications-screen": "src/app/screens/notifications-screen.tsx",
      "mobile-overview-screen": "src/app/screens/home-screen.tsx",
      "mobile-settings-screen": "src/app/screens/settings-screen.tsx",
    } as const;

    assert.match(settingsSource, /testID="mobile-settings-appearance-control"/);
    assert.ok(darkModeFlowSource, ".maestro/phase1-dark-mode.yml must exist");
    assert.match(darkModeFlowSource, /id:\s*"mobile-settings-appearance-control"/);
    assert.match(darkModeFlowSource, /text:\s*"Koyu\|Dark"/);
    assert.match(darkModeFlowSource, /checked:\s*true/);
    for (const screenshot of ["dark-overview", "dark-settings", "light-settings"]) {
      assert.match(
        darkModeFlowSource,
        new RegExp(`takeScreenshot:\\s*"artifacts/mobile/phase1/closure/${screenshot}"`),
      );
    }
    for (const tabId of ["overview", "messages", "notifications", "settings"]) {
      assert.match(darkModeFlowSource, new RegExp(`id:\\s*"mobile-bottom-tab-${tabId}"`));
    }
    assert.doesNotMatch(darkModeFlowSource, /mobile-bottom-tab-voice/);
    for (const [testId, sourcePath] of Object.entries(destinationContracts)) {
      assert.match(darkModeFlowSource, new RegExp(`id:\\s*"${testId}"`));
      assert.match(readFileSync(path.join(process.cwd(), sourcePath), "utf8"), new RegExp(testId));
    }
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-dark-mode"));
  });

  it("binds the Phase 2 messaging flow to production interaction testIDs", () => {
    assert.ok(phase2FlowSource, ".maestro/phase2-messaging.yml must exist");
    const contracts = {
      "mobile-channel-composer-input": [
        "src/app/composer/mobile-composer.tsx",
        "mobile-channel-composer-input",
      ],
      "mobile-channel-send-button": [
        "src/app/composer/mobile-composer.tsx",
        "mobile-channel-send-button",
      ],
      "mobile-dm-composer-input": [
        "src/app/composer/mobile-composer.tsx",
        "mobile-dm-composer-input",
      ],
      "mobile-dm-send-button": ["src/app/composer/mobile-composer.tsx", "mobile-dm-send-button"],
      "mobile-message-edit-preview": [
        "src/app/composer/mobile-composer.tsx",
        "mobile-message-${intent.mode}-preview",
      ],
      "mobile-message-emoji-picker-panel": [
        "src/app/components/message-emoji-picker.tsx",
        "mobile-message-emoji-picker",
      ],
      "mobile-message-reply-preview": [
        "src/app/composer/mobile-composer.tsx",
        "mobile-message-${intent.mode}-preview",
      ],
      "mobile-message-thread-screen": [
        "src/app/screens/message-thread-screen.tsx",
        "mobile-message-thread-screen",
      ],
      "mobile-message-thread-back-button": [
        "src/app/screens/message-thread-screen.tsx",
        "mobile-message-thread-back-button",
      ],
    } as const;
    for (const [testId, [sourcePath, needle]] of Object.entries(contracts)) {
      assert.match(phase2FlowSource, new RegExp(`id:\\s*"${testId}"`));
      assert.ok(readFileSync(path.join(process.cwd(), sourcePath), "utf8").includes(needle));
    }
    for (const action of ["More emoji", "Reply", "Edit", "Start thread", "Delete"]) {
      assert.match(phase2FlowSource, new RegExp(action));
    }
    assert.ok(
      (phase2FlowSource.match(/id:\s*"mobile-message-actions-\.\*-trigger"/g)?.length ?? 0) >= 4,
    );
    // 10e: one long press opens the whole menu — the flow no longer walks through
    // a floating bar and a "More actions" overflow to reach edit/delete.
    assert.match(
      phase2FlowSource,
      /longPressOn:[\s\S]{0,160}?assertVisible:\r?\n\s+id:\s*"mobile-message-actions-\.\*-options"/,
    );
    assert.doesNotMatch(phase2FlowSource, /More actions|Diğer eylemler/);
    assert.ok(
      readFileSync(
        path.join(process.cwd(), "src/app/components/message-action-menu.tsx"),
        "utf8",
      ).includes("`${testID}-options`"),
    );
    for (const message of ["Phase2 Maestro verified", "Phase2 edited verified"]) {
      assert.match(
        phase2FlowSource,
        new RegExp(`containsChild:[\\s\\S]{0,80}text:\\s*"${message}"`),
      );
    }
    assert.match(phase2FlowSource, /artifacts\/mobile\/phase2\/closure\/light-messaging/);
    assert.match(phase2FlowSource, /artifacts\/mobile\/phase2\/closure\/dark-messaging/);
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-phase2-messaging"));
  });

  it("binds the Phase 3 social and account flow without capturing 2FA secrets", () => {
    assert.ok(phase3FlowSource, ".maestro/phase3-social.yml must exist");
    assert.match(
      phase3FlowSource,
      /openLink:\s*"whispr:\/\/settings"[\s\S]*?id:\s*"mobile-settings-screen"[\s\S]*?file:\s*"helpers\/login-uat\.yml"/,
    );
    assert.match(
      phase3FlowSource,
      /openLink:\s*"whispr:\/\/channels\/@me"[\s\S]*?id:\s*"mobile-dm-conversation-row"[\s\S]*?id:\s*"mobile-dm-chat-screen"/,
    );
    assert.doesNotMatch(phase3FlowSource, /WHISPR_MOBILE_E2E_CONVERSATION_ID/);
    assert.match(
      phase3FlowSource,
      /id:\s*"mobile-user-profile-screen"[\s\S]*?id:\s*"mobile-user-profile-identity"[\s\S]*?light-user-profile/,
    );
    assert.match(
      phase3FlowSource,
      /id:\s*"mobile-gif-picker-panel"[\s\S]*?id:\s*"mobile-gif-image-loaded-\.\*"[\s\S]*?light-gif-picker/,
    );
    const contracts = {
      "mobile-dm-header-open-profile": "src/app/components/dm-chat-primitives.tsx",
      "mobile-user-profile-screen": "src/social/mobile-user-profile-screen.tsx",
      "mobile-dm-gif-button": "src/app/composer/mobile-composer.tsx",
      "mobile-gif-picker-panel": "src/media/mobile-gif-picker.tsx",
      "mobile-settings-open-2fa": "src/app/screens/mobile-security-settings-screen.tsx",
      "mobile-security-screen": "src/account/mobile-two-factor-screen.tsx",
    } as const;
    for (const [testId, sourcePath] of Object.entries(contracts)) {
      assert.match(phase3FlowSource, new RegExp(`id:\\s*"${testId}"`));
      assert.match(
        readFileSync(path.join(process.cwd(), sourcePath), "utf8"),
        new RegExp(testId.replace(/-panel$/, "")),
      );
    }
    assert.match(phase3FlowSource, /file:\s*"helpers\/login-uat\.yml"/);
    assert.doesNotMatch(
      phase3FlowSource,
      /mobile-2fa-(?:setup-start|qr|manual-key|confirm|recovery-codes)/,
    );
    for (const screenshot of [
      "light-user-profile",
      "light-gif-picker",
      "light-security",
      "dark-user-profile",
    ]) {
      assert.match(phase3FlowSource, new RegExp(`artifacts/mobile/phase3/closure/${screenshot}`));
    }
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-phase3-social"));
  });

  it("binds the 11b quick profile card entry points to production test IDs", () => {
    const contracts = {
      "mobile-dm-header-profile-card": [
        "src/app/components/dm-chat-primitives.tsx",
        'testID="mobile-dm-header-profile-card"',
      ],
      "mobile-profile-card-shell": [
        "src/social/profile-card/profile-card-overlay.tsx",
        'testID="mobile-profile-card-shell"',
      ],
      "mobile-profile-card-backdrop": [
        "src/app/components/kit/overlay-surface.tsx",
        "`${testID}-backdrop`",
      ],
    } as const;

    for (const [testId, [sourcePath, needle]] of Object.entries(contracts)) {
      assert.match(phase3FlowSource, new RegExp(`id:\\s*"${testId}"`));
      assert.ok(
        readFileSync(path.join(process.cwd(), sourcePath), "utf8").includes(needle),
        `${testId} is missing from ${sourcePath}`,
      );
    }

    assert.match(phase3FlowSource, /artifacts\/mobile\/phase3\/closure\/dark-profile-card/);

    // The five surfaces that open the card all go through the same opener hook,
    // so a new entry point cannot quietly grow its own navigation.
    const entryPoints = {
      "src/app/components/dm-chat-primitives.tsx": "useOpenMobileProfileCard",
      "src/app/components/message-primitives.tsx": "useOpenMobileProfileCard",
      "src/app/components/message-reaction-detail-sheet.tsx": "useOpenMobileProfileCard",
      "src/workspace/mobile-server-members-screen.tsx": "useOpenMobileProfileCard",
    } as const;
    for (const [sourcePath, needle] of Object.entries(entryPoints)) {
      assert.ok(
        readFileSync(path.join(process.cwd(), sourcePath), "utf8").includes(needle),
        `${sourcePath} must open the profile card through ${needle}`,
      );
    }

    // MSG-1f: the thread stopped drawing its own reply layout, so its avatars
    // reach the card through the shared channel row rather than a second opener.
    const threadSource = readFileSync(
      path.join(process.cwd(), "src/app/screens/message-thread-screen.tsx"),
      "utf8",
    );
    assert.ok(
      threadSource.includes("MessagePreviewRow") && threadSource.includes('mode="channel"'),
      "src/app/screens/message-thread-screen.tsx must render replies as shared channel rows",
    );
  });

  it("binds the Phase 4 server-management flow to safe, contextual test IDs", () => {
    assert.ok(phase4FlowSource, ".maestro/phase4-server-management.yml must exist");
    assert.match(
      phase4FlowSource,
      /text:\s*"http:\/\/\.\*:8081"[\s\S]*?extendedWaitUntil:[\s\S]*?id:\s*"mobile-bottom-tab-settings"[\s\S]*?openLink:\s*"whispr:\/\/settings"/,
    );
    assert.match(phase4FlowSource, /file:\s*"helpers\/login-uat\.yml"/);
    assert.match(phase4FlowSource, /tapOn:\s*"Açık\|Light"/);
    assert.match(phase4FlowSource, /tapOn:\s*"Koyu\|Dark"/);
    for (const themeChoice of ["Açık\\|Light", "Koyu\\|Dark"]) {
      assert.match(
        phase4FlowSource,
        new RegExp(
          `tapOn:\\s*"${themeChoice}"\\r?\\n- pressKey:\\s*BACK\\r?\\n- tapOn:\\r?\\n\\s+id:\\s*"mobile-bottom-tab-overview"`,
        ),
      );
    }
    for (const sheetId of [
      "mobile-server-create-join-sheet",
      "mobile-category-editor-sheet",
      "mobile-channel-editor-sheet",
    ]) {
      assert.match(phase4FlowSource, new RegExp(`id:\\s*"${sheetId}-panel"`));
    }
    for (const [input, actionId] of [
      ["Phase4 Maestro UAT", "mobile-server-create-submit"],
      ["Maestro", "mobile-category-save"],
      ["Phase4 Maestro UAT", "mobile-server-delete-confirm-confirm"],
    ]) {
      assert.match(
        phase4FlowSource,
        new RegExp(
          `inputText:\\s*"${input}"\\r?\\n- hideKeyboard\\r?\\n- tapOn:\\r?\\n\\s+id:\\s*"${actionId}"`,
        ),
      );
    }
    assert.match(
      phase4FlowSource,
      /inputText:\s*"maestro-text"\r?\n- hideKeyboard\r?\n- tapOn:\r?\n\s+id:\s*"mobile-channel-type-text"\r?\n- tapOn:\r?\n\s+id:\s*"mobile-channel-save"/,
    );
    assert.match(
      phase4FlowSource,
      /id:\s*"mobile-server-create-submit"[\s\S]{0,300}?id:\s*"mobile-server-create-finish"[\s\S]{0,200}?id:\s*"mobile-server-settings-open-\.\*"/,
    );
    assert.equal(phase4FlowSource.match(/- tapOn:\s*"\.\*: Phase4 Maestro UAT"/g)?.length, 3);
    assert.match(
      phase4FlowSource,
      /id:\s*"mobile-server-create-finish"[\s\S]{0,220}?tapOn:\s*"\.\*: Phase4 Maestro UAT"[\s\S]{0,260}?id:\s*"mobile-server-invite-share-\.\*"/,
    );
    assert.match(
      phase4FlowSource,
      /mobile-server-invite-share-\.\*"[\s\S]{0,420}?tapOn:\s*"\.\*: Phase4 Maestro UAT"[\s\S]{0,220}?id:\s*"mobile-server-settings-open-\.\*"[\s\S]{0,180}?id:\s*"mobile-server-settings-screen"[\s\S]{0,100}?assertVisible:\s*"Phase4 Maestro UAT"/,
    );
    assert.match(
      phase4FlowSource,
      /tapOn:\s*"Koyu\|Dark"[\s\S]{0,420}?tapOn:\s*"\.\*: Phase4 Maestro UAT"[\s\S]{0,220}?id:\s*"mobile-server-settings-open-\.\*"[\s\S]{0,180}?id:\s*"mobile-server-settings-screen"[\s\S]{0,100}?assertVisible:\s*"Phase4 Maestro UAT"/,
    );
    assert.match(
      phase4FlowSource,
      /id:\s*"mobile-server-icon-picker"[\s\S]{0,220}?visible:\s*"Photos\|Fotoğraflar"[\s\S]{0,180}?point:\s*"16%,58%"[\s\S]{0,120}?"Done\|Bitti\|Tamam"[\s\S]{0,320}?text:\s*"Server settings saved\.\|Sunucu ayarları kaydedildi\."[\s\S]{0,220}?id:\s*"mobile-server-icon-picker"[\s\S]{0,180}?light-server-management/,
    );
    assert.doesNotMatch(phase4FlowSource, /visible:\s*"phase4-avatar"/);
    assert.match(
      phase4FlowSource,
      /id:\s*"mobile-server-invite-share-\.\*"[\s\S]{0,220}?visible:\s*"Sharing link\|Bağlantı paylaş"[\s\S]{0,160}?pressKey:\s*BACK[\s\S]{0,180}?visible:[\s\S]{0,80}?id:\s*"mobile-overview-screen"/,
    );
    assert.match(
      phase4FlowSource,
      /dark-server-management"[\s\S]{0,250}?scrollUntilVisible:[\s\S]{0,120}?id:\s*"mobile-server-delete-open"[\s\S]{0,80}?direction:\s*DOWN[\s\S]{0,120}?id:\s*"mobile-server-delete-open"/,
    );
    assert.match(
      phase4FlowSource,
      /id:\s*"mobile-server-delete-confirm-confirm"[\s\S]{0,220}?visible:[\s\S]{0,80}?id:\s*"mobile-overview-screen"[\s\S]{0,180}?assertNotVisible:\s*"Phase4 Maestro UAT"/,
    );
    assert.match(phase4FlowSource, /inputText:\s*"Phase4 Maestro UAT"/);
    for (const id of [
      "mobile-server-add-open",
      "mobile-server-create-submit",
      "mobile-server-invite-share-.*",
      "mobile-server-settings-open-.*",
      "mobile-category-create-open",
      "mobile-category-save",
      "mobile-channel-create-open",
      "mobile-channel-type-text",
      "mobile-channel-save",
      "mobile-server-members-open-.*",
      "mobile-server-icon-picker",
      "mobile-server-delete-confirm-input",
      "mobile-server-delete-confirm-confirm",
    ]) {
      assert.match(
        phase4FlowSource,
        new RegExp(`id:\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      );
    }
    for (const screenshot of ["light-server-management", "dark-server-management"]) {
      assert.match(
        phase4FlowSource,
        new RegExp(`takeScreenshot:\\s*"artifacts/mobile/phase4/closure/${screenshot}"`),
      );
    }
    assert.match(
      phase4FlowSource,
      /mobile-server-invite-share-\.\*"[\s\S]*?pressKey:\s*BACK[\s\S]*?light-server-management/,
    );
    assert.doesNotMatch(phase4FlowSource, /claimId|inviteCode|MAESTRO_UAT_(?:EMAIL|PASSWORD)/);

    const productionContracts = [
      ["src/app/screens/workspace-browser.tsx", "mobile-server-settings-open-${activeServerId}"],
      ["src/workspace/mobile-server-settings-screen.tsx", "mobile-server-settings-screen"],
      ["src/workspace/mobile-server-settings-screen.tsx", "mobile-server-icon-picker"],
      ["src/workspace/mobile-workspace-editor-sheets.tsx", "mobile-category-editor-sheet"],
      ["src/workspace/mobile-channel-settings-screen.tsx", "mobile-channel-settings-screen"],
      ["src/workspace/mobile-server-members-screen.tsx", "mobile-server-members-list"],
      ["src/app/components/kit/destructive-confirmation-sheet.tsx", "${testID}-confirm"],
      ["src/app/components/kit/bottom-sheet.tsx", "${testID}-panel"],
    ] as const;
    for (const [sourcePath, needle] of productionContracts) {
      assert.match(
        readFileSync(path.join(process.cwd(), sourcePath), "utf8"),
        new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
    assert.ok(
      MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-phase4-server-management"),
    );
  });

  it("binds the Phase 5 voice and offline flow without capturing active camera content", () => {
    assert.ok(phase5FlowSource, ".maestro/phase5-voice-polish.yml must exist");
    const completePhase5FlowSource = `${phase5FlowSource}\n${phase5OfflineFlowSource}`;
    assert.ok(phase5OfflineFlowSource, ".maestro/helpers/phase5-offline-recovery.yml must exist");
    assert.match(phase5FlowSource, /visible:\s*"Reload"[\s\S]*?pressKey:\s*BACK/);
    assert.match(phase5FlowSource, /id:\s*"mobile-bottom-tab-settings"/);
    assert.match(phase5FlowSource, /file:\s*"helpers\/login-uat\.yml"/);
    for (const id of [
      "mobile-workspace-channel-voice",
      "mobile-settings-permission-action-camera",
      "mobile-voice-room-screen",
      "mobile-voice-mute-toggle",
      "mobile-voice-camera-toggle",
      "mobile-voice-settings-open-control",
      "mobile-voice-device-sheet-panel",
      "mobile-voice-device-refresh",
      "mobile-voice-noise-toggle",
      "mobile-offline-banner",
      "mobile-voice-leave",
    ]) {
      assert.match(completePhase5FlowSource, new RegExp(`id:\\s*"${id}"`));
    }
    assert.match(phase5FlowSource, /file:\s*"helpers\/phase5-offline-recovery\.yml"/);
    assert.match(phase5OfflineFlowSource, /setAirplaneMode:\s*enabled/);
    assert.match(phase5OfflineFlowSource, /setAirplaneMode:\s*disabled/);
    for (const themeChoice of ["Açık\\|Light", "Koyu\\|Dark"]) {
      assert.match(
        phase5FlowSource,
        new RegExp(
          `tapOn:\\s*"${themeChoice}"\\r?\\n- pressKey:\\s*BACK\\r?\\n- tapOn:\\r?\\n\\s+id:\\s*"mobile-bottom-tab-overview"`,
        ),
      );
    }
    assert.match(
      phase5FlowSource,
      /id:\s*"mobile-voice-camera-toggle"[\s\S]{0,360}?id:\s*"mobile-voice-camera-toggle"[\s\S]{0,700}?takeScreenshot:/,
    );
    for (const screenshot of ["light-voice-polish", "dark-voice-polish"]) {
      assert.match(
        phase5FlowSource,
        new RegExp(`takeScreenshot:\\s*"artifacts/mobile/phase5/${screenshot}"`),
      );
    }
    assert.doesNotMatch(phase5FlowSource, /claimId|inviteCode|MAESTRO_UAT_(?:EMAIL|PASSWORD)/);
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-phase5-voice"));
  });
});
