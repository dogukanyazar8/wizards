import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [mode, output, root] = process.argv.slice(2);
let publication;
if (mode === "desktop") {
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((item) => item.isFile())
    .map((item) => join(item.parentPath, item.name));
  const one = (name) => {
    const matches = files.filter((file) => file.endsWith(name));
    if (matches.length !== 1) throw new Error(`Expected one ${name}, found ${matches.length}`);
    return matches[0];
  };
  const metadata = JSON.parse(await readFile(one("desktop-build-metadata.json"), "utf8"));
  const manifest = JSON.parse(await readFile(one("latest.json"), "utf8"));
  const installer = metadata.artifacts.installer;
  const platform = manifest.platforms["windows-x86_64"];
  if (
    !platform ||
    metadata.version !== manifest.version ||
    !platform.url.endsWith(`/${installer.filename}`)
  )
    throw new Error("Desktop build metadata differs from signed manifest");
  publication = {
    product: "DESKTOP",
    channel: metadata.releaseRing === "uat" ? "UAT" : "STABLE",
    version: metadata.version,
    packages: [
      {
        platform: "WINDOWS",
        arch: "x86_64",
        url: platform.url,
        signature: platform.signature,
        sha256: installer.sha256,
        sizeBytes: installer.sizeBytes,
      },
    ],
  };
} else if (mode === "android") {
  publication = {
    product: "MOBILE",
    channel: "UAT",
    version: process.env.RELEASE_VERSION,
    packages: [
      {
        platform: "ANDROID",
        arch: "universal",
        url: `https://updates.whispr.team/${process.env.ARTIFACT_KEY}`,
        sha256: process.env.ARTIFACT_SHA256,
        sizeBytes: Number(process.env.ARTIFACT_SIZE),
        versionCode: Number(process.env.ARTIFACT_VERSION_CODE),
        signingCertSha256: process.env.ARTIFACT_CERT_SHA256,
      },
    ],
  };
} else throw new Error("Expected desktop or android mode");
publication.sourceSha = process.env.GITHUB_SHA;
publication.sourceRunId = process.env.GITHUB_RUN_ID;
await writeFile(output, `${JSON.stringify(publication, null, 2)}\n`);
