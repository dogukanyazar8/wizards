import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import {
  acceptClusterSuggestion,
  rejectClusterSuggestion,
  type ClusterServiceStore,
  type ClusterSuggestionDependencies,
} from "@/lib/feedback/cluster-service";

function harness(overrides: { status?: string; suggestion?: null } = {}) {
  const audits: string[] = [];
  const links: Array<{ feedbackId: string; roadmapItemId: string }> = [];
  const updates: Array<Record<string, unknown>> = [];

  const client = {
    feedbackClusterSuggestion: {
      findUnique: async () =>
        overrides.suggestion === null
          ? null
          : {
              feedbackIds: ["f1", "f2"],
              id: "suggestion-1",
              status: overrides.status ?? "PENDING",
              topic: "BUG",
            },
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return {};
      },
    },
  } as unknown as ClusterServiceStore;

  const dependencies: ClusterSuggestionDependencies = {
    linkFeedbackToRoadmapItem: async (feedbackId, roadmapItemId) => {
      links.push({ feedbackId, roadmapItemId });
      return {};
    },
    writeAuditLog: async (args) => {
      audits.push(args.action);
    },
  };

  return { audits, client, dependencies, links, updates };
}

describe("cluster acceptance", () => {
  it("links every member through the existing feedback update path", async () => {
    const { audits, client, dependencies, links, updates } = harness();

    const result = await acceptClusterSuggestion(
      {
        adminUserId: "admin-1",
        roadmapItemId: "roadmap-1",
        suggestionId: "suggestion-1",
      },
      client,
      dependencies,
    );

    assert.deepEqual(links, [
      { feedbackId: "f1", roadmapItemId: "roadmap-1" },
      { feedbackId: "f2", roadmapItemId: "roadmap-1" },
    ]);
    assert.equal(result.linkedCount, 2);
    assert.equal(updates[0]?.status, "ACCEPTED");
    assert.deepEqual(audits, ["feedback.cluster.accept"]);
  });

  it("rejects without touching a single feedback row", async () => {
    const { audits, client, dependencies, links, updates } = harness();

    await rejectClusterSuggestion(
      { adminUserId: "admin-1", suggestionId: "suggestion-1" },
      client,
      dependencies,
    );

    assert.deepEqual(links, [], "a rejected proposal must change nothing");
    assert.equal(updates[0]?.status, "REJECTED");
    assert.deepEqual(audits, ["feedback.cluster.reject"]);
  });

  it("refuses to resolve the same suggestion twice", async () => {
    const { client, dependencies, links } = harness({ status: "ACCEPTED" });

    await assert.rejects(
      () =>
        acceptClusterSuggestion(
          { adminUserId: "admin-1", roadmapItemId: "roadmap-1", suggestionId: "suggestion-1" },
          client,
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    );
    assert.deepEqual(links, []);
  });

  it("reports an unknown suggestion as not found", async () => {
    const { client, dependencies } = harness({ suggestion: null });

    await assert.rejects(
      () =>
        rejectClusterSuggestion(
          { adminUserId: "admin-1", suggestionId: "ghost" },
          client,
          dependencies,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });
});
