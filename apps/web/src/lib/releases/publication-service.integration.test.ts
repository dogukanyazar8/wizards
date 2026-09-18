import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

const databaseUrl = process.env.RELEASE_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/release_center_test")
    throw new Error("Only the disposable release_center_test database is allowed");
  process.env.DATABASE_URL = databaseUrl;
}
const enabled = Boolean(databaseUrl);

const db = enabled ? (await import("@wizards/db")).prisma : null;
const service = enabled ? await import("./publication-service") : null;
const { PublicationSchema } = await import("./publication-contract");
const input = (version = "1.0.0", sha = "a", platform = "DESKTOP") =>
  PublicationSchema.parse({
    product: platform,
    channel: "UAT",
    version,
    sourceSha: sha.repeat(40),
    sourceRunId: "123",
    baselineSha: null,
    changes: [{ type: "FIXED", title: "Microphone restored" }],
    packages:
      platform === "DESKTOP"
        ? [
            {
              platform: "WINDOWS",
              arch: "x86_64",
              url: `https://updates.whispr.team/desktop/uat/releases/v${version}/Whispr.exe`,
              sha256: "b".repeat(64),
              sizeBytes: 100,
              signature: "c2lnbmF0dXJl",
            },
          ]
        : [
            {
              platform: "ANDROID",
              arch: "universal",
              url: `https://updates.whispr.team/mobile/uat/releases/v${version}/Whispr.apk`,
              sha256: "b".repeat(64),
              sizeBytes: 100,
              signingCertSha256: "c".repeat(64),
              versionCode: 100,
            },
          ],
  });

beforeEach(async () => {
  if (!db) return;
  await db.downloadArtifact.deleteMany();
  await db.release.deleteMany();
});
after(async () => {
  await db?.$disconnect();
});

test(
  "publication commits notes, catalog and mobile update projection together",
  { skip: !enabled },
  async () => {
    const { releaseId } = await service!.publishRelease(input("1.0.0", "a", "MOBILE"));
    const release = await db!.release.findUniqueOrThrow({
      where: { id: releaseId },
      include: { changes: true, downloads: true, artifacts: true },
    });
    assert.equal(release.changes.length, 1);
    assert.equal(release.downloads[0]!.versionLabel, "1.0.0");
    assert.equal(release.artifacts[0]!.versionCode, 100);
    const mobile = await import("@/lib/app/mobile-update-decision-service");
    assert.equal(release.product, "MOBILE");
    const decision = await mobile.decideMobileUpdate({
      buildEnvironment: "uat",
      channel: "beta",
      installed: "0.9.0",
      platform: "android",
      runtimeVersion: "test",
      versionCode: 99,
    });
    assert.equal(decision.updateKind, "apk");
    assert.equal(decision.androidArtifact?.versionCode, 100);
    await service!.withdrawRelease(releaseId);
    const withdrawn = await mobile.decideMobileUpdate({
      buildEnvironment: "uat",
      channel: "beta",
      installed: "0.9.0",
      platform: "android",
      runtimeVersion: "test",
      versionCode: 99,
    });
    assert.equal(withdrawn.updateKind, "none");
  },
);

test(
  "parallel duplicate publication creates one release and preserves edited notes",
  { skip: !enabled },
  async () => {
    const results = await Promise.all([
      service!.publishRelease(input()),
      service!.publishRelease(input()),
    ]);
    assert.equal(results.filter((result) => result.replay).length, 1);
    assert.equal(await db!.release.count(), 1);
    await db!.releaseChange.updateMany({ data: { title: "Edited by administrator" } });
    await service!.publishRelease(input());
    assert.equal((await db!.releaseChange.findFirst())!.title, "Edited by administrator");
    await assert.rejects(() => service!.publishRelease(input("1.0.0", "c")), /identity/u);
  },
);

test("old or stale publication cannot move downloads backward", { skip: !enabled }, async () => {
  await service!.publishRelease(input());
  await service!.publishRelease({ ...input("1.2.0", "b"), baselineSha: "a".repeat(40) });
  await assert.rejects(
    () => service!.publishRelease({ ...input("1.1.0", "c"), baselineSha: "b".repeat(40) }),
    /increase/u,
  );
  await assert.rejects(
    () => service!.publishRelease({ ...input("1.3.0", "c"), baselineSha: "a".repeat(40) }),
    /baseline/u,
  );
  assert.equal((await db!.downloadArtifact.findFirst())!.versionLabel, "1.2.0");
  assert.equal((await service!.desktopPublicationFeed("UAT"))!.version, "1.2.0");
});

