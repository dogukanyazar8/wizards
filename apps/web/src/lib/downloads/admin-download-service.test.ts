import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import {
  createAdminDownloadArtifact,
  deleteAdminDownloadArtifact,
  isDownloadUniqueViolation,
  listAdminDownloadArtifacts,
  updateAdminDownloadArtifact,
  type AdminDownloadServiceDependencies,
} from "./admin-download-service";

const now = new Date("2026-08-26T09:00:00.000Z");

const row = {
  buildLabel: "1187",
  channel: "STABLE" as const,
  createdAt: now,
  delivery: "DIRECT" as const,
  extensionLabelEn: ".exe",
  extensionLabelTr: ".exe",
  id: "artifact-1",
  metaLabelEn: "Windows 10/11",
  metaLabelTr: "Windows 10/11",
  platform: "WINDOWS" as const,
  publishedAt: null,
  releasedAt: now,
  sha256: null,
  sizeBytes: BigInt(96_000_000),
  updatedAt: now,
  url: "https://updates.whispr.team/desktop/stable/Whispr-2.4.1.exe",
  versionLabel: "2.4.1",
};

const input = {
  buildLabel: "1187",
  channel: "STABLE" as const,
  delivery: "DIRECT" as const,
  extensionLabelEn: ".exe",
  extensionLabelTr: ".exe",
  metaLabelEn: "Windows 10/11",
  metaLabelTr: "Windows 10/11",
  platform: "WINDOWS" as const,
  releasedAt: "2026-08-26T09:00:00.000Z",
  url: "https://updates.whispr.team/desktop/stable/Whispr-2.4.1.exe",
  versionLabel: "2.4.1",
};

function dependencies(
  overrides: Partial<AdminDownloadServiceDependencies> = {},
): AdminDownloadServiceDependencies {
  return {
    create: async () => row,
    findMany: async () => [row],
    isUniqueViolation: isDownloadUniqueViolation,
    now: () => now,
    remove: async () => undefined,
    update: async () => row,
    ...overrides,
  };
}

describe("admin download catalog service", () => {
  it("serialises dates and turns the BigInt size into a number", async () => {
    const { artifacts } = await listAdminDownloadArtifacts(dependencies());

    assert.equal(artifacts[0]?.sizeBytes, 96_000_000);
    assert.equal(artifacts[0]?.releasedAt, "2026-08-26T09:00:00.000Z");
    assert.equal(artifacts[0]?.publishedAt, null);
  });

  it("creates a draft row: publishing is a separate, explicit act", async () => {
    let written: Prisma.DownloadArtifactUncheckedCreateInput | null = null;
    await createAdminDownloadArtifact(
      input,
      dependencies({
        create: async (data) => {
          written = data;
          return row;
        },
      }),
    );

    assert.ok(written);
    assert.equal("publishedAt" in (written as object), false);
    assert.deepEqual((written as Prisma.DownloadArtifactUncheckedCreateInput).sizeBytes, null);
  });

  it("reports a second package for the same environment and platform as a conflict", async () => {
    await assert.rejects(
      () =>
        createAdminDownloadArtifact(
          input,
          dependencies({
            create: async () => {
              throw { code: "P2002" };
            },
          }),
        ),
      (error) => error instanceof ApiError && error.status === 409,
    );
  });

  it("stamps publishedAt when published and clears it when withdrawn", async () => {
    const writes: Prisma.DownloadArtifactUncheckedUpdateInput[] = [];
    const capture = dependencies({
      update: async (_id, data) => {
        writes.push(data);
        return row;
      },
    });

    await updateAdminDownloadArtifact("artifact-1", { published: true }, capture);
    await updateAdminDownloadArtifact("artifact-1", { published: false }, capture);

    assert.deepEqual(writes[0]?.publishedAt, now);
    assert.equal(writes[1]?.publishedAt, null);
  });

  it("never sends an undefined field to the database", async () => {
    const writes: Prisma.DownloadArtifactUncheckedUpdateInput[] = [];
    await updateAdminDownloadArtifact(
      "artifact-1",
      { versionLabel: "2.4.2" },
      dependencies({
        update: async (_id, data) => {
          writes.push(data);
          return row;
        },
      }),
    );

    const written = writes[0] ?? {};
    assert.deepEqual(Object.keys(written), ["versionLabel"]);
    assert.equal(
      Object.values(written).some((value) => value === undefined),
      false,
    );
  });

  it("answers 404 when the row is gone", async () => {
    await assert.rejects(
      () =>
        updateAdminDownloadArtifact(
          "missing",
          { versionLabel: "2.4.2" },
          dependencies({ update: async () => null }),
        ),
      (error) => error instanceof ApiError && error.status === 404,
    );
  });

  it("answers 404 for Prisma's missing-row error during an edit", async () => {
    await assert.rejects(
      () =>
        updateAdminDownloadArtifact(
          "missing",
          { versionLabel: "2.4.2" },
          dependencies({
            update: async () => {
              throw { code: "P2025" };
            },
          }),
        ),
      (error) => error instanceof ApiError && error.status === 404,
    );
  });

  it("updates all editable metadata and clears optional fields without changing publication", async () => {
    let written: Prisma.DownloadArtifactUncheckedUpdateInput | undefined;
    await updateAdminDownloadArtifact(
      "artifact-1",
      {
        ...input,
        channel: "UAT",
        platform: "ANDROID",
        delivery: "STORE",
        buildLabel: null,
        sizeBytes: null,
        sha256: null,
      },
      dependencies({
        update: async (_id, data) => {
          written = data;
          return row;
        },
      }),
    );
    assert.ok(written);
    assert.equal(written.channel, "UAT");
    assert.equal(written.platform, "ANDROID");
    assert.equal(written.delivery, "STORE");
    assert.equal(written.sizeBytes, null);
    assert.equal(written.sha256, null);
    assert.equal(written.buildLabel, null);
    assert.deepEqual(written.releasedAt, new Date(input.releasedAt));
    assert.equal("publishedAt" in written, false);
  });

  it("deletes by id", async () => {
    const removed: string[] = [];
    const result = await deleteAdminDownloadArtifact(
      "artifact-1",
      dependencies({
        remove: async (id) => {
          removed.push(id);
        },
      }),
    );

    assert.deepEqual(result, { deleted: true });
    assert.deepEqual(removed, ["artifact-1"]);
  });
});
