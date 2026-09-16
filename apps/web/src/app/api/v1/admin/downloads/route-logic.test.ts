import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, parseJsonBody } from "@/lib/api";
import type {
  AdminDownloadArtifact,
  AdminDownloadArtifactInput,
} from "@/lib/downloads/admin-download-service";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/whispr_test";
const collection = import("./route-logic");
const detail = import("./[artifactId]/route-logic");
const admin = {
  id: "admin-1",
  role: "ADMIN" as const,
  email: "admin@example.test",
  username: "admin",
};
const input = {
  channel: "UAT" as const,
  platform: "WINDOWS" as const,
  delivery: "DIRECT" as const,
  url: "https://downloads.example.test/uat/setup.exe",
  versionLabel: "1.2.3",
  buildLabel: null,
  releasedAt: "2026-09-16T09:00:00.000Z",
  extensionLabelTr: ".exe",
  extensionLabelEn: ".exe",
  metaLabelTr: "Windows 11",
  metaLabelEn: "Windows 11",
  sizeBytes: 96_000_000,
  sha256: null,
};
const artifact: AdminDownloadArtifact = {
  ...input,
  id: "artifact-1",
  publishedAt: null,
  createdAt: input.releasedAt,
  updatedAt: input.releasedAt,
};

function request(method: string, body: unknown) {
  return new Request("https://whispr.test/api/v1/admin/downloads", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function dependencies() {
  const calls: string[] = [];
  const audit: unknown[] = [];
  const common = {
    authenticateWrite: async () => admin,
    enforceRateLimit: async () => {
      calls.push("rateLimit");
    },
    parseBody: parseJsonBody,
    writeAuditLog: async (entry: unknown) => {
      audit.push(entry);
    },
  };
  return {
    calls,
    audit,
    collection: {
      ...common,
      authenticateRead: async () => admin,
      list: async () => ({ artifacts: [artifact] }),
      create: async (data: AdminDownloadArtifactInput) => {
        calls.push("create");
        return {
          artifact: {
            ...artifact,
            ...data,
            buildLabel: data.buildLabel ?? null,
            sizeBytes: data.sizeBytes ?? null,
            sha256: data.sha256 ?? null,
          },
        };
      },
    },
    detail: {
      ...common,
      update: async (id: string, data: unknown) => {
        calls.push(`update:${id}`);
        return { artifact: { ...artifact, ...(data as object) } };
      },
      remove: async () => ({ deleted: true as const }),
    },
  };
}

describe("admin download write routes", () => {
  it("creates a validated draft and records its environment and platform in the audit", async () => {
    const deps = dependencies();
    const response = await (
      await collection
    ).adminDownloadCreateRoute(request("POST", input), deps.collection);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).artifact.publishedAt, null);
    assert.deepEqual(deps.calls, ["rateLimit", "create"]);
    assert.equal((deps.audit[0] as { action: string }).action, "admin.download.create");
    assert.deepEqual((deps.audit[0] as { metadata: object }).metadata, {
      channel: "UAT",
      platform: "WINDOWS",
    });
  });

  it("saves an edit against the route id and audits it separately from publication", async () => {
    const deps = dependencies();
    const response = await (
      await detail
    ).adminDownloadUpdateRoute(
      request("PATCH", { url: input.url, sizeBytes: null }),
      {
        params: Promise.resolve({ artifactId: artifact.id }),
      },
      deps.detail,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(deps.calls, ["rateLimit", "update:artifact-1"]);
    assert.equal((deps.audit[0] as { action: string }).action, "admin.download.update");
    assert.equal((await response.json()).artifact.sizeBytes, null);
  });

  for (const method of ["POST", "PATCH"] as const) {
    it(`denies ${method} before parsing or writing when release.write is refused`, async () => {
      const deps = dependencies();
      const reject = async () => {
        throw new ApiError("Forbidden", 403);
      };
      const response =
        method === "POST"
          ? await (
              await collection
            ).adminDownloadCreateRoute(request(method, input), {
              ...deps.collection,
              authenticateWrite: reject,
            })
          : await (
              await detail
            ).adminDownloadUpdateRoute(
              request(method, input),
              { params: Promise.resolve({ artifactId: artifact.id }) },
              { ...deps.detail, authenticateWrite: reject },
            );
      assert.equal(response.status, 403);
      assert.deepEqual(deps.calls, []);
      assert.deepEqual(deps.audit, []);
    });

    it(`rejects non-HTTPS links on ${method} without a write or audit entry`, async () => {
      const deps = dependencies();
      const body = { ...input, url: "javascript:alert(1)" };
      const response =
        method === "POST"
          ? await (
              await collection
            ).adminDownloadCreateRoute(request(method, body), deps.collection)
          : await (
              await detail
            ).adminDownloadUpdateRoute(
              request(method, body),
              { params: Promise.resolve({ artifactId: artifact.id }) },
              deps.detail,
            );
      assert.equal(response.status, 400);
      assert.deepEqual(deps.calls, ["rateLimit"]);
      assert.deepEqual(deps.audit, []);
    });
  }

  it("does not allow draft creation to publish implicitly", async () => {
    const deps = dependencies();
    const response = await (
      await collection
    ).adminDownloadCreateRoute(request("POST", { ...input, published: true }), deps.collection);
    assert.equal(response.status, 400);
    assert.deepEqual(deps.calls, ["rateLimit"]);
  });

  it("returns a uniqueness conflict without claiming a successful audit", async () => {
    const deps = dependencies();
    const response = await (
      await collection
    ).adminDownloadCreateRoute(request("POST", input), {
      ...deps.collection,
      create: async () => {
        throw new ApiError("Conflict", 409, "DOWNLOAD_ARTIFACT_EXISTS");
      },
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "DOWNLOAD_ARTIFACT_EXISTS");
    assert.deepEqual(deps.audit, []);
  });
});
