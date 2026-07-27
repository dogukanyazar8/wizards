import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashAnalyticsValue } from "@/lib/analytics/client-info";
import {
  buildAdminAuditLogEntry,
  canBootstrapAdminFromEnvironment,
  isProductionAdminBootstrapEnvironment,
} from "./access";

describe("admin audit trail", () => {
  it("records the hashed caller address alongside the user agent", () => {
    const entry = buildAdminAuditLogEntry({
      action: "user.ban",
      adminUserId: "admin-1",
      headers: new Headers({
        "user-agent": "Mozilla/5.0 (Windows NT 10.0)",
        "x-forwarded-for": "203.0.113.10, 70.41.3.18",
      }),
      targetId: "user-2",
      targetType: "User",
    });

    assert.equal(entry.ipHash, hashAnalyticsValue("203.0.113.10"));
    assert.equal(entry.userAgentHash, hashAnalyticsValue("Mozilla/5.0 (Windows NT 10.0)"));
    assert.notEqual(entry.ipHash, "203.0.113.10");
  });

  it("reads the same headers from a plain record", () => {
    const entry = buildAdminAuditLogEntry({
      action: "user.ban",
      headers: { "cf-connecting-ip": "198.51.100.7", "user-agent": "curl/8.6.0" },
    });

    assert.equal(entry.ipHash, hashAnalyticsValue("198.51.100.7"));
    assert.equal(entry.adminUserId, null);
  });

  it("leaves both hashes empty when the call carries no headers", () => {
    const entry = buildAdminAuditLogEntry({ action: "admin.bootstrap.grant" });

    assert.equal(entry.ipHash, null);
    assert.equal(entry.userAgentHash, null);
  });
});

describe("admin bootstrap access", () => {
  it("allows environment bootstrap only outside production environments", () => {
    assert.equal(
      canBootstrapAdminFromEnvironment("owner@example.com", {
        NODE_ENV: "development",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      true,
    );

    assert.equal(
      canBootstrapAdminFromEnvironment("owner@example.com", {
        NODE_ENV: "production",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      false,
    );

    assert.equal(
      canBootstrapAdminFromEnvironment("owner@example.com", {
        NODE_ENV: "test",
        RAILWAY_ENVIRONMENT_NAME: "production",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      false,
    );
  });

  it("does not bootstrap users that are not explicitly listed", () => {
    assert.equal(
      canBootstrapAdminFromEnvironment("member@example.com", {
        NODE_ENV: "development",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      false,
    );
  });

  it("detects production through NODE_ENV or Railway environment name", () => {
    assert.equal(isProductionAdminBootstrapEnvironment({ NODE_ENV: "production" }), true);
    assert.equal(
      isProductionAdminBootstrapEnvironment({
        NODE_ENV: "test",
        RAILWAY_ENVIRONMENT_NAME: "production",
      }),
      true,
    );
    assert.equal(isProductionAdminBootstrapEnvironment({ NODE_ENV: "test" }), false);
  });
});
