import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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

const config = getMobileRuntimeConfig();
const sha1 = findKeystoreSha1();

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
console.log("\nGoogle Cloud checklist (same project as the web GOOGLE_CLIENT_ID):");
console.log("  1. OAuth client · type Android · package + SHA-1 exactly as printed above.");
console.log(
  "  2. Keep using the existing *Web* client id as EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID.",
);
console.log("  3. Rebuild the dev client / APK so the native module is linked.");

if (!config.googleWebClientId || !sha1) {
  process.exitCode = 1;
}
