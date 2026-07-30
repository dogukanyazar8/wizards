import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";

const service = import("./admin-release-service");

describe("admin release service", () => {
  it("rejects a version change after publication with 409", async () => {
    const { updateAdminRelease } = await service;
    let updated = false;

    await assert.rejects(
      () =>
        updateAdminRelease(
          "release-1",
          { version: "0.9.0" },
          {
            findReleaseForUpdate: async () => ({
              publishedAt: new Date("2026-07-30T09:00:00.000Z"),
              version: "0.8.15",
            }),
            updateRelease: async () => {
              updated = true;
              throw new Error("must not update");
            },
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        "status" in error &&
        error.status === 409 &&
        "code" in error &&
        error.code === "PUBLISHED_RELEASE_VERSION_IMMUTABLE",
    );

    assert.equal(updated, false);
  });

  it("replaces changes in order inside one transaction", async () => {
    const { replaceAdminReleaseChanges } = await service;
    const operations: string[] = [];
    const created: unknown[] = [];
    let transactionCount = 0;

    const result = await replaceAdminReleaseChanges(
      "release-1",
      [
        { detail: "İlk ayrıntı", title: "İlk", type: "NEW" },
        { detail: null, title: "İkinci", type: "FIXED" },
      ],
      {
        transaction: async (operation) => {
          transactionCount += 1;

          return operation({
            createManyChanges: async (data) => {
              operations.push("create");
              created.push(...data);
            },
            deleteChanges: async (releaseId) => {
              operations.push(`delete:${releaseId}`);
            },
            findRelease: async (releaseId) => {
              operations.push(`find:${releaseId}`);
              return { id: releaseId };
            },
          });
        },
      },
    );

    assert.equal(transactionCount, 1);
    assert.deepEqual(operations, ["find:release-1", "delete:release-1", "create"]);
    assert.deepEqual(created, [
      {
        detail: "İlk ayrıntı",
        position: 0,
        releaseId: "release-1",
        title: "İlk",
        type: "NEW",
      },
      {
        detail: null,
        position: 1,
        releaseId: "release-1",
        title: "İkinci",
        type: "FIXED",
      },
    ]);
    assert.deepEqual(result, { changes: created });
  });

  it("rolls back the staged deletion when inserting a replacement fails", async () => {
    const { replaceAdminReleaseChanges } = await service;
    const persisted = [{ title: "Eski" }];

    await assert.rejects(
      () =>
        replaceAdminReleaseChanges(
          "release-1",
          [{ detail: null, title: "Yeni", type: "IMPROVED" }],
          {
            transaction: async (operation) => {
              const staged = [...persisted];

              try {
                const result = await operation({
                  createManyChanges: async () => {
                    staged.push({ title: "Yeni" });
                    throw new Error("insert failed");
                  },
                  deleteChanges: async () => {
                    staged.length = 0;
                  },
                  findRelease: async () => ({ id: "release-1" }),
                });

                persisted.splice(0, persisted.length, ...staged);
                return result;
              } catch (error) {
                throw error;
              }
            },
          },
        ),
      /insert failed/u,
    );

    assert.deepEqual(persisted, [{ title: "Eski" }]);
  });
});
