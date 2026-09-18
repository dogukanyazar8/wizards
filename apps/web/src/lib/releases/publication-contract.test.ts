import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PublicationSchema,
  publicationDigest,
  comparePublicationVersions,
} from "./publication-contract";

export const publication = {
  product: "DESKTOP",
  channel: "UAT",
  version: "1.2.3",
  sourceSha: "a".repeat(40),
  sourceRunId: "123",
  baselineSha: null,
  changes: [{ type: "FIXED", title: "Voice overlay restored" }],
  packages: [
    {
      platform: "WINDOWS",
      arch: "x86_64",
      url: "https://updates.whispr.team/desktop/uat/releases/desktop-v1.2.3-uat/Whispr.exe",
      sha256: "b".repeat(64),
      sizeBytes: 100,
      signature: "c2lnbmF0dXJl",
    },
  ],
};

test("publication accepts only complete immutable packages for its product/channel", () => {
  assert.equal(PublicationSchema.parse(publication).product, "DESKTOP");
  for (const patch of [
    { packages: [] },
    { packages: [{ ...publication.packages[0], signature: undefined }] },
    { packages: [{ ...publication.packages[0], url: "https://evil.test/package.exe" }] },
    {
      packages: [
        {
          ...publication.packages[0],
          url: "https://updates.whispr.team/desktop/stable/releases/v1/a.exe",
        },
      ],
    },
    { product: "MOBILE" },
    { sourceSha: "main" },
  ])
    assert.equal(PublicationSchema.safeParse({ ...publication, ...patch }).success, false);
});

test("publication digest ignores regenerated notes/run but binds bytes and source", () => {
  const first = PublicationSchema.parse(publication);
  assert.equal(
    publicationDigest(first),
    publicationDigest({ ...first, changes: [], sourceRunId: "999" }),
  );
  assert.notEqual(
    publicationDigest(first),
    publicationDigest({ ...first, sourceSha: "d".repeat(40) }),
  );
});

test("Android certificate fingerprints normalize to the database representation", () => {
  const canonical = Array(32).fill("AB").join(":");
  for (const fingerprint of ["ab".repeat(32), canonical.toLowerCase(), canonical]) {
    const parsed = PublicationSchema.parse({
      ...publication,
      product: "MOBILE",
      packages: [
        {
          platform: "ANDROID",
          arch: "universal",
          url: "https://updates.whispr.team/mobile/uat/releases/v1.2.3/Whispr.apk",
          sha256: "b".repeat(64),
          sizeBytes: 100,
          versionCode: 123,
          signingCertSha256: fingerprint,
        },
      ],
    });
    assert.equal(parsed.packages[0]?.signingCertSha256, canonical);
  }
});

test("version order handles prereleases and rejects ambiguous semver", () => {
  assert.equal(comparePublicationVersions("1.2.3-beta.10", "1.2.3-beta.2"), 1);
  assert.equal(comparePublicationVersions("1.2.3", "1.2.3-beta.10"), 1);
  assert.equal(comparePublicationVersions("1.2.3", "1.3.0"), -1);
  assert.equal(PublicationSchema.safeParse({ ...publication, version: "01.2.3" }).success, false);
});
