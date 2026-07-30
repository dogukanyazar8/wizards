import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMobileReleaseEvidence,
  validateMobileReleaseEvidence,
} from "../src/release/mobile-release-evidence";
import type { MobileReleaseProfileConfig } from "../src/release/mobile-release-contract";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readOutPath(): string {
  const index = process.argv.indexOf("--out");

  if (index >= 0) {
    const value = process.argv[index + 1];

    if (!value?.trim()) {
      throw new Error("--out requires a file path.");
    }

    return resolve(process.cwd(), value);
  }

  return resolve(__dirname, "../artifacts/mobile-release-evidence.json");
}

const eas = readJson<{
  build: Record<string, MobileReleaseProfileConfig>;
  cli: { appVersionSource: string };
}>(resolve(__dirname, "../eas.json"));
const mobilePackage = readJson<{ version: string }>(resolve(__dirname, "../package.json"));
const rootPackage = readJson<{ version: string }>(resolve(__dirname, "../../../package.json"));

const evidence = buildMobileReleaseEvidence({
  appVersionSource: eas.cli.appVersionSource,
  easBuildProfiles: eas.build,
  packageVersion: mobilePackage.version,
  rootVersion: rootPackage.version,
});
const issues = validateMobileReleaseEvidence(evidence);
const outPath = readOutPath();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      blockers: issues,
      generatedAt: evidence.generatedAt,
      manualQaChecks: evidence.manualQa.length,
      nativeCapabilities: evidence.nativeCapabilities.length,
      outPath,
      releaseProfiles: evidence.releaseProfiles.map((profile) => profile.name),
      schemaVersion: evidence.schemaVersion,
    },
    null,
    2,
  ),
);

if (issues.length > 0) {
  process.exitCode = 1;
}
