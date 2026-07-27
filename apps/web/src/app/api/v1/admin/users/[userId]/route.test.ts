import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import { UpdateAdminUserSchema } from "./route";

describe("admin user ban request", () => {
  it("requires a non-blank, bounded audit reason", async () => {
    await assert.rejects(
      () =>
        parseJsonBody(
          new Request("http://localhost/api/v1/admin/users/user-1", {
            body: JSON.stringify({ isBanned: true, reason: "   " }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }),
          UpdateAdminUserSchema,
        ),
      /reason/i,
    );

    const input = await parseJsonBody(
      new Request("http://localhost/api/v1/admin/users/user-1", {
        body: JSON.stringify({ isBanned: false, reason: " İnceleme tamamlandı " }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      }),
      UpdateAdminUserSchema,
    );

    assert.equal(input.reason, "İnceleme tamamlandı");
  });
});
