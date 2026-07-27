import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminAuditSnapshot } from "@/lib/admin/snapshots/audit";
import { AdminAudit, filterAdminAuditLogs, formatAdminAuditIpHash } from "./admin-audit";

const snapshot: AdminAuditSnapshot = {
  recentAuditLogs: [
    {
      action: "user.ban",
      actor: { displayName: "Ada", id: "user-ada", username: "ada" },
      createdAt: "2026-07-27T10:00:00.000Z",
      id: "audit-user",
      ipHash: "0123456789abcdef",
      targetId: "user-bora",
      targetType: "USER",
    },
    {
      action: "system.cleanup",
      actor: null,
      createdAt: "2026-07-27T09:00:00.000Z",
      id: "audit-system",
      ipHash: null,
      targetId: null,
      targetType: "SYSTEM",
    },
  ],
};

describe("admin audit", () => {
  it("renders the handoff grid and never exposes a complete IP hash", () => {
    const markup = renderToStaticMarkup(<AdminAudit filter="all" snapshot={snapshot} />);

    for (const label of ["Denetim Kaydı", "Tümü", "Kullanıcı", "Güvenlik", "Sistem", "system"]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.match(markup, /grid-template-columns:130px 1\.5fr 1\.7fr 1\.4fr 120px/u);
    assert.match(markup, /0123456789…/u);
    assert.doesNotMatch(markup, /0123456789abcdef/u);
  });

  it("groups action prefixes without hiding system audit rows", () => {
    assert.equal(filterAdminAuditLogs(snapshot.recentAuditLogs, "user").length, 1);
    assert.equal(filterAdminAuditLogs(snapshot.recentAuditLogs, "system").length, 1);
    assert.equal(filterAdminAuditLogs(snapshot.recentAuditLogs, "security").length, 0);
    assert.equal(formatAdminAuditIpHash("0123456789abcdef"), "0123456789…");
    assert.equal(formatAdminAuditIpHash(null), "—");
  });
});
