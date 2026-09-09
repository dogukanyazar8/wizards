import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiscoverServer } from "@wizards/types";

import {
  createServerJoinSelection,
  readServerJoinClipboard,
  reconcileServerJoinOptions,
  selectServerJoinOption,
  submitServerJoinSelection,
  updateServerJoinCode,
} from "./server-join-modal";

function server(id: string): DiscoverServer {
  return {
    category: "is",
    description: "Girişim topluluğu",
    featured: false,
    iconColor: null,
    iconUrl: null,
    id,
    initials: "STA",
    joined: false,
    languages: ["tr"],
    memberCount: 31_500,
    name: "Startup Türkiye",
    onlineCount: 2_140,
    tags: ["girişim"],
  };
}

describe("ServerJoinModal selection", () => {
  it("clears the radio when code is entered and clears code when a radio is selected", () => {
    const initial = createServerJoinSelection([server("server-1"), server("server-2")]);

    const withCode = updateServerJoinCode(initial, "abc12345");
    assert.deepEqual(withCode, { code: "abc12345", selectedServerId: null });

    const withRadio = selectServerJoinOption(withCode, "server-2");
    assert.deepEqual(withRadio, { code: "", selectedServerId: "server-2" });
  });

  it("normalizes a full invite URL to only its code", () => {
    const next = updateServerJoinCode(
      createServerJoinSelection([server("server-1")]),
      "https://whispr.app/invite/abc12345",
    );

    assert.equal(next.code, "abc12345");
    assert.equal(next.selectedServerId, null);
  });

  it("has no directory selection when every server is already joined", () => {
    assert.deepEqual(createServerJoinSelection([]), { code: "", selectedServerId: null });
  });

  it("selects the first option when directory data arrives after the modal opens", () => {
    assert.deepEqual(
      reconcileServerJoinOptions({ code: "", selectedServerId: null }, [server("server-1")]),
      { code: "", selectedServerId: "server-1" },
    );
    assert.deepEqual(
      reconcileServerJoinOptions({ code: "abc12345", selectedServerId: null }, [
        server("server-1"),
      ]),
      { code: "abc12345", selectedServerId: null },
    );
  });

  it("reports clipboard refusal without silently changing selection", async () => {
    const result = await readServerJoinClipboard(async () => {
      throw new Error("NotAllowedError");
    });

    assert.deepEqual(result, { ok: false });
  });
});

describe("ServerJoinModal submission", () => {
  it("keeps the modal state on an invalid code and never calls a mutation", async () => {
    let calls = 0;
    const result = await submitServerJoinSelection(
      { code: "invalid-code", selectedServerId: null },
      {
        joinByCode: async () => {
          calls += 1;
          return { name: "Sunucu", serverId: "server-1" };
        },
        joinByServerId: async () => {
          calls += 1;
          return { name: "Sunucu", serverId: "server-1" };
        },
      },
    );

    assert.deepEqual(result, { reason: "invalid-code", status: "invalid" });
    assert.equal(calls, 0);
  });

  it("returns an error result instead of closing when the join request fails", async () => {
    const failure = new Error("join failed");
    const result = await submitServerJoinSelection(
      { code: "", selectedServerId: "server-1" },
      {
        joinByCode: async () => ({ name: "Sunucu", serverId: "server-1" }),
        joinByServerId: async () => {
          throw failure;
        },
      },
    );

    assert.deepEqual(result, { error: failure, status: "error" });
  });
});
