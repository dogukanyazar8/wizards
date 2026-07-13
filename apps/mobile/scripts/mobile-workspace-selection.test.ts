import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { resolveMobileWorkspaceServerSelection } from "../src/workspace/mobile-workspace-selection";

describe("mobile workspace server selection", () => {
  it("preserves an accessible selected server", () => {
    assert.equal(
      resolveMobileWorkspaceServerSelection("server-b", [{ id: "server-a" }, { id: "server-b" }]),
      "server-b",
    );
  });

  it("falls back to the first accessible server when the selected server disappears", () => {
    assert.equal(
      resolveMobileWorkspaceServerSelection("departed-server", [
        { id: "server-b" },
        { id: "server-a" },
      ]),
      "server-b",
    );
  });

  it("chooses the first accessible server when there is no selection", () => {
    assert.equal(
      resolveMobileWorkspaceServerSelection(null, [{ id: "server-b" }, { id: "server-a" }]),
      "server-b",
    );
  });

  it("returns null when no accessible servers remain", () => {
    assert.equal(resolveMobileWorkspaceServerSelection("server-a", []), null);
  });

  it("does not mutate or sort the input and remains stable with duplicate ids", () => {
    const servers = [{ id: "server-b" }, { id: "server-a" }, { id: "server-b" }] as const;
    const before = [...servers];

    assert.equal(resolveMobileWorkspaceServerSelection("missing", servers), "server-b");
    assert.deepEqual(servers, before);
    assert.equal(resolveMobileWorkspaceServerSelection("server-b", servers), "server-b");
  });

  it("leaves the active voice room before clearing its selection during server reconciliation", async () => {
    const source = await readFile(
      new URL("../src/app/features/use-mobile-messaging-feature.ts", import.meta.url),
      "utf8",
    );
    const reconciliationEffect = source.slice(
      source.indexOf("const resolvedServerId = resolveMobileWorkspaceServerSelection"),
      source.indexOf("const refreshVisibleMobileData"),
    );

    assert.match(reconciliationEffect, /void leaveVoiceChannel\(\)/);
    assert.match(reconciliationEffect, /setActiveWorkspaceVoiceChannelId\(null\)/);
    assert.ok(
      reconciliationEffect.indexOf("void leaveVoiceChannel()") <
        reconciliationEffect.indexOf("setActiveWorkspaceVoiceChannelId(null)"),
      "server reconciliation must leave the actual voice room before hiding its local selection",
    );
  });
});