test(
  "withdrawal hides downloads/feed, retains history and cannot be undone by replay",
  { skip: !enabled },
  async () => {
    const result = await service!.publishRelease(input());
    await service!.withdrawRelease(result.releaseId);
    assert.equal((await service!.publishRelease(input())).active, false);
    assert.equal(await service!.desktopPublicationFeed("UAT"), null);
    assert.equal((await db!.downloadArtifact.findFirst())!.publishedAt, null);
    assert.equal(
      (await service!.publicationBaseline({ product: "DESKTOP", channel: "UAT" }))!.sourceSha,
      "a".repeat(40),
    );
    const draft = await db!.release.create({
      data: { product: "DESKTOP", channel: "UAT", version: "1.1.0", releasedAt: new Date() },
    });
    await service!.withdrawRelease(draft.id);
    await assert.rejects(
      () => service!.publishRelease({ ...input("1.1.0", "b"), baselineSha: "a".repeat(40) }),
      /Withdrawn/u,
    );
  },
);

test(
  "same version can publish independently for desktop and mobile",
  { skip: !enabled },
  async () => {
    await service!.publishRelease(input());
    await service!.publishRelease(input("1.0.0", "a", "MOBILE"));
    assert.equal(await db!.release.count(), 2);
    assert.equal(await db!.downloadArtifact.count({ where: { publishedAt: { not: null } } }), 2);
  },
);

test(
  "failed catalog write rolls back release, notes and previous active pointer",
  { skip: !enabled },
  async () => {
    await service!.publishRelease(input());
    await db!
      .$executeRaw`CREATE FUNCTION release_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected projection failure'; END $$`;
    await db!
      .$executeRaw`CREATE TRIGGER release_test_fail BEFORE INSERT OR UPDATE ON "DownloadArtifact" FOR EACH ROW EXECUTE FUNCTION release_test_fail()`;
    try {
      await assert.rejects(
        () => service!.publishRelease({ ...input("1.1.0", "b"), baselineSha: "a".repeat(40) }),
        /injected projection failure/u,
      );
      assert.equal(await db!.release.count(), 1);
      assert.equal((await service!.desktopPublicationFeed("UAT"))!.version, "1.0.0");
      assert.equal((await db!.downloadArtifact.findFirst())!.versionLabel, "1.0.0");
    } finally {
      await db!.$executeRaw`DROP TRIGGER release_test_fail ON "DownloadArtifact"`;
      await db!.$executeRaw`DROP FUNCTION release_test_fail()`;
    }
  },
);

test(
  "consumer history scopes identical versions and hides withdrawals",
  { skip: !enabled },
  async () => {
    const desktop = await service!.publishRelease(input());
    await service!.publishRelease({
      ...input("1.0.0", "a", "MOBILE"),
      changes: [{ type: "NEW", title: "Android update" }],
    });
    const { getMobileRelease, listMobileReleases } = await import("./release-service");
    const mobile = await getMobileRelease("1.0.0", undefined, undefined, {
      product: "MOBILE",
      channel: "UAT",
    });
    assert.equal(mobile!.changes[0]!.title, "Android update");
    const desktopNotes = await getMobileRelease("1.0.0", undefined, undefined, {
      product: "DESKTOP",
      channel: "UAT",
    });
    assert.equal(desktopNotes!.changes[0]!.title, "Microphone restored");
    assert.equal(
      await getMobileRelease("1.0.0", undefined, undefined, {
        product: "DESKTOP",
        channel: "STABLE",
      }),
      null,
    );
    await service!.withdrawRelease(desktop.releaseId);
    assert.equal(
      (await listMobileReleases({ scope: { product: "DESKTOP", channel: "UAT" } })).total,
      0,
    );
    assert.equal(
      (await listMobileReleases({ scope: { product: "MOBILE", channel: "UAT" } })).total,
      1,
    );
  },
);

test(
  "admin cannot mutate/delete managed packages but may edit release notes",
  { skip: !enabled },
  async () => {
    const { releaseId } = await service!.publishRelease(input());
    const admin = await import("./admin-release-service");
    await admin.updateAdminRelease(releaseId, { summary: "Administrator correction" });
    assert.equal(
      (await db!.release.findUniqueOrThrow({ where: { id: releaseId } })).summary,
      "Administrator correction",
    );
    await assert.rejects(
      () => admin.updateAdminRelease(releaseId, { product: "MOBILE" }),
      /cannot be changed/u,
    );
    await assert.rejects(
      () => admin.updateAdminRelease(releaseId, { releasedAt: "2026-01-01T00:00:00Z" }),
      /cannot be changed/u,
    );
    await assert.rejects(() => admin.deleteAdminRelease(releaseId), /Withdraw/u);
    const downloads = await import("@/lib/downloads/admin-download-service");
    const artifact = await db!.downloadArtifact.findFirstOrThrow();
    await assert.rejects(() =>
      downloads.updateAdminDownloadArtifact(artifact.id, { url: "https://example.test/other.exe" }),
    );
    assert.equal((await db!.downloadArtifact.findFirstOrThrow()).url, input().packages[0]!.url);
  },
);
