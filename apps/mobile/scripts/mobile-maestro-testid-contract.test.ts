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
  it("uses one non-retrying UAT login helper with ignored local credentials", () => {
    assert.match(rootGitignoreSource, /^\.env\.maestro$/m);
    assert.ok(loginHelperSource, ".maestro/helpers/login-uat.yml must exist");
    assert.equal(loginHelperSource.match(/\$\{MAESTRO_UAT_EMAIL\}/g)?.length, 1);
    assert.equal(loginHelperSource.match(/\$\{MAESTRO_UAT_PASSWORD\}/g)?.length, 1);
    assert.match(loginHelperSource, /id:\s*"mobile-settings-web-sign-in-action"/);
    assert.match(loginHelperSource, /id:\s*"email"/);
    assert.match(loginHelperSource, /id:\s*"password"/);
    assert.equal(loginHelperSource.match(/tapOn:\s*"Giris yap\|Sign In"/g)?.length, 1);
    assert.match(
      loginHelperSource,
      /tapOn:\s*"Giris yap\|Sign In"[\s\S]*?extendedWaitUntil:[\s\S]*?id:\s*"mobile-bottom-tab-settings"[\s\S]*?- tapOn:[\s\S]*?id:\s*"mobile-bottom-tab-settings"/,
    );
    assert.doesNotMatch(loginHelperSource, /retry/i);
    assert.match(loginHelperSource, /id:\s*"mobile-bottom-tab-settings"/);
    assert.match(
      loginHelperSource,
      /id:\s*"mobile-bottom-tab-settings"[\s\S]*?id:\s*"mobile-settings-open-account"[\s\S]*?id:\s*"mobile-settings-account"[\s\S]*?id:\s*"mobile-settings-sign-out-action"/,
    );
    assert.match(loginHelperSource, /id:\s*"mobile-settings-sign-out-action"/);
    assert.match(
      loginHelperSource,
      /id:\s*"mobile-settings-sign-out-action"[\s\S]*?pressKey:\s*BACK[\s\S]*?id:\s*"mobile-bottom-tab-overview"/,
    );
    assert.match(loginHelperSource, /id:\s*"mobile-bottom-tab-overview"/);
    assert.match(loginHelperSource, /id:\s*"mobile-overview-screen"/);

    for (const source of [flowSource, darkModeFlowSource]) {
      assert.match(source, /file:\s*"helpers\/login-uat\.yml"/);
      assert.doesNotMatch(source, /MAESTRO_UAT_(?:EMAIL|PASSWORD)/);
      assert.doesNotMatch(source, /WHISPR_MOBILE_E2E_(?:EMAIL|PASSWORD)/);
      assert.doesNotMatch(source, /tapOn:\s*"Giris yap"/);
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
      "mobile-voice-screen": "src/app/screens/voice-screen.tsx",
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
    for (const tabId of ["overview", "messages", "notifications", "voice", "settings"]) {
      assert.match(darkModeFlowSource, new RegExp(`id:\\s*"mobile-bottom-tab-${tabId}"`));
    }
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
    for (const action of ["More emoji", "Reply", "Edit", "Open thread", "Delete"]) {
      assert.match(phase2FlowSource, new RegExp(action));
    }
    assert.ok(
      (phase2FlowSource.match(/id:\s*"mobile-message-actions-\.\*-trigger"/g)?.length ?? 0) >= 4,
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
      /id:\s*"mobile-dm-details-screen"[\s\S]*?id:\s*"mobile-dm-details-participant"[\s\S]*?light-dm-details/,
    );
    assert.match(
      phase3FlowSource,
      /id:\s*"mobile-gif-picker-panel"[\s\S]*?id:\s*"mobile-gif-image-loaded-\.\*"[\s\S]*?light-gif-picker/,
    );
    const contracts = {
      "mobile-dm-details-open": "src/app/screens/dm-conversation-screen.tsx",
      "mobile-dm-details-screen": "src/dm/mobile-dm-details-screen.tsx",
      "mobile-dm-gif-button": "src/app/composer/mobile-composer.tsx",
      "mobile-gif-picker-panel": "src/media/mobile-gif-picker.tsx",
      "mobile-settings-open-2fa": "src/app/screens/settings-screen.tsx",
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
      "light-dm-details",
      "light-gif-picker",
      "light-security",
      "dark-dm-details",
    ]) {
      assert.match(phase3FlowSource, new RegExp(`artifacts/mobile/phase3/closure/${screenshot}`));
    }
    assert.ok(MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-phase3-social"));
  });

  it("binds the Phase 4 server-management flow to safe, contextual test IDs", () => {
    assert.ok(phase4FlowSource, ".maestro/phase4-server-management.yml must exist");
    assert.match(
      phase4FlowSource,
      /text:\s*"http:\/\/\.\*:8081"[\s\S]*?extendedWaitUntil:[\s\S]*?id:\s*"mobile-bottom-tab-settings"[\s\S]*?openLink:\s*"whispr:\/\/settings"/,
    );
    assert.match(phase4FlowSource, /file:\s*"helpers\/login-uat\.yml"/);
    assert.match(phase4FlowSource, /tapOn:\s*"Acik\|Light"/);
    assert.match(phase4FlowSource, /tapOn:\s*"Koyu\|Dark"/);
    for (const themeChoice of ["Acik\\|Light", "Koyu\\|Dark"]) {
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
    assert.equal(
      phase4FlowSource.match(/- tapOn:\s*"\.\*: Phase4 Maestro UAT"/g)?.length,
      3,
    );
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
      /id:\s*"mobile-server-icon-picker"[\s\S]{0,220}?visible:\s*"Photos\|Fotograflar\|Fotoğraflar"[\s\S]{0,180}?point:\s*"16%,58%"[\s\S]{0,120}?"Done\|Bitti\|Tamam"[\s\S]{0,320}?text:\s*"Server settings saved\.\|Sunucu ayarları kaydedildi\."[\s\S]{0,220}?id:\s*"mobile-server-icon-picker"[\s\S]{0,180}?light-server-management/,
    );
    assert.doesNotMatch(phase4FlowSource, /visible:\s*"phase4-avatar"/);
    assert.match(
      phase4FlowSource,
      /id:\s*"mobile-server-invite-share-\.\*"[\s\S]{0,220}?visible:\s*"Sharing link\|Baglanti paylas\|Bağlantı paylaş"[\s\S]{0,160}?pressKey:\s*BACK[\s\S]{0,180}?visible:[\s\S]{0,80}?id:\s*"mobile-overview-screen"/,
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
      assert.match(phase4FlowSource, new RegExp(`id:\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
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
      assert.match(readFileSync(path.join(process.cwd(), sourcePath), "utf8"), new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.ok(
      MOBILE_AUTOMATED_GATES.some((gate) => gate.id === "mobile-maestro-phase4-server-management"),
    );
  });
});
