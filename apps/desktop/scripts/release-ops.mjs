import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");

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
    id: "updater-feed-preflight",
    label: "Updater feed preflight",
    requiredOn: "windows",
    description:
      "Validate the signed latest.json manifest, platform entry, artifact URL, and signature before release promotion.",
  },
  {
    id: "release-audit-report",
    label: "Release audit report",
    requiredOn: "windows",
    description:
      "Generate a redacted release audit report with ring, version, artifact hash, updater feed, and safety contract checks.",
  },
  {
    id: "release-promotion-bundle",
    label: "Release promotion bundle",
    requiredOn: "windows",
    description:
      "Generate redacted JSON and Markdown promotion evidence before moving a signed desktop update between release rings.",
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

export function getDesktopVersionContract(projectRoot = repoRoot) {
  const rootPackage = readJson(path.join(projectRoot, "package.json"));
  const webPackage = readJson(path.join(projectRoot, "apps", "web", "package.json"));
  const desktopPackage = readJson(path.join(projectRoot, "apps", "desktop", "package.json"));
  const tauriConfig = readJson(
    path.join(projectRoot, "apps", "desktop", "src-tauri", "tauri.conf.json"),
  );
  const cargoToml = readText(
    path.join(projectRoot, "apps", "desktop", "src-tauri", "Cargo.toml"),
  );

  const rootPackageVersion = String(rootPackage.version ?? "");
  const webPackageVersion = String(webPackage.version ?? "");
  const desktopPackageVersion = String(desktopPackage.version ?? "");
  const tauriConfigVersion = String(tauriConfig.version ?? "");
  const cargoPackageVersion = parseCargoPackageVersion(cargoToml);

  return {
    cargoPackageVersion,
    desktopNativeVersion: desktopPackageVersion,
    desktopPackageVersion,
    rootPackageVersion,
    tauriConfigVersion,
    webPackageVersion,
    webRuntimeVersion: webPackageVersion,
  };
}

export function getDesktopReleaseOpsContract() {
  return {
    releaseRings: [...DESKTOP_RELEASE_RINGS],
    smokeTests: DESKTOP_REQUIRED_SMOKE_TESTS.map((test) => ({ ...test })),
    performanceBudgets: { ...DESKTOP_PERFORMANCE_BUDGETS },
    safetyRules: DESKTOP_RELEASE_SAFETY_RULES.map((rule) => ({ ...rule })),
    versionContract: getDesktopVersionContract(),
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
  assertDesktopVersionContract(contract.versionContract);

  return contract;
}

export function assertDesktopVersionContract(contract = getDesktopVersionContract()) {
  assertSemverLike(contract.rootPackageVersion, "root package version");
  assertSemverLike(contract.webPackageVersion, "web package version");
  assertSemverLike(contract.desktopPackageVersion, "desktop package version");
  assertSemverLike(contract.tauriConfigVersion, "Tauri config version");
  assertSemverLike(contract.cargoPackageVersion, "Cargo package version");

  assertCondition(
    contract.rootPackageVersion === contract.webPackageVersion,
    `Root package version (${contract.rootPackageVersion}) must match web package version (${contract.webPackageVersion}).`,
  );
  assertCondition(
    contract.desktopPackageVersion === contract.tauriConfigVersion,
    `Desktop package version (${contract.desktopPackageVersion}) must match Tauri config version (${contract.tauriConfigVersion}).`,
  );
  assertCondition(
    contract.desktopPackageVersion === contract.cargoPackageVersion,
    `Desktop package version (${contract.desktopPackageVersion}) must match Cargo package version (${contract.cargoPackageVersion}).`,
  );
  assertCondition(
    contract.desktopNativeVersion === contract.desktopPackageVersion,
    "Desktop native version must be sourced from the desktop package version.",
  );
  assertCondition(
    contract.webRuntimeVersion === contract.webPackageVersion,
    "Web runtime version must be sourced from the web package version.",
  );

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

function assertSemverLike(value, label) {
  assertCondition(typeof value === "string" && value.length > 0, `${label} must be present.`);
  assertCondition(
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value),
    `${label} (${value}) must be semver-like.`,
  );
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function parseCargoPackageVersion(cargoToml) {
  let inPackageSection = false;

  for (const line of cargoToml.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed === "[package]") {
      inPackageSection = true;
      continue;
    }

    if (inPackageSection && trimmed.startsWith("[") && trimmed.endsWith("]")) {
      break;
    }

    if (inPackageSection) {
      const version = trimmed.match(/^version\s*=\s*"([^"]+)"/)?.[1];
      if (version) {
        return version;
      }
    }
  }

  throw new Error("Cargo package version could not be read.");
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
