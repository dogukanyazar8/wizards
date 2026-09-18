import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicationClaims } from "./publication-auth";

const configuration = {
  repository: "owner/whispr",
  repositoryId: "10",
  ownerId: "20",
  channel: "UAT" as const,
  audience: "https://example.test/release-publication",
};
const scope = { product: "DESKTOP" as const, channel: "UAT" as const };
const claims = {
  repository: "owner/whispr",
  repository_id: "10",
  repository_owner_id: "20",
  ref: "refs/heads/uat",
  workflow_ref: "owner/whispr/.github/workflows/desktop-release.yml@refs/heads/uat",
  environment: "desktop-uat",
  event_name: "workflow_dispatch",
  sha: "a".repeat(40),
  run_id: "123",
};

test("OIDC claims bind repository IDs, workflow, environment, branch and channel", () => {
  assert.doesNotThrow(() => assertPublicationClaims(claims, scope, configuration));
  for (const patch of [
    { repository_id: "11" },
    { repository_owner_id: "21" },
    { ref: "refs/heads/main" },
    { workflow_ref: "owner/whispr/.github/workflows/evil.yml@refs/heads/uat" },
    { environment: "desktop-stable" },
    { event_name: "pull_request" },
  ]) {
    assert.throws(() => assertPublicationClaims({ ...claims, ...patch }, scope, configuration));
  }
  assert.throws(() =>
    assertPublicationClaims(claims, { ...scope, channel: "STABLE" }, configuration),
  );
});
