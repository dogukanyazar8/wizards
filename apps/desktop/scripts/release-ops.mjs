import { pathToFileURL } from "node:url";

export const DESKTOP_RELEASE_RINGS = Object.freeze(["dev", "uat", "canary", "stable"]);

export const DESKTOP_REQUIRED_SMOKE_TESTS = Object.freeze([
  {
    id: "launch",
    label: "Launch",
    requiredOn: "windows",
    description: "Start the desktop shell and confirm the configured web origin renders.",
  },
  {
    id: "auth-restore",
    label: "Auth restore",
    requiredOn: "windows",
    description: "Reopen the app and confirm remember-me/session restoration works as expected.",
  },
  {
    id: "close-to-tray",
    label: "Close to tray",
    requiredOn: "windows",
    description: "Close the main window, keep the tray process alive, and restore from tray.",
  },
  {
    id: "updater-check-mock",
    label: "Updater check mock",
    requiredOn: "windows",
    description: "Run a signed-update check against a mocked HTTPS latest.json manifest.",
  },
  {
    id: "shortcut-registration",
    label: "Shortcut registration",
    requiredOn: "windows",
    description: "Register, trigger, and unregister desktop voice shortcuts without broad permissions.",
  },
  {
    id: "overlay-show-hide",
    label: "Overlay show/hide",
    requiredOn: "windows",
    description: "Show, hide, repair, and panic-disable companion overlay surfaces.",
  },
]);

export const DESKTOP_PERFORMANCE_BUDGETS = Object.freeze({
  warmStartMs: 2000,
  memoryMb: 220,
  overlayCpuPercent: 3,
  shortcutLatencyMs: 50,
});

export const DESKTOP_RELEASE_SAFETY_RULES = Object.freeze([
  {
    id: "no-broad-native-permissions",
    description: "Do not grant broad filesystem, shell, or process Tauri permissions.",
  },
  {
    id: "signed-updater-only",
    description: "Do not enable updater distribution without Ed25519 signatures and HTTPS manifests.",
  },
  {
    id: "no-native-game-hooks",
    description: "Do not add native game hooks without dedicated anti-cheat research and review.",
  },
  {
    id: "no-hardware-encode-claims",
    description: "Do not present hardware encode as guaranteed; WebRTC/WebView owns encoder choice.",
  },
  {
    id: "no-desktop-secrets",
    description: "Do not store tokens, session secrets, private keys, or server credentials in desktop code.",
  },
  {
    id: "no-fake-security-ui",
    description: "Do not show privacy or security controls as active unless backend enforcement exists.",
  },
  {
    id: "overlay-voice-only",
    description: "Do not send messages, DMs, emails, invite links, or private content to overlay windows.",
  },
]);

export function getDesktopReleaseOpsContract() {
  return {
    releaseRings: [...DESKTOP_RELEASE_RINGS],
    smokeTests: DESKTOP_REQUIRED_SMOKE_TESTS.map((test) => ({ ...test })),
    performanceBudgets: { ...DESKTOP_PERFORMANCE_BUDGETS },
    safetyRules: DESKTOP_RELEASE_SAFETY_RULES.map((rule) => ({ ...rule })),
    platformMatrix: {
      windows: "mandatory",
      macos: "staged",
      linux: "staged",
    },
  };
}

export function assertDesktopReleaseOpsContract(contract = getDesktopReleaseOpsContract()) {
  assertArrayEquals(contract.releaseRings, ["dev", "uat", "canary", "stable"], "release rings");

  const smokeIds = new Set(contract.smokeTests.map((test) => test.id));
  for (const requiredId of DESKTOP_REQUIRED_SMOKE_TESTS.map((test) => test.id)) {
    assertCondition(smokeIds.has(requiredId), `Missing desktop smoke test: ${requiredId}`);
  }

  for (const test of contract.smokeTests) {
    assertCondition(
      test.requiredOn === "windows",
      `Desktop smoke test ${test.id} must be mandatory on Windows.`,
    );
    assertCondition(
      typeof test.description === "string" && test.description.length >= 20,
      `Desktop smoke test ${test.id} needs a practical description.`,
    );
  }

  const budgets = contract.performanceBudgets;
  assertPositiveBudget(budgets.warmStartMs, "warmStartMs", 2500);
  assertPositiveBudget(budgets.memoryMb, "memoryMb", 256);
  assertPositiveBudget(budgets.overlayCpuPercent, "overlayCpuPercent", 5);
  assertPositiveBudget(budgets.shortcutLatencyMs, "shortcutLatencyMs", 75);

  const safetyRuleIds = new Set(contract.safetyRules.map((rule) => rule.id));
  for (const requiredRule of DESKTOP_RELEASE_SAFETY_RULES.map((rule) => rule.id)) {
    assertCondition(safetyRuleIds.has(requiredRule), `Missing desktop safety rule: ${requiredRule}`);
  }

  assertCondition(contract.platformMatrix.windows === "mandatory", "Windows desktop CI must be mandatory.");
  assertCondition(contract.platformMatrix.macos === "staged", "macOS desktop CI must be staged.");
  assertCondition(contract.platformMatrix.linux === "staged", "Linux desktop CI must be staged.");

  return contract;
}

function assertArrayEquals(actual, expected, label) {
  assertCondition(Array.isArray(actual), `${label} must be an array.`);
  assertCondition(
    actual.length === expected.length && actual.every((entry, index) => entry === expected[index]),
    `${label} must be exactly: ${expected.join(", ")}.`,
  );
}

function assertPositiveBudget(value, name, maxValue) {
  assertCondition(Number.isFinite(value) && value > 0, `${name} must be a positive number.`);
  assertCondition(value <= maxValue, `${name} budget ${value} exceeds allowed maximum ${maxValue}.`);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const contract = assertDesktopReleaseOpsContract();
    console.log(JSON.stringify(contract, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
