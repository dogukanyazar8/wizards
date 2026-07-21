import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getMobileRuntimeConfig } from "../src/config/environment";
import { WHISPR_MOBILE_APP_IDENTITY } from "../src/release/mobile-store-contract";

/**
 * Prints everything the Google Cloud OAuth client needs for the native sign-in
 * sheet, so registering a build never turns into a guessing game. Read-only.
 */
const DEBUG_KEYSTORE_PATH = path.join(__dirname, "..", "android", "app", "debug.keystore");
const KEYTOOL_CANDIDATES = [
  process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "keytool") : null,
  "C:/Program Files/Android/Android Studio/jbr/bin/keytool.exe",
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool",
  "keytool",
].filter((candidate): candidate is string => Boolean(candidate));

/**
 * Node does not read `.env.local`, but Expo's dev bundling does — reproduce it
 * here so the report matches what a Metro run would inline. Values already in
 * the environment (an EAS/CI export) win.
 */
function loadMobileDotEnvIntoProcess() {
  for (const fileName of [".env.local", ".env"]) {
    const envFile = path.join(__dirname, "..", fileName);

    if (!existsSync(envFile)) {
      continue;
    }

    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      const separatorIndex = trimmed.indexOf("=");

      if (!trimmed || trimmed.startsWith("#") || separatorIndex < 1) {
        continue;
      }

      const name = trimmed.slice(0, separatorIndex).trim();
      if (!name.startsWith("EXPO_PUBLIC_") || process.env[name] !== undefined) {
        continue;
      }

      process.env[name] = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

function findKeystoreSha1(): string | null {
  if (!existsSync(DEBUG_KEYSTORE_PATH)) {
    return null;
  }

  for (const keytool of KEYTOOL_CANDIDATES) {
    const result = spawnSync(
      keytool,
      [
        "-list",
        "-v",
        "-keystore",
        DEBUG_KEYSTORE_PATH,
        "-storepass",
        "android",
        "-alias",
        "androiddebugkey",
      ],
      { encoding: "utf8" },
    );

    const sha1 = /SHA1:\s*([0-9A-F:]{59})/i.exec(result.stdout ?? "")?.[1];
    if (sha1) {
      return sha1;
    }
  }

  return null;
}

loadMobileDotEnvIntoProcess();

const config = getMobileRuntimeConfig();
const sha1 = findKeystoreSha1();
const easProfilesWithClientId = Object.entries(
  (
    JSON.parse(readFileSync(path.join(__dirname, "..", "eas.json"), "utf8")) as {
      build: Record<string, { env?: Record<string, string> }>;
    }
  ).build,
)
  .filter(([, definition]) => Boolean(definition.env?.EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID))
  .map(([profile]) => profile);

console.log("Whispr mobile — native Google sign-in setup\n");
console.log(`  environment          ${config.environment}`);
console.log(`  android package      ${WHISPR_MOBILE_APP_IDENTITY.androidPackage}`);
console.log(
  `  signing SHA-1        ${sha1 ?? "unavailable (install a JDK or run inside Android Studio's shell)"}`,
);
console.log(
  `  web client id        ${
    config.googleWebClientId
      ? `configured (…${config.googleWebClientId.slice(-30)})`
      : "MISSING — set EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID"
  }`,
);
console.log(
  `  native sheet         ${config.googleWebClientId ? "armed" : "falls back to the in-app browser hand-off"}`,
);
console.log(
  `  eas profiles         ${easProfilesWithClientId.length > 0 ? easProfilesWithClientId.join(", ") : "none — cloud builds would ship without the client id"}`,
);
console.log(
  "\nNote: EXPO_PUBLIC_* values are inlined at bundle time. A build pipeline that does not export",
);
console.log(
  "them ships an APK without them, and the app silently falls back to the browser hand-off.",
);
console.log("\nGoogle Cloud checklist (same project as the web GOOGLE_CLIENT_ID):");
console.log("  1. OAuth client · type Android · package + SHA-1 exactly as printed above.");
console.log(
  "  2. Keep using the existing *Web* client id as EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID.",
);
console.log("  3. Rebuild the dev client / APK so the native module is linked.");

if (!config.googleWebClientId || !sha1) {
  process.exitCode = 1;
}
